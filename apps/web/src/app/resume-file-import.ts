import JSZip from "jszip";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits";

export const ResumeImportErrorCode = {
  FileRequired: "RESUME_IMPORT_FILE_REQUIRED",
  FileTooLarge: "RESUME_IMPORT_FILE_TOO_LARGE",
  TypeUnsupported: "RESUME_IMPORT_TYPE_UNSUPPORTED",
  SignatureInvalid: "RESUME_IMPORT_SIGNATURE_INVALID",
  DocxInvalid: "RESUME_IMPORT_DOCX_INVALID",
  DocxTooComplex: "RESUME_IMPORT_DOCX_TOO_COMPLEX",
  PdfInvalid: "RESUME_IMPORT_PDF_INVALID",
  PdfPasswordProtected: "RESUME_IMPORT_PDF_PASSWORD_PROTECTED",
  PdfTooManyPages: "RESUME_IMPORT_PDF_TOO_MANY_PAGES",
  PdfNoText: "RESUME_IMPORT_PDF_NO_TEXT",
  TextTooLarge: "RESUME_IMPORT_TEXT_TOO_LARGE",
  Failed: "RESUME_IMPORT_FAILED",
} as const;

export type ResumeImportErrorCode = (typeof ResumeImportErrorCode)[keyof typeof ResumeImportErrorCode];

export const ResumeImportWarningCode = {
  TextExceedsAnalysisLimit: "RESUME_IMPORT_TEXT_EXCEEDS_ANALYSIS_LIMIT",
  PdfLayoutOrderMayVary: "RESUME_IMPORT_PDF_LAYOUT_ORDER_MAY_VARY",
  VisualFormattingNotPreserved: "RESUME_IMPORT_VISUAL_FORMATTING_NOT_PRESERVED",
} as const;

export type ResumeImportWarningCode =
  (typeof ResumeImportWarningCode)[keyof typeof ResumeImportWarningCode];

export type ResumeImportSource = "manual" | "docx" | "pdf";

export type ResumeImportResult = Readonly<{
  source: Exclude<ResumeImportSource, "manual">;
  text: string;
  warnings: readonly ResumeImportWarningCode[];
}>;

export type ResumeImportFileLike = Readonly<{
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

type PdfTextItem = {
  str: string;
  transform?: readonly number[];
};

type PdfPageLike = {
  getTextContent: () => Promise<{ items: readonly PdfTextItem[] }>;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
};

export type PdfLoader = (data: Uint8Array) => Promise<PdfDocumentLike>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";
const PDF_TEXT_LINE_TOLERANCE = 2.5;

export async function importResumeFile(file: ResumeImportFileLike): Promise<ResumeImportResult> {
  const source = getResumeImportSource(file);
  const bytes = await readResumeImportBytes(file, source);
  if (source === "docx") {
    return extractDocxResumeText(bytes);
  }
  return extractPdfResumeText(bytes);
}

export function getResumeImportSource(file: ResumeImportFileLike | null | undefined): Exclude<ResumeImportSource, "manual"> {
  if (file === null || file === undefined) {
    throw new ResumeImportError(ResumeImportErrorCode.FileRequired);
  }
  if (file.size <= 0) {
    throw new ResumeImportError(ResumeImportErrorCode.SignatureInvalid);
  }
  if (file.size > TAILORING_DEMO_LIMITS.resumeImportFileMaxBytes) {
    throw new ResumeImportError(ResumeImportErrorCode.FileTooLarge);
  }

  const extension = getLowercaseExtension(file.name);
  if (extension === ".doc" || extension === ".docm" || extension === ".rtf" || extension === ".txt") {
    throw new ResumeImportError(ResumeImportErrorCode.TypeUnsupported);
  }
  if (extension !== ".docx" && extension !== ".pdf") {
    throw new ResumeImportError(ResumeImportErrorCode.TypeUnsupported);
  }
  if (file.type !== "" && extension === ".docx" && file.type !== DOCX_MIME) {
    throw new ResumeImportError(ResumeImportErrorCode.TypeUnsupported);
  }
  if (file.type !== "" && extension === ".pdf" && file.type !== PDF_MIME) {
    throw new ResumeImportError(ResumeImportErrorCode.TypeUnsupported);
  }

  return extension === ".docx" ? "docx" : "pdf";
}

export async function readResumeImportBytes(
  file: ResumeImportFileLike,
  source = getResumeImportSource(file),
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new ResumeImportError(ResumeImportErrorCode.SignatureInvalid);
  }
  if (source === "pdf" && !hasPdfSignature(bytes)) {
    throw new ResumeImportError(ResumeImportErrorCode.SignatureInvalid);
  }
  if (source === "docx" && !hasZipSignature(bytes)) {
    throw new ResumeImportError(ResumeImportErrorCode.SignatureInvalid);
  }
  return bytes;
}

