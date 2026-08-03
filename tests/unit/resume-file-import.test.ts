import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";

const importModulePath = "../../apps/web/src/app/resume-file-import";
const stateModulePath = "../../apps/web/src/app/tailoring-demo-state";
const resumeStagePath = "../../apps/web/src/components/stages/ResumeStage";

const validResume = "Experiencia React y TypeScript";
const validJob = "- React y TypeScript";

describe("local resume file import", () => {
  let ResumeImportErrorCode: any;
  let ResumeImportWarningCode: any;
  let ResumeImportError: any;
  let extractDocxResumeText: (bytes: Uint8Array) => Promise<any>;
  let extractPdfResumeText: (bytes: Uint8Array, loader?: any) => Promise<any>;
  let getResumeImportErrorMessage: (code: string) => string;
  let getResumeImportSource: (file: any) => "docx" | "pdf";
  let importResumeFile: (file: any) => Promise<any>;
  let readResumeImportBytes: (file: any, source?: "docx" | "pdf") => Promise<Uint8Array>;
  let createTailoringDemoState: () => any;
  let tailoringDemoReducer: (state: any, action: any) => any;
  let ResumeStage: React.ComponentType<any>;

  beforeAll(async () => {
    ({
      ResumeImportErrorCode,
      ResumeImportWarningCode,
      ResumeImportError,
      extractDocxResumeText,
      extractPdfResumeText,
      getResumeImportErrorMessage,
      getResumeImportSource,
      importResumeFile,
      readResumeImportBytes,
    } = await import(importModulePath));
    ({ createTailoringDemoState, tailoringDemoReducer } = await import(stateModulePath));
    ({ ResumeStage } = await import(resumeStagePath));
  });

  it("creates an idle immutable import state in the demo state", () => {
    const state = createTailoringDemoState();

    expect(state.resumeImport).toEqual({ status: "idle", source: "manual", warnings: [], errorCode: null });
    expect(Object.isFrozen(state.resumeImport)).toBe(true);
  });

  it("moves through reading, ready, error and cleared states without binary data", () => {
    let state = createTailoringDemoState();
    state = tailoringDemoReducer(state, { type: "resume_import_started", source: "docx" });
    expect(state.resumeImport).toMatchObject({ status: "reading", source: "docx" });

    state = tailoringDemoReducer(state, {
      type: "resume_import_succeeded",
      source: "docx",
      text: validResume,
      warnings: [ResumeImportWarningCode.VisualFormattingNotPreserved],
    });
    expect(state.resumeText).toBe(validResume);
    expect(state.resumeImport.status).toBe("ready");
    expect(JSON.stringify(state.resumeImport)).not.toMatch(/ArrayBuffer|Blob|Uint8Array|File/);

    state = tailoringDemoReducer(state, {
      type: "resume_import_failed",
      source: "pdf",
      errorCode: ResumeImportErrorCode.PdfNoText,
    });
    expect(state.resumeImport).toMatchObject({ status: "error", source: "pdf" });

    state = tailoringDemoReducer(state, { type: "resume_import_cleared" });
    expect(state.resumeText).toBe("");
    expect(state.resumeImport.status).toBe("idle");
  });

  it("import success invalidates derived analysis and DOCX state", () => {
    let state = analyzedState();
    expect(state.analysis).not.toBeNull();

    state = tailoringDemoReducer(state, {
      type: "resume_import_succeeded",
      source: "pdf",
      text: `${validResume}\nImportado desde PDF`,
      warnings: [],
    });

    expect(state.resumeText).toContain("Importado desde PDF");
    expect(state.analysis).toBeNull();
    expect(state.reviewDecisions).toEqual({});
    expect(state.appliedResult).toBeNull();
    expect(state.docx.status).toBe("idle");
  });

  it("manual edit after import remains editable and invalidates derived results", () => {
    let state = createTailoringDemoState();
    state = tailoringDemoReducer(state, {
      type: "resume_import_succeeded",
      source: "docx",
      text: validResume,
      warnings: [],
    });
    state = tailoringDemoReducer(state, { type: "set_job_text", value: validJob });
    state = tailoringDemoReducer(state, { type: "run_analysis" });
    expect(state.analysis).not.toBeNull();

    state = tailoringDemoReducer(state, { type: "set_resume_text", value: `${validResume}\nCorrección manual` });
    expect(state.resumeText).toContain("Corrección manual");
    expect(state.analysis).toBeNull();
    expect(state.resumeImport.status).toBe("ready");
  });

  it("reset clears import metadata and invalid actions keep the stable reducer error", () => {
    let state = tailoringDemoReducer(createTailoringDemoState(), {
      type: "resume_import_succeeded",
      source: "docx",
      text: validResume,
      warnings: [],
    });
    state = tailoringDemoReducer(state, { type: "reset_demo" });
    expect(state.resumeImport.status).toBe("idle");
    expect(() => tailoringDemoReducer(state, { type: "resume_import_unknown" } as never)).toThrow(
      "TAILORING_DEMO_ACTION_INVALID",
    );
  });

  it("accepts frozen reducer input without mutation", () => {
    const state = Object.freeze(createTailoringDemoState());
    const next = tailoringDemoReducer(state, { type: "resume_import_started", source: "pdf" });

    expect(state.resumeImport.status).toBe("idle");
    expect(next.resumeImport.status).toBe("reading");
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("validates supported extensions, optional MIME and file signatures", async () => {
    const docx = await syntheticDocx();
    const pdf = bytes("%PDF-1.7\n");

    expect(getResumeImportSource(fileLike("cv.docx", "", docx))).toBe("docx");
    expect(getResumeImportSource(fileLike("cv.pdf", "", pdf))).toBe("pdf");
    await expect(readResumeImportBytes(fileLike("cv.pdf", "application/pdf", pdf))).resolves.toEqual(pdf);
    await expect(readResumeImportBytes(fileLike("cv.pdf", "application/pdf", bytes("not pdf")))).rejects.toMatchObject({
      code: ResumeImportErrorCode.SignatureInvalid,
    });
  });

  it("rejects unsupported, renamed, empty and oversized files", async () => {
    expect(() => getResumeImportSource(fileLike("cv.doc", "", bytes("x")))).toThrow(ResumeImportErrorCode.TypeUnsupported);
    expect(() => getResumeImportSource(fileLike("cv.docm", "", bytes("x")))).toThrow(ResumeImportErrorCode.TypeUnsupported);
    expect(() => getResumeImportSource(fileLike("cv.html", "application/pdf", bytes("x")))).toThrow(
      ResumeImportErrorCode.TypeUnsupported,
    );
    expect(() => getResumeImportSource(fileLike("cv.pdf", "text/plain", bytes("%PDF-")))).toThrow(
      ResumeImportErrorCode.TypeUnsupported,
    );
    expect(() => getResumeImportSource(fileLike("cv.pdf", "", new Uint8Array()))).toThrow(
      ResumeImportErrorCode.SignatureInvalid,
    );
    expect(() => getResumeImportSource(fileLike("cv.pdf", "", new Uint8Array(8 * 1024 * 1024 + 1)))).toThrow(
      ResumeImportErrorCode.FileTooLarge,
    );
  });

  it("extracts DOCX paragraphs, tables, Unicode, escaped XML, tabs and line breaks", async () => {
    const result = await extractDocxResumeText(await syntheticDocx({
      body: [
        paragraph("Lideré React &amp; TypeScript"),
        paragraph("Tabla", "Celda con acento"),
        paragraph("Tab", '<w:t>Uno</w:t><w:tab/><w:t>Dos</w:t><w:br/><w:t>Tres</w:t>'),
      ].join(""),
    }));

    expect(result.source).toBe("docx");
    expect(result.text).toContain("Lideré React & TypeScript");
    expect(result.text).toContain("Celda con acento");
    expect(result.text).toContain("Uno\tDos\nTres");
    expect(result.warnings).toContain(ResumeImportWarningCode.VisualFormattingNotPreserved);
  });

  it("extracts referenced DOCX headers and footers once in deterministic order", async () => {
    const result = await extractDocxResumeText(await syntheticDocx({
      rels: true,
      header: paragraph("Encabezado sintético"),
      footer: paragraph("Pie sintético"),
    }));

    expect(result.text).toContain("Cuerpo principal");
    expect(result.text).toContain("Encabezado sintético");
    expect(result.text).toContain("Pie sintético");
    expect(result.text.match(/Encabezado sintético/gu)).toHaveLength(1);
  });

  it("adds a neutral bullet prefix for DOCX numbered paragraphs", async () => {
    const result = await extractDocxResumeText(await syntheticDocx({
      body: '<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Elemento de lista</w:t></w:r></w:p>',
    }));

    expect(result.text).toBe("- Elemento de lista");
  });

  it("rejects invalid, generic or unsafe DOCX archives", async () => {
    const genericZip = new JSZip();
    genericZip.file("hello.txt", "hello");
    const genericBytes = await genericZip.generateAsync({ type: "uint8array" });

    await expect(extractDocxResumeText(genericBytes)).rejects.toMatchObject({ code: ResumeImportErrorCode.DocxInvalid });
    await expect(extractDocxResumeText(await syntheticDocx({ body: "<!DOCTYPE x>" }))).rejects.toMatchObject({
      code: ResumeImportErrorCode.DocxInvalid,
    });

    const complex = new JSZip();
    complex.file("[Content_Types].xml", "<Types/>");
    complex.file("word/document.xml", documentXml(paragraph("Texto")));
    for (let index = 0; index < 201; index += 1) {
      complex.file(`word/extra-${index}.xml`, "<x/>");
    }
    await expect(extractDocxResumeText(await complex.generateAsync({ type: "uint8array" }))).rejects.toMatchObject({
      code: ResumeImportErrorCode.DocxTooComplex,
    });
  });

  it("extracts PDF pages, groups lines deterministically, preserves Unicode and destroys resources", async () => {
    const destroyed: string[] = [];
    const result = await extractPdfResumeText(bytes("%PDF-1.7"), async () => ({
      numPages: 2,
      getPage: async (pageNumber: number) => ({
        getTextContent: async () => ({
          items: pageNumber === 1
            ? [
                { str: "React", transform: [1, 0, 0, 1, 10, 700] },
                { str: "TypeScript", transform: [1, 0, 0, 1, 80, 700] },
              ]
            : [{ str: "Página dos con acento", transform: [1, 0, 0, 1, 10, 690] }],
        }),
      }),
      destroy: async () => {
        destroyed.push("done");
      },
    }));

    expect(result.source).toBe("pdf");
    expect(result.text).toBe("React TypeScript\n\nPágina dos con acento");
    expect(result.warnings).toContain(ResumeImportWarningCode.PdfLayoutOrderMayVary);
    expect(destroyed).toEqual(["done"]);
  });

  it("classifies PDF no-text, too-many-pages, password and invalid errors safely", async () => {
    await expect(extractPdfResumeText(bytes("%PDF-1.7"), async () => ({
      numPages: 1,
      getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
    }))).rejects.toMatchObject({ code: ResumeImportErrorCode.PdfNoText });

    await expect(extractPdfResumeText(bytes("%PDF-1.7"), async () => ({
      numPages: 51,
      getPage: async () => ({ getTextContent: async () => ({ items: [] }) }),
    }))).rejects.toMatchObject({ code: ResumeImportErrorCode.PdfTooManyPages });

    await expect(extractPdfResumeText(bytes("%PDF-1.7"), async () => {
      throw new Error("Password required");
    })).rejects.toMatchObject({ code: ResumeImportErrorCode.PdfPasswordProtected });

    await expect(extractPdfResumeText(bytes("%PDF-1.7"), async () => {
      throw new Error("xref broken");
    })).rejects.toMatchObject({ code: ResumeImportErrorCode.PdfInvalid });
  });

  it("loads imported text through the canonical resumeText path", async () => {
    const result = await importResumeFile(fileLike("cv.docx", "", await syntheticDocx()));
    const state = tailoringDemoReducer(createTailoringDemoState(), {
      type: "resume_import_succeeded",
      source: result.source,
      text: result.text,
      warnings: result.warnings,
    });

    expect(state.resumeText).toContain("Cuerpo principal");
    expect(state).not.toHaveProperty("importedResumeText");
    expect(state).not.toHaveProperty("parsedFileResume");
  });

  it("keeps visible errors safe and free of names, content, stacks or local paths", () => {
    const message = getResumeImportErrorMessage(ResumeImportErrorCode.PdfNoText);

    expect(message).toContain("no incluye OCR");
    expect(message).not.toMatch(/C:[\\/]|AppData|at |React|TypeScript|cv\.pdf/);
  });

  it("renders accessible import UI while keeping the textarea visible", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ResumeStage, {
        state: createTailoringDemoState(),
        dispatch: () => undefined,
        textareaRef: { current: null },
        onFileSelected: () => undefined,
        onClearImport: () => undefined,
      }),
    );

    expect(markup).toContain("Importar currículum");
    expect(markup).toContain("No se almacena ni se envía");
    expect(markup).toContain("no hay OCR");
    expect(markup).toContain('type="file"');
    expect(markup).toContain(".docx,.pdf,application/pdf");
    expect(markup).toContain("<textarea");
  });

  it("keeps import modules free of storage, network, OCR, LLM, logs, timestamps and local paths", () => {
    const source = [
      "apps/web/src/app/resume-file-import.ts",
      "apps/web/src/app/use-tailoring-demo-controller.ts",
      "apps/web/src/app/tailoring-demo-state.ts",
      "apps/web/src/components/stages/ResumeStage.tsx",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");

    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|XMLHttpRequest|sendBeacon/);
    expect(source).not.toMatch(/OpenAI|Anthropic|Gemini|Tesseract|OCR engine|console\.log\(.*resume|console\.log\(.*file/);
    expect(source).not.toMatch(/Date\.now|Math\.random|randomUUID|C:[\\/]|AppData/);
    expect(source).not.toContain("chromium_headless_shell");
  });
});

function analyzedState() {
  let state = createTailoringDemoStateRef();
  state = reducerRef(state, { type: "set_resume_text", value: validResume });
  state = reducerRef(state, { type: "set_job_text", value: validJob });
  return reducerRef(state, { type: "run_analysis" });
}

let createTailoringDemoStateRef: () => any;
let reducerRef: (state: any, action: any) => any;

beforeAll(async () => {
  ({ createTailoringDemoState: createTailoringDemoStateRef, tailoringDemoReducer: reducerRef } = await import(
    stateModulePath
  ));
});

function fileLike(name: string, type: string, data: Uint8Array) {
  return {
    name,
    type,
    size: data.byteLength,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
}

async function syntheticDocx({
  body = paragraph("Cuerpo principal"),
  rels = false,
  header = "",
  footer = "",
}: {
  body?: string;
  rels?: boolean;
  header?: string;
  footer?: string;
} = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", documentXml(body));
  if (rels) {
    zip.file(
      "word/_rels/document.xml.rels",
      [
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
        "</Relationships>",
      ].join(""),
    );
    zip.file("word/header1.xml", documentXml(header));
    zip.file("word/footer1.xml", documentXml(footer));
  }
  return zip.generateAsync({ type: "uint8array" });
}

function documentXml(body: string): string {
  return `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

function paragraph(...texts: string[]): string {
  return `<w:p>${texts.map((text) => `<w:r><w:t>${text}</w:t></w:r>`).join("")}</w:p>`;
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
