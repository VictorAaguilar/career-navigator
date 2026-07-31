import {
  Document,
  LineRuleType,
  PageOrientation,
  Packer,
  Paragraph,
  Tab,
  TextRun,
  type ParagraphChild,
} from "docx";
import JSZip from "jszip";
import type { ResumeExportBlock, ResumeExportModel } from "../../schemas/export";
import { ResumeExportModelSchema } from "../../schemas/export";
import {
  DOCX_CONTENT_ENCODING,
  DOCX_FILE_EXTENSION,
  DOCX_MIME_TYPE,
  DOCX_RENDER_PROFILE,
  DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1,
  DOCX_RENDER_SCOPE,
  DocxRenderResultSchema,
  buildDocxArtifactId,
  buildDocxSuggestedFilename,
  type DocxRenderResult,
  type DocxRenderSummary,
} from "../../schemas/docx-render";

const FIXED_CORE_TIMESTAMP = "2000-01-01T00:00:00Z";
const FIXED_ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");
const A4_WIDTH_TWIPS = millimetersToTwips(210);
const A4_HEIGHT_TWIPS = millimetersToTwips(297);
const LINE_SPACING_TWIPS = Math.round(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.spacing.lineSpacingMultiple * 240);
const REQUIRED_DOCX_PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/app.xml",
  "docProps/core.xml",
  "word/_rels/document.xml.rels",
  "word/document.xml",
  "word/styles.xml",
] as const;

export const DocxRenderErrorCode = {
  InvalidExportModel: "DOCX_RENDER_INPUT_INVALID_EXPORT_MODEL",
  UnsupportedTextCharacter: "DOCX_RENDER_UNSUPPORTED_TEXT_CHARACTER",
  PackingFailed: "DOCX_RENDER_PACKING_FAILED",
  EmptyOutput: "DOCX_RENDER_EMPTY_OUTPUT",
  InvalidPackage: "DOCX_RENDER_INVALID_PACKAGE",
  OutputInvalid: "DOCX_RENDER_OUTPUT_INVALID",
} as const;

export type DocxRenderErrorCode = (typeof DocxRenderErrorCode)[keyof typeof DocxRenderErrorCode];

export type RenderResumeExportModelToDocxInput = {
  exportModel: ResumeExportModel;
};

export async function renderResumeExportModelToDocx(
  input: RenderResumeExportModelToDocxInput,
): Promise<DocxRenderResult> {
  const exportModel = validateInput(input);
  validateRenderableText(exportModel);

  const packed = await packDocument(exportModel);
  if (packed.length === 0) {
    throwRenderError(DocxRenderErrorCode.EmptyOutput);
  }

  const normalizedPackage = await normalizeDocxPackage(packed);
  const contentBase64 = Buffer.from(normalizedPackage).toString("base64");
  const summary = buildResumeExportModelDocxSummary(exportModel);
  const result = {
    artifactId: buildDocxArtifactId(exportModel.exportModelId, DOCX_RENDER_PROFILE),
    exportModelId: exportModel.exportModelId,
    applicationId: exportModel.applicationId,
    offerId: exportModel.offerId,
    profileId: exportModel.profileId,
    sourceDocumentId: exportModel.sourceDocumentId,
    adaptedDocumentId: exportModel.adaptedDocumentId,
    renderScope: DOCX_RENDER_SCOPE,
    renderProfile: DOCX_RENDER_PROFILE,
    suggestedFilename: buildDocxSuggestedFilename(exportModel.exportModelId, DOCX_RENDER_PROFILE),
    mimeType: DOCX_MIME_TYPE,
    fileExtension: DOCX_FILE_EXTENSION,
    contentEncoding: DOCX_CONTENT_ENCODING,
    contentBase64,
    byteLength: normalizedPackage.length,
    summary,
  };

  const parsed = DocxRenderResultSchema.safeParse(result);
  if (!parsed.success) {
    throwRenderError(DocxRenderErrorCode.OutputInvalid);
  }

  return deepFreeze(parsed.data);
}

export function getRequiredDocxPackageParts(): readonly string[] {
  return REQUIRED_DOCX_PARTS;
}

function validateInput(input: RenderResumeExportModelToDocxInput): ResumeExportModel {
  const result = ResumeExportModelSchema.safeParse(input.exportModel);
  if (!result.success) {
    throwRenderError(DocxRenderErrorCode.InvalidExportModel);
  }
  return result.data;
}

function validateRenderableText(exportModel: ResumeExportModel): void {
  for (const section of exportModel.sections) {
    assertXmlCompatible(section.label);
    for (const block of section.blocks) {
      assertXmlCompatible(block.renderText);
    }
  }
}

async function packDocument(exportModel: ResumeExportModel): Promise<Buffer> {
  try {
    return await Packer.toBuffer(buildResumeExportModelDocxDocument(exportModel));
  } catch {
    throwRenderError(DocxRenderErrorCode.PackingFailed);
  }
}

export function buildResumeExportModelDocxDocument(exportModel: ResumeExportModel): Document {
  const children = exportModel.sections.flatMap((section) => [
    buildSectionHeading(section.label),
    ...section.blocks.map((block) => buildBlockParagraph(block)),
  ]);

  return new Document({
    title: "Adapted Resume",
    subject: "Career Navigator DOCX Export",
    creator: "Career Navigator",
    lastModifiedBy: "Career Navigator",
    revision: 1,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: millimetersToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.page.marginMillimeters.top),
              right: millimetersToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.page.marginMillimeters.right),
              bottom: millimetersToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.page.marginMillimeters.bottom),
              left: millimetersToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.page.marginMillimeters.left),
            },
          },
        },
        children,
      },
    ],
  });
}