export async function extractDocxResumeText(bytes: Uint8Array): Promise<ResumeImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ResumeImportError(ResumeImportErrorCode.DocxInvalid);
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > TAILORING_DEMO_LIMITS.resumeImportDocxMaxEntries) {
    throw new ResumeImportError(ResumeImportErrorCode.DocxTooComplex);
  }
  if (zip.file("[Content_Types].xml") === null || zip.file("word/document.xml") === null) {
    throw new ResumeImportError(ResumeImportErrorCode.DocxInvalid);
  }

  const xmlParts = await readDocxXmlParts(zip);
  const text = normalizeExtractedText(xmlParts.map(extractTextFromWordXml).join("\n\n"));
  return buildImportResult("docx", text, [ResumeImportWarningCode.VisualFormattingNotPreserved]);
}

export async function extractPdfResumeText(
  bytes: Uint8Array,
  pdfLoader: PdfLoader = loadPdfDocument,
): Promise<ResumeImportResult> {
  let pdf: PdfDocumentLike | null = null;
  try {
    pdf = await pdfLoader(bytes);
    if (pdf.numPages > TAILORING_DEMO_LIMITS.resumeImportPdfMaxPages) {
      throw new ResumeImportError(ResumeImportErrorCode.PdfTooManyPages);
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(extractPdfPageText(content.items));
    }

    const text = normalizeExtractedText(pages.join("\n\n"));
    return buildImportResult("pdf", text, [
      ResumeImportWarningCode.VisualFormattingNotPreserved,
      ResumeImportWarningCode.PdfLayoutOrderMayVary,
    ]);
  } catch (error) {
    if (error instanceof ResumeImportError) {
      throw error;
    }
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("password")) {
      throw new ResumeImportError(ResumeImportErrorCode.PdfPasswordProtected);
    }
    throw new ResumeImportError(ResumeImportErrorCode.PdfInvalid);
  } finally {
    await pdf?.destroy?.();
  }
}

export function getResumeImportErrorMessage(errorCode: ResumeImportErrorCode): string {
  const messages: Record<ResumeImportErrorCode, string> = {
    RESUME_IMPORT_FILE_REQUIRED: "Selecciona un archivo DOCX o PDF.",
    RESUME_IMPORT_FILE_TOO_LARGE: "El archivo supera el límite de 8 MiB.",
    RESUME_IMPORT_TYPE_UNSUPPORTED: "Formato no compatible. Usa DOCX o PDF con texto seleccionable.",
    RESUME_IMPORT_SIGNATURE_INVALID: "El archivo no coincide con un DOCX o PDF válido.",
    RESUME_IMPORT_DOCX_INVALID: "No se pudo leer el DOCX. Comprueba que sea un archivo DOCX válido.",
    RESUME_IMPORT_DOCX_TOO_COMPLEX: "El DOCX supera los límites de complejidad de esta demo.",
    RESUME_IMPORT_PDF_INVALID: "No se pudo leer el PDF. Comprueba que no esté dañado.",
    RESUME_IMPORT_PDF_PASSWORD_PROTECTED: "No se puede importar un PDF protegido con contraseña.",
    RESUME_IMPORT_PDF_TOO_MANY_PAGES: "El PDF supera el límite de 50 páginas.",
    RESUME_IMPORT_PDF_NO_TEXT: "No se encontró texto seleccionable en el PDF. Esta versión no incluye OCR. Puedes pegar el contenido manualmente o utilizar otro archivo.",
    RESUME_IMPORT_TEXT_TOO_LARGE: "El texto extraído supera el límite de seguridad de esta demo.",
    RESUME_IMPORT_FAILED: "No se pudo importar el archivo. Puedes seleccionar otro archivo o pegar el texto manualmente.",
  };
  return messages[errorCode];
}

export function getResumeImportWarningMessage(warningCode: ResumeImportWarningCode): string {
  const messages: Record<ResumeImportWarningCode, string> = {
    RESUME_IMPORT_TEXT_EXCEEDS_ANALYSIS_LIMIT: "El texto extraído queda editable, pero debes reducirlo por debajo de 24.000 caracteres antes de continuar.",
    RESUME_IMPORT_PDF_LAYOUT_ORDER_MAY_VARY: "En PDFs con columnas, tablas o diseños complejos, el orden del texto puede variar.",
    RESUME_IMPORT_VISUAL_FORMATTING_NOT_PRESERVED: "Se extrae solo el texto. El formato visual, imágenes e iconos no se conservan.",
  };
  return messages[warningCode];
}

export class ResumeImportError extends Error {
  readonly code: ResumeImportErrorCode;

  constructor(code: ResumeImportErrorCode) {
    super(code);
    this.name = "ResumeImportError";
    this.code = code;
  }
}

async function loadPdfDocument(bytes: Uint8Array): Promise<PdfDocumentLike> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs.getDocument({
    data: bytes.slice(),
    useWorkerFetch: false,
  }).promise as Promise<PdfDocumentLike>;
}

async function readDocxXmlParts(zip: JSZip): Promise<string[]> {
  const parts: string[] = [];
  const documentXml = await readXmlEntry(zip, "word/document.xml");
  parts.push(documentXml);

  const rels = zip.file("word/_rels/document.xml.rels");
  if (rels !== null) {
    const relationshipXml = await readXmlEntry(zip, "word/_rels/document.xml.rels");
    for (const target of extractHeaderFooterTargets(relationshipXml)) {
      const normalizedTarget = target.startsWith("word/") ? target : `word/${target.replace(/^\//u, "")}`;
      const xml = await readXmlEntry(zip, normalizedTarget);
      if (!parts.includes(xml)) {
        parts.push(xml);
      }
    }
  }

  return parts;
}

async function readXmlEntry(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (entry === null) {
    throw new ResumeImportError(ResumeImportErrorCode.DocxInvalid);
  }
  const xml = await entry.async("string");
  if (new Blob([xml]).size > TAILORING_DEMO_LIMITS.resumeImportDocxMaxXmlBytes) {
    throw new ResumeImportError(ResumeImportErrorCode.DocxTooComplex);
  }
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA/iu.test(xml)) {
    throw new ResumeImportError(ResumeImportErrorCode.DocxInvalid);
  }
  return xml;
}

function extractHeaderFooterTargets(relsXml: string): string[] {
  const targets: string[] = [];
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/giu)) {
    const tag = match[0];
    const type = getXmlAttribute(tag, "Type");
    if (type === null || (!type.endsWith("/header") && !type.endsWith("/footer"))) {
      continue;
    }
    const target = getXmlAttribute(tag, "Target");
    if (target !== null && !target.includes("://") && !target.startsWith("..")) {
      targets.push(target);
    }
  }
  return targets;
}

function extractTextFromWordXml(xml: string): string {
  const paragraphs = Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/giu), (match) => match[0]);
  return paragraphs
    .map((paragraph) => {
      const text = extractInlineWordText(paragraph);
      if (text.length === 0) {
        return "";
      }
      return /<w:numPr\b|<w:ilvl\b|<w:numId\b/iu.test(paragraph) ? `- ${text}` : text;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

function extractInlineWordText(xml: string): string {
  const tokens: string[] = [];
  const pattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>/giu;
  for (const match of xml.matchAll(pattern)) {
    if (match[1] !== undefined) {
      tokens.push(decodeXmlText(match[1]));
    } else if (match[0].includes("tab")) {
      tokens.push("\t");
    } else {
      tokens.push("\n");
    }
  }
  return tokens.join("").replace(/[ \t]+\n/gu, "\n").trim();
}

function extractPdfPageText(items: readonly PdfTextItem[]): string {
  const positioned = items
    .filter((item) => item.str.trim().length > 0)
    .map((item, index) => ({
      text: item.str,
      index,
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? -index,
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x || left.index - right.index);

  const lines: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= PDF_TEXT_LINE_TOLERANCE);
    if (line === undefined) {
      lines.push({ y: item.y, items: [item] });
    } else {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    }
  }

  return lines
    .map((line) => line.items.sort((left, right) => left.x - right.x || left.index - right.index).map((item) => item.text).join(" "))
    .join("\n");
}

function buildImportResult(
  source: Exclude<ResumeImportSource, "manual">,
  text: string,
  baseWarnings: readonly ResumeImportWarningCode[],
): ResumeImportResult {
  if (text.trim().length === 0) {
    throw new ResumeImportError(source === "pdf" ? ResumeImportErrorCode.PdfNoText : ResumeImportErrorCode.DocxInvalid);
  }
  if (text.length > TAILORING_DEMO_LIMITS.resumeImportRawTextMaxLength) {
    throw new ResumeImportError(ResumeImportErrorCode.TextTooLarge);
  }
  const warnings = new Set(baseWarnings);
  if (text.length > TAILORING_DEMO_LIMITS.resumeTextMaxLength) {
    warnings.add(ResumeImportWarningCode.TextExceedsAnalysisLimit);
  }
  return deepFreeze({ source, text, warnings: Array.from(warnings).sort(compareStable) });
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function decodeXmlText(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/giu, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return "\"";
    if (entity === "&apos;") return "'";
    if (entity.startsWith("&#x") || entity.startsWith("&#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16));
    }
    if (entity.startsWith("&#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10));
    }
    return entity;
  });
}

function getXmlAttribute(tag: string, attribute: string): string | null {
  const match = new RegExp(`\\b${attribute}="([^"]*)"`, "iu").exec(tag);
  return match?.[1] ?? null;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function getLowercaseExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