function buildSectionHeading(label: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: {
      before: pointsToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.spacing.sectionHeadingBeforePoints),
      after: pointsToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.spacing.sectionHeadingAfterPoints),
      line: LINE_SPACING_TWIPS,
      lineRule: LineRuleType.AUTO,
    },
    children: [
      new TextRun({
        text: label,
        font: DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography.fontFamily,
        size: pointsToHalfPoints(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography.sectionHeadingFontSizePoints),
        bold: DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography.sectionHeadingBold,
      }),
    ],
  });
}

function buildBlockParagraph(block: ResumeExportBlock): Paragraph {
  return new Paragraph({
    spacing: {
      after: pointsToTwips(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.spacing.blockAfterPoints),
      line: LINE_SPACING_TWIPS,
      lineRule: LineRuleType.AUTO,
    },
    children: textRunsFromRenderText(block.renderText),
  });
}

function textRunsFromRenderText(text: string): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  let buffer = "";

  const flushBuffer = (): void => {
    if (buffer.length === 0) {
      return;
    }
    children.push(baseTextRun({ text: buffer }));
    buffer = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\t") {
      flushBuffer();
      children.push(baseTextRun({ children: [new Tab()] }));
      continue;
    }
    if (character === "\r") {
      flushBuffer();
      children.push(baseTextRun({ break: 1 }));
      if (text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }
    if (character === "\n") {
      flushBuffer();
      children.push(baseTextRun({ break: 1 }));
      continue;
    }
    buffer += character;
  }

  flushBuffer();
  return children;
}

function baseTextRun(options: { text?: string; children?: readonly (Tab | string)[]; break?: number }): TextRun {
  return new TextRun({
    ...options,
    font: DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography.fontFamily,
    size: pointsToHalfPoints(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography.baseFontSizePoints),
  });
}

async function normalizeDocxPackage(packed: Buffer): Promise<Uint8Array> {
  const sourceZip = await loadZip(packed);
  ensureRequiredParts(sourceZip);

  const targetZip = new JSZip();
  const paths = Object.keys(sourceZip.files).filter((path) => !sourceZip.files[path].dir).sort(compareStable);

  for (const path of paths) {
    const file = sourceZip.file(path);
    if (file === null) {
      throwRenderError(DocxRenderErrorCode.InvalidPackage);
    }
    const content = path === "docProps/core.xml"
      ? normalizeCoreProperties(await file.async("string"))
      : await file.async("uint8array");
    targetZip.file(path, content, {
      date: FIXED_ZIP_DATE,
      compression: "DEFLATE",
      createFolders: false,
    });
  }

  const normalized = await targetZip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
  });
  ensureZipSignature(normalized);
  ensureRequiredParts(await loadZip(normalized));

  return normalized;
}

async function loadZip(content: Buffer | Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(content);
  } catch {
    throwRenderError(DocxRenderErrorCode.InvalidPackage);
  }
}

function ensureRequiredParts(zip: JSZip): void {
  for (const part of REQUIRED_DOCX_PARTS) {
    if (zip.file(part) === null) {
      throwRenderError(DocxRenderErrorCode.InvalidPackage);
    }
  }
}

function normalizeCoreProperties(xml: string): string {
  return xml
    .replace(
      /<dcterms:created([^>]*)>[\s\S]*?<\/dcterms:created>/,
      `<dcterms:created$1>${FIXED_CORE_TIMESTAMP}</dcterms:created>`,
    )
    .replace(
      /<dcterms:modified([^>]*)>[\s\S]*?<\/dcterms:modified>/,
      `<dcterms:modified$1>${FIXED_CORE_TIMESTAMP}</dcterms:modified>`,
    );
}

function ensureZipSignature(content: Uint8Array): void {
  if (content.length < 4 || content[0] !== 0x50 || content[1] !== 0x4b || content[2] !== 0x03 || content[3] !== 0x04) {
    throwRenderError(DocxRenderErrorCode.InvalidPackage);
  }
}

export function buildResumeExportModelDocxSummary(exportModel: ResumeExportModel): DocxRenderSummary {
  const totalBlocks = exportModel.sections.reduce((count, section) => count + section.blocks.length, 0);
  return {
    totalSections: exportModel.sections.length,
    totalBlocks,
    totalSectionHeadings: exportModel.sections.length,
    totalBlockParagraphs: totalBlocks,
    totalParagraphs: exportModel.sections.length + totalBlocks,
  };
}

function assertXmlCompatible(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint > 0xffff) {
      index += 1;
    }
    if (!isXmlCompatibleCodePoint(codePoint)) {
      throwRenderError(DocxRenderErrorCode.UnsupportedTextCharacter);
    }
  }
}

function isXmlCompatibleCodePoint(codePoint: number): boolean {
  return codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function pointsToHalfPoints(points: number): number {
  return points * 2;
}

function pointsToTwips(points: number): number {
  return points * 20;
}

function millimetersToTwips(millimeters: number): number {
  return Math.round((millimeters * 1440) / 25.4);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwRenderError(code: DocxRenderErrorCode): never {
  throw new Error(code);
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
