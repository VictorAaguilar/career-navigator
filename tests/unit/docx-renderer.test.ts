import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Packer } from "docx";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  DocxRenderErrorCode,
  getRequiredDocxPackageParts,
  renderResumeExportModelToDocx,
  type RenderResumeExportModelToDocxInput,
} from "../../src/core/tailoring";
import {
  DOCX_CONTENT_ENCODING,
  DOCX_FILE_EXTENSION,
  DOCX_MIME_TYPE,
  DOCX_RENDER_PROFILE,
  DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1,
  DOCX_RENDER_SCOPE,
  DocxRenderResultSchema,
  ResumeExportModelSchema,
  buildAdaptedResumeDocumentId,
  buildAppliedRewriteChangeId,
  buildDocxArtifactId,
  buildDocxSuggestedFilename,
  buildResumeExportBlockId,
  buildResumeExportModelId,
  buildResumeExportSectionId,
  buildRewriteApplicationId,
  type DocxRenderResult,
  type ResumeExportModel,
} from "../../src/schemas";

type BlockFixture = {
  blockId: string;
  order: number;
  renderText: string;
  evidenceIds?: string[];
};

type SectionFixture = {
  sectionId: string;
  kind?: "summary" | "experience" | "education" | "skills" | "project" | "certification" | "other";
  label: string;
  order: number;
  blocks: BlockFixture[];
};

const BASE_OFFER_ID = "offer-1";
const BASE_PROFILE_ID = "profile-1";
const BASE_SOURCE_DOCUMENT_ID = "resume-doc";

const makeExportModel = (sections: SectionFixture[] = defaultSections()): ResumeExportModel => {
  const applicationId = buildRewriteApplicationId({
    offerId: BASE_OFFER_ID,
    profileId: BASE_PROFILE_ID,
    sourceDocumentId: BASE_SOURCE_DOCUMENT_ID,
    selectionIds: [],
  });
  const adaptedDocumentId = buildAdaptedResumeDocumentId(applicationId);
  const exportModelId = buildResumeExportModelId(applicationId, adaptedDocumentId);
  const totalBlocks = sections.reduce((count, section) => count + section.blocks.length, 0);
  return ResumeExportModelSchema.parse({
    exportModelId,
    applicationId,
    offerId: BASE_OFFER_ID,
    profileId: BASE_PROFILE_ID,
    sourceDocumentId: BASE_SOURCE_DOCUMENT_ID,
    adaptedDocumentId,
    exportScope: "structured_content_for_future_docx_rendering",
    source: { format: "markdown", fileName: "cv.md" },
    sections: sections.map((section) => ({
      exportSectionId: buildResumeExportSectionId(exportModelId, section.sectionId),
      sectionId: section.sectionId,
      kind: section.kind ?? "experience",
      label: section.label,
      order: section.order,
      blocks: section.blocks.map((block) => ({
        exportBlockId: buildResumeExportBlockId(exportModelId, section.sectionId, block.blockId),
        sectionId: section.sectionId,
        blockId: block.blockId,
        kind: "bullet",
        order: block.order,
        originalText: block.renderText,
        effectiveText: block.renderText,
        renderText: block.renderText,
        applicationStatus: "unchanged",
        textSource: "source_original",
        evidenceIds: block.evidenceIds ?? [],
      })),
    })),
    summary: {
      totalSections: sections.length,
      totalBlocks,
      renderedFromOriginal: totalBlocks,
      renderedFromApprovedSelection: 0,
      rewrittenBlocks: 0,
      approvedUnchangedBlocks: 0,
      totalAppliedChangeReferences: 0,
    },
  });
};

const defaultSections = (): SectionFixture[] => [
  {
    sectionId: "section-summary",
    kind: "summary",
    label: "Summary",
    order: 0,
    blocks: [
      {
        blockId: "block-summary",
        order: 0,
        renderText: "Built deterministic automation for CV tailoring.",
        evidenceIds: ["evidence-a"],
      },
    ],
  },
];

const specialTextSections = (): SectionFixture[] => [
  {
    sectionId: "section-a",
    label: "Experience & Impact",
    order: 0,
    blocks: [
      {
        blockId: "block-a",
        order: 0,
        renderText: "  Led  AI\tautomation\r\nAcross teams & regions <EU> with acentos: acción Ñ.  ",
      },
    ],
  },
];

const unorderedSections = (): SectionFixture[] => [
  {
    sectionId: "section-b",
    label: "Skills",
    order: 1,
    blocks: [
      { blockId: "block-b2", order: 1, renderText: "Second skill." },
      { blockId: "block-b1", order: 0, renderText: "First skill." },
    ],
  },
  {
    sectionId: "section-a",
    kind: "summary",
    label: "Summary",
    order: 0,
    blocks: [{ blockId: "block-a1", order: 0, renderText: "Summary first." }],
  },
];

const orderedSections = (): SectionFixture[] => [
  {
    sectionId: "section-a",
    kind: "summary",
    label: "Summary",
    order: 0,
    blocks: [{ blockId: "block-a1", order: 0, renderText: "Summary first." }],
  },
  {
    sectionId: "section-b",
    label: "Skills",
    order: 1,
    blocks: [
      { blockId: "block-b1", order: 0, renderText: "First skill." },
      { blockId: "block-b2", order: 1, renderText: "Second skill." },
    ],
  },
];

const mutableClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
};

const renderDefault = async (model = makeExportModel()): Promise<DocxRenderResult> =>
  renderResumeExportModelToDocx({ exportModel: model });

const openResultZip = async (result: DocxRenderResult): Promise<JSZip> =>
  JSZip.loadAsync(Buffer.from(result.contentBase64, "base64"));

const readZipText = async (zip: JSZip, path: string): Promise<string> => {
  const file = zip.file(path);
  expect(file).not.toBeNull();
  return (file as JSZip.JSZipObject).async("string");
};

const readAllXmlTextEntries = async (zip: JSZip): Promise<string> => {
  const entries = Object.keys(zip.files)
    .filter((path) => !zip.files[path].dir && (path.endsWith(".xml") || path.endsWith(".rels")))
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const xmlParts = await Promise.all(entries.map(async (path) => readZipText(zip, path)));
  return xmlParts.join("\n");
};

const listNonDirectoryEntries = (zip: JSZip): string[] =>
  Object.keys(zip.files)
    .filter((path) => !zip.files[path].dir)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);

const countOccurrences = (text: string, pattern: string): number =>
  text.split(pattern).length - 1;

const getZipCommentLength = (buffer: Buffer): number => {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (
      buffer[index] === 0x50 &&
      buffer[index + 1] === 0x4b &&
      buffer[index + 2] === 0x05 &&
      buffer[index + 3] === 0x06
    ) {
      return buffer.readUInt16LE(index + 20);
    }
  }
  throw new Error("ZIP_END_OF_CENTRAL_DIRECTORY_NOT_FOUND");
};

const expectThrowsCode = async (
  input: RenderResumeExportModelToDocxInput,
  code: string,
): Promise<void> => {
  await expect(renderResumeExportModelToDocx(input)).rejects.toThrow(code);
};

const makePrivateRewrittenExportModel = (): ResumeExportModel => {
  const offerId = "offer-private";
  const profileId = "profile-private";
  const sourceDocumentId = "source-private";
  const sectionId = "section-private";
  const blockId = "block-private";
  const selectionId = "selection-private";
  const applicationId = buildRewriteApplicationId({
    offerId,
    profileId,
    sourceDocumentId,
    selectionIds: [selectionId],
  });
  const adaptedDocumentId = buildAdaptedResumeDocumentId(applicationId);
  const exportModelId = buildResumeExportModelId(applicationId, adaptedDocumentId);
  const appliedChangeId = buildAppliedRewriteChangeId(applicationId, selectionId, blockId);

  return ResumeExportModelSchema.parse({
    exportModelId,
    applicationId,
    offerId,
    profileId,
    sourceDocumentId,
    adaptedDocumentId,
    exportScope: "structured_content_for_future_docx_rendering",
    source: { format: "markdown", fileName: "PRIVATE_FILE_NAME.md" },
    sections: [
      {
        exportSectionId: buildResumeExportSectionId(exportModelId, sectionId),
        sectionId,
        kind: "experience",
        label: "VISIBLE_SECTION_LABEL",
        order: 0,
        blocks: [
          {
            exportBlockId: buildResumeExportBlockId(exportModelId, sectionId, blockId),
            sectionId,
            blockId,
            kind: "bullet",
            order: 0,
            originalText: "PRIVATE_ORIGINAL_TEXT",
            effectiveText: "VISIBLE_RENDER_TEXT",
            renderText: "VISIBLE_RENDER_TEXT",
            applicationStatus: "rewritten",
            textSource: "approved_selection",
            evidenceIds: ["PRIVATE_EVIDENCE_ID"],
            sourceLocator: { kind: "line", value: "PRIVATE_SOURCE_LOCATOR" },
            appliedSelectionId: selectionId,
            appliedChangeId,
          },
        ],
      },
    ],
    summary: {
      totalSections: 1,
      totalBlocks: 1,
      renderedFromOriginal: 0,
      renderedFromApprovedSelection: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      totalAppliedChangeReferences: 1,
    },
  });
};

describe("DocxRenderResultSchema", () => {
  it("validates renderer output and keeps the public result strict", async () => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse(result).success).toBe(true);
    expect(DocxRenderResultSchema.safeParse({ ...result, generatedAt: "2026-07-30T00:00:00Z" }).success).toBe(false);
  });

  it("rejects result contracts with incorrect lineage, filename, summary, bytes, or base64", async () => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({ ...result, artifactId: "docx-artifact|export-model=wrong|profile=x" }).success).toBe(false);
    expect(DocxRenderResultSchema.safeParse({ ...result, suggestedFilename: "cv.docx" }).success).toBe(false);
    expect(DocxRenderResultSchema.safeParse({
      ...result,
      summary: { ...result.summary, totalParagraphs: result.summary.totalParagraphs + 1 },
    }).success).toBe(false);
    expect(DocxRenderResultSchema.safeParse({ ...result, byteLength: result.byteLength + 1 }).success).toBe(false);
    expect(DocxRenderResultSchema.safeParse({ ...result, contentBase64: `${result.contentBase64}\n` }).success).toBe(false);
    expect(DocxRenderResultSchema.safeParse({
      ...result,
      contentBase64: Buffer.from("not a zip").toString("base64"),
      byteLength: Buffer.byteLength("not a zip"),
    }).success).toBe(false);
  });

  it.each([
    ["invalid characters", "UEsDB$=="],
    ["spaces", "UEsD BA=="],
    ["tabs", "UEsD\tBA=="],
    ["LF", "UEsD\nBA=="],
    ["CRLF", "UEsD\r\nBA=="],
    ["invalid padding", "UEs==="],
    ["canonically incorrect missing padding", "UEs"],
    ["empty content", ""],
  ] as const)("rejects contentBase64 with %s", async (_label, contentBase64) => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({ ...result, contentBase64 }).success).toBe(false);
  });

  it("rejects truncated Base64 when byteLength no longer matches", async () => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({
      ...result,
      contentBase64: result.contentBase64.slice(0, -4),
    }).success).toBe(false);
  });

  it("rejects decoded bytes that do not begin with the ZIP signature", async () => {
    const result = await renderDefault();
    const contentBase64 = Buffer.from("not a zip").toString("base64");

    expect(DocxRenderResultSchema.safeParse({
      ...result,
      contentBase64,
      byteLength: Buffer.from(contentBase64, "base64").length,
    }).success).toBe(false);
  });

  it.each([
    "totalSections",
    "totalBlocks",
    "totalSectionHeadings",
    "totalBlockParagraphs",
    "totalParagraphs",
  ] as const)("rejects incoherent summary counter %s", async (field) => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({
      ...result,
      summary: {
        ...result.summary,
        [field]: result.summary[field] + 1,
      },
    }).success).toBe(false);
  });

  it.each([
    "totalSections",
    "totalBlocks",
    "totalSectionHeadings",
    "totalBlockParagraphs",
    "totalParagraphs",
  ] as const)("rejects negative summary counter %s", async (field) => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({
      ...result,
      summary: {
        ...result.summary,
        [field]: -1,
      },
    }).success).toBe(false);
  });

  it.each([
    "totalSections",
    "totalBlocks",
    "totalSectionHeadings",
    "totalBlockParagraphs",
    "totalParagraphs",
  ] as const)("rejects decimal summary counter %s", async (field) => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({
      ...result,
      summary: {
        ...result.summary,
        [field]: 1.5,
      },
    }).success).toBe(false);
  });

  it.each([
    "outputPath",
    "absolutePath",
    "temporaryPath",
    "blob",
    "buffer",
    "uint8Array",
    "fileHandle",
    "generatedAt",
    "renderedAt",
    "createdAt",
    "provider",
    "model",
    "prompt",
    "systemPrompt",
    "rationale",
    "findings",
    "reviewerId",
    "reviewerName",
    "exportStatus",
  ] as const)("rejects forbidden root field %s", async (field) => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({ ...result, [field]: "forbidden" }).success).toBe(false);
  });

  it("rejects unknown fields inside summary", async () => {
    const result = await renderDefault();

    expect(DocxRenderResultSchema.safeParse({
      ...result,
      summary: {
        ...result.summary,
        extraCounter: 1,
      },
    }).success).toBe(false);
  });

  it("documents a JSON example that validates with DocxRenderResultSchema", () => {
    const doc = readFileSync("docs/redesign/IMPLEMENTATION_12_DOCX_RENDERER.md", "utf8");
    const normalizedDoc = doc.replace(/\r\n/g, "\n");
    const match = normalizedDoc.match(/```json\n([\s\S]*?)\n```/);

    expect(match).not.toBeNull();
    expect(DocxRenderResultSchema.safeParse(JSON.parse(match?.[1] ?? "{}")).success).toBe(true);
  });
});

describe("renderResumeExportModelToDocx", () => {
  it("returns a deterministic, schema-valid, deeply frozen DOCX artifact contract", async () => {
    const model = makeExportModel();
    const result = await renderDefault(model);

    expect(result).toMatchObject({
      artifactId: buildDocxArtifactId(model.exportModelId, DOCX_RENDER_PROFILE),
      exportModelId: model.exportModelId,
      applicationId: model.applicationId,
      offerId: model.offerId,
      profileId: model.profileId,
      sourceDocumentId: model.sourceDocumentId,
      adaptedDocumentId: model.adaptedDocumentId,
      renderScope: DOCX_RENDER_SCOPE,
      renderProfile: DOCX_RENDER_PROFILE,
      suggestedFilename: buildDocxSuggestedFilename(model.exportModelId, DOCX_RENDER_PROFILE),
      mimeType: DOCX_MIME_TYPE,
      fileExtension: DOCX_FILE_EXTENSION,
      contentEncoding: DOCX_CONTENT_ENCODING,
      summary: {
        totalSections: 1,
        totalBlocks: 1,
        totalSectionHeadings: 1,
        totalBlockParagraphs: 1,
        totalParagraphs: 2,
      },
    });
    expect(result.byteLength).toBe(Buffer.from(result.contentBase64, "base64").length);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
    expect(Object.isFrozen(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1)).toBe(true);
    expect(Object.isFrozen(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.page)).toBe(true);
    expect(Object.isFrozen(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.page.marginMillimeters)).toBe(true);
    expect(Object.isFrozen(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography)).toBe(true);
    expect(Object.isFrozen(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.spacing)).toBe(true);
    expect(Object.isFrozen(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.layout)).toBe(true);

    const snapshot = mutableClone(result);
    const profileSnapshot = mutableClone(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1);
    try {
      (result.summary as { totalBlocks: number }).totalBlocks = 99;
    } catch {
      // Strict-mode mutation attempts may throw; the contract is that the value does not change.
    }
    try {
      (DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.typography as { fontFamily: string }).fontFamily = "Times New Roman";
    } catch {
      // Strict-mode mutation attempts may throw; the contract is that the value does not change.
    }
    expect(result).toEqual(snapshot);
    expect(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1).toEqual(profileSnapshot);
  });

  it("produces deepEqual output and identical bytes for repeated calls with the same input", async () => {
    const model = makeExportModel(specialTextSections());

    const first = await renderDefault(model);
    const second = await renderDefault(model);
    const firstBuffer = Buffer.from(first.contentBase64, "base64");
    const secondBuffer = Buffer.from(second.contentBase64, "base64");
    const firstZip = await openResultZip(first);
    const secondZip = await openResultZip(second);
    const firstEntries = listNonDirectoryEntries(firstZip);
    const secondEntries = listNonDirectoryEntries(secondZip);

    expect(second).toEqual(first);
    expect(second.artifactId).toBe(first.artifactId);
    expect(second.contentBase64).toBe(first.contentBase64);
    expect(second.byteLength).toBe(first.byteLength);
    expect(secondBuffer.equals(firstBuffer)).toBe(true);
    expect(secondEntries).toEqual(firstEntries);
    expect(getZipCommentLength(firstBuffer)).toBe(0);
    expect(getZipCommentLength(secondBuffer)).toBe(0);

    for (const entry of firstEntries) {
      const firstContent = await (firstZip.file(entry) as JSZip.JSZipObject).async("uint8array");
      const secondContent = await (secondZip.file(entry) as JSZip.JSZipObject).async("uint8array");
      expect(Buffer.from(secondContent).equals(Buffer.from(firstContent))).toBe(true);
    }

    for (const entry of [
      "word/document.xml",
      "word/styles.xml",
      "docProps/core.xml",
      "docProps/app.xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
    ]) {
      expect(await readZipText(secondZip, entry)).toBe(await readZipText(firstZip, entry));
    }

    for (const file of Object.values(firstZip.files)) {
      if (!file.dir) {
        expect(file.date.getFullYear()).toBe(1980);
        expect(file.date.getMonth()).toBe(0);
        expect(file.date.getDate()).toBe(1);
      }
    }
  });

  it("does not depend on Date.now, Math.random, crypto.randomUUID, or input mutation", async () => {
    const model = makeExportModel(specialTextSections());
    const original = mutableClone(model);
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUuidSpy = globalThis.crypto?.randomUUID === undefined
      ? undefined
      : vi.spyOn(globalThis.crypto, "randomUUID");

    try {
      await renderDefault(model);
    } finally {
      dateNowSpy.mockRestore();
      randomSpy.mockRestore();
      randomUuidSpy?.mockRestore();
    }

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUuidSpy).not.toHaveBeenCalled();
    expect(model).toEqual(original);
    expect(Object.isFrozen(model)).toBe(false);
    expect(Object.isFrozen(model.sections[0])).toBe(false);
  });

  it("accepts deeply frozen input without mutating, freezing, or reordering nested data", async () => {
    const modelWithLocator = ResumeExportModelSchema.parse({
      ...makeExportModel(unorderedSections()),
      sections: makeExportModel(unorderedSections()).sections.map((section, sectionIndex) =>
        sectionIndex === 0
          ? {
              ...section,
              blocks: section.blocks.map((block, blockIndex) =>
                blockIndex === 0
                  ? {
                      ...block,
                      evidenceIds: ["evidence-z", "evidence-a"],
                      sourceLocator: { kind: "line", value: "42" },
                    }
                  : block,
              ),
            }
          : section,
      ),
    });
    const original = mutableClone(modelWithLocator);
    const frozenInput = deepFreeze(modelWithLocator);

    await renderDefault(frozenInput);

    expect(Object.isFrozen(frozenInput)).toBe(true);
    expect(Object.isFrozen(frozenInput.sections)).toBe(true);
    expect(Object.isFrozen(frozenInput.sections[0].blocks)).toBe(true);
    expect(frozenInput).toEqual(original);
    expect(frozenInput.sections.map((section) => section.sectionId)).toEqual(["section-b", "section-a"]);
    expect(frozenInput.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-b2", "block-b1"]);
    expect(frozenInput.sections[0].blocks[0].evidenceIds).toEqual(["evidence-z", "evidence-a"]);
    expect(frozenInput.sections[0].blocks[0].sourceLocator).toEqual({ kind: "line", value: "42" });
  });

  it("renders required OOXML parts and no unsupported content constructs", async () => {
    const result = await renderDefault();
    const zip = await openResultZip(result);

    for (const part of getRequiredDocxPackageParts()) {
      expect(zip.file(part)).not.toBeNull();
    }
    expect(Object.keys(zip.files).some((path) => path.startsWith("word/header"))).toBe(false);
    expect(Object.keys(zip.files).some((path) => path.startsWith("word/footer"))).toBe(false);
    expect(Object.keys(zip.files).some((path) => path.startsWith("word/media/"))).toBe(false);

    const documentXml = await readZipText(zip, "word/document.xml");
    expect(documentXml).not.toContain("<w:tbl");
    expect(documentXml).not.toContain("<w:drawing");
    expect(documentXml).not.toContain("<w:numPr");
  });

  it("uses the single-column visual profile in document OOXML", async () => {
    const result = await renderDefault();
    const documentXml = await readZipText(await openResultZip(result), "word/document.xml");

    expect(DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1.layout).toMatchObject({
      columns: 1,
      tables: false,
      images: false,
      headers: false,
      footers: false,
      numbering: false,
    });
    expect(documentXml).toContain('w:w="11906"');
    expect(documentXml).toContain('w:h="16838"');
    expect(documentXml).toContain('w:orient="portrait"');
    expect(documentXml).toContain('w:top="1134"');
    expect(documentXml).toContain('w:right="1134"');
    expect(documentXml).toContain('w:bottom="1134"');
    expect(documentXml).toContain('w:left="1134"');
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain('w:sz w:val="26"');
    expect(documentXml).toContain('w:sz w:val="21"');
    expect(documentXml).toContain("Arial");
    expect(countOccurrences(documentXml, "<w:sectPr>")).toBe(1);
    expect(documentXml).not.toContain("<w:cols");
    expect(documentXml).toContain("<w:keepNext/>");
    expect(documentXml).toContain('w:spacing w:after="80" w:before="160" w:line="259" w:lineRule="auto"');
    expect(countOccurrences(documentXml, 'w:spacing w:after="80"')).toBeGreaterThanOrEqual(2);
  });

  it("preserves renderText literally for spaces, tabs, line breaks, XML escapes, Unicode, casing, and punctuation", async () => {
    const result = await renderDefault(makeExportModel(specialTextSections()));
    const documentXml = await readZipText(await openResultZip(result), "word/document.xml");

    expect(documentXml).toContain('xml:space="preserve">  Led  AI');
    expect(documentXml).toContain("<w:tab/>");
    expect(documentXml).toContain("<w:br/>");
    expect(documentXml).toContain("Across teams &amp; regions &lt;EU&gt; with acentos: acción Ñ.");
    expect(documentXml).toContain(".  </w:t>");
  });

  it("preserves detailed whitespace tokens with the expected OOXML controls", async () => {
    const result = await renderDefault(makeExportModel([
      {
        sectionId: "section-a",
        label: "Whitespace",
        order: 0,
        blocks: [{
          blockId: "block-a",
          order: 0,
          renderText: " lead  \t\tA\n\nB\r\nC\rD  \n",
        }],
      },
    ]));
    const documentXml = await readZipText(await openResultZip(result), "word/document.xml");

    expect(documentXml).toContain('xml:space="preserve"> lead  </w:t>');
    expect(documentXml).toContain('xml:space="preserve">D  </w:t>');
    expect(countOccurrences(documentXml, "<w:tab/>")).toBe(2);
    expect(countOccurrences(documentXml, "<w:br/>")).toBe(5);
    expect(documentXml).not.toContain("<w:br/><w:br/><w:br/>");
  });

  it("renders literal Markdown-looking text without interpreting it as formatting", async () => {
    const result = await renderDefault(makeExportModel([
      {
        sectionId: "section-a",
        label: "Summary",
        order: 0,
        blocks: [{ blockId: "block-a", order: 0, renderText: "**Bold** and # heading are literal." }],
      },
    ]));
    const documentXml = await readZipText(await openResultZip(result), "word/document.xml");

    expect(documentXml).toContain("**Bold** and # heading are literal.");
  });

  it("does not leak non-rendered technical fields into package XML", async () => {
    const model = makePrivateRewrittenExportModel();
    const result = await renderDefault(model);
    const zip = await openResultZip(result);
    const allXml = await readAllXmlTextEntries(zip);
    const documentXml = await readZipText(zip, "word/document.xml");

    expect(documentXml).toContain("VISIBLE_SECTION_LABEL");
    expect(documentXml).toContain("VISIBLE_RENDER_TEXT");

    for (const hiddenValue of [
      "PRIVATE_ORIGINAL_TEXT",
      "rewritten",
      "approved_selection",
      "selection-private",
      model.sections[0].blocks[0].appliedChangeId as string,
      "PRIVATE_EVIDENCE_ID",
      "PRIVATE_SOURCE_LOCATOR",
      model.profileId,
      model.offerId,
      model.applicationId,
      model.exportModelId,
      model.sourceDocumentId,
      model.adaptedDocumentId,
      "PRIVATE_FILE_NAME.md",
    ]) {
      expect(documentXml).not.toContain(hiddenValue);
      expect(allXml).not.toContain(hiddenValue);
    }
  });

  it("renders sections and blocks in physical input order without sorting arrays in place", async () => {
    const unordered = makeExportModel(unorderedSections());
    const ordered = makeExportModel(orderedSections());
    const originalUnordered = mutableClone(unordered);

    const unorderedResult = await renderDefault(unordered);
    const orderedResult = await renderDefault(ordered);
    const documentXml = await readZipText(await openResultZip(unorderedResult), "word/document.xml");

    expect(unordered.sections.map((section) => section.sectionId)).toEqual(["section-b", "section-a"]);
    expect(unordered.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-b2", "block-b1"]);
    expect(unordered.sections.map((section) => section.order)).toEqual([1, 0]);
    expect(unordered.sections[0].blocks.map((block) => block.order)).toEqual([1, 0]);
    expect(unorderedResult.contentBase64).not.toBe(orderedResult.contentBase64);
    expect(unordered).toEqual(originalUnordered);
    expect(documentXml.indexOf("Skills")).toBeLessThan(documentXml.indexOf("Summary"));
    expect(documentXml.indexOf("Second skill.")).toBeLessThan(documentXml.indexOf("First skill."));
  });

  it("normalizes core metadata and ZIP entry timestamps", async () => {
    const model = makeExportModel();
    const result = await renderDefault(model);
    const zip = await openResultZip(result);
    const coreXml = await readZipText(zip, "docProps/core.xml");
    const appXml = await readZipText(zip, "docProps/app.xml");

    expect(coreXml).toContain("<dc:title>Adapted Resume</dc:title>");
    expect(coreXml).toContain("<dc:subject>Career Navigator DOCX Export</dc:subject>");
    expect(coreXml).toContain("<dc:creator>Career Navigator</dc:creator>");
    expect(coreXml).toContain("<cp:lastModifiedBy>Career Navigator</cp:lastModifiedBy>");
    expect(coreXml).toContain("<cp:revision>1</cp:revision>");
    expect(coreXml).toContain(">2000-01-01T00:00:00Z</dcterms:created>");
    expect(coreXml).toContain(">2000-01-01T00:00:00Z</dcterms:modified>");
    for (const technicalValue of [
      model.exportModelId,
      model.offerId,
      model.profileId,
      model.applicationId,
      model.sourceDocumentId,
      model.adaptedDocumentId,
      process.env.USERNAME ?? "",
      process.env.USER ?? "",
      process.env.COMPUTERNAME ?? "",
    ].filter((value) => value.length > 0)) {
      expect(coreXml).not.toContain(technicalValue);
      expect(appXml).not.toContain(technicalValue);
    }

    for (const file of Object.values(zip.files)) {
      if (!file.dir) {
        expect(file.date.getFullYear()).toBe(1980);
        expect(file.date.getMonth()).toBe(0);
        expect(file.date.getDate()).toBe(1);
      }
    }
  });

  it("writes a smoke-test DOCX file outside the repository and removes it", async () => {
    const result = await renderDefault();
    const outputDirectory = mkdtempSync(join(tmpdir(), "career-navigator-docx-renderer-"));
    const outputPath = join(outputDirectory, "smoke.docx");

    try {
      writeFileSync(outputPath, Buffer.from(result.contentBase64, "base64"));
      expect(existsSync(outputPath)).toBe(true);
      expect(statSync(outputPath).size).toBeGreaterThan(0);

      const fileBuffer = readFileSync(outputPath);
      expect(fileBuffer.length).toBe(result.byteLength);
      expect(fileBuffer[0]).toBe(0x50);
      expect(fileBuffer[1]).toBe(0x4b);

      const zip = await JSZip.loadAsync(fileBuffer);
      for (const part of getRequiredDocxPackageParts()) {
        expect(zip.file(part)).not.toBeNull();
      }
    } finally {
      if (existsSync(outputDirectory)) {
        rmSync(outputDirectory, { recursive: true, force: true });
      }
    }

    expect(existsSync(outputPath)).toBe(false);
    expect(existsSync(outputDirectory)).toBe(false);
  });

  it("rejects invalid ResumeExportModel input with a stable code", async () => {
    const invalidModel = {
      ...makeExportModel(),
      summary: {
        ...makeExportModel().summary,
        totalBlocks: 99,
      },
    };

    await expectThrowsCode(
      { exportModel: invalidModel as ResumeExportModel },
      DocxRenderErrorCode.InvalidExportModel,
    );
  });

  it("rejects XML-incompatible text without exposing the source text", async () => {
    const model = makeExportModel([
      {
        sectionId: "section-a",
        label: "Summary",
        order: 0,
        blocks: [{ blockId: "block-a", order: 0, renderText: "Sensitive client\u0000metric" }],
      },
    ]);

    await expect(renderResumeExportModelToDocx({ exportModel: model })).rejects.toThrow(
      DocxRenderErrorCode.UnsupportedTextCharacter,
    );
    await expect(renderResumeExportModelToDocx({ exportModel: model })).rejects.not.toThrow("Sensitive client");
  });

  it("rejects unpaired surrogate characters before packing", async () => {
    const model = makeExportModel([
      {
        sectionId: "section-a",
        label: "Summary",
        order: 0,
        blocks: [{ blockId: "block-a", order: 0, renderText: "Broken surrogate \uD800" }],
      },
    ]);

    await expectThrowsCode({ exportModel: model }, DocxRenderErrorCode.UnsupportedTextCharacter);
  });

  it.each([
    ["NULL", "\u0000"],
    ["disallowed XML control", "\u0008"],
    ["unpaired high surrogate", "\uD800"],
    ["unpaired low surrogate", "\uDC00"],
  ] as const)("rejects invalid XML character in section.label: %s", async (_label, invalidCharacter) => {
    const model = makeExportModel([
      {
        sectionId: "section-a",
        label: `SECRET_XML_LABEL_${invalidCharacter}`,
        order: 0,
        blocks: [{ blockId: "block-a", order: 0, renderText: "Safe body text." }],
      },
    ]);

    await expect(renderResumeExportModelToDocx({ exportModel: model })).rejects.toThrow(
      DocxRenderErrorCode.UnsupportedTextCharacter,
    );
    await expect(renderResumeExportModelToDocx({ exportModel: model })).rejects.not.toThrow("SECRET_XML_LABEL");
  });

  it.each([
    ["NULL", "\u0000"],
    ["disallowed XML control", "\u0008"],
    ["unpaired high surrogate", "\uD800"],
    ["unpaired low surrogate", "\uDC00"],
  ] as const)("rejects invalid XML character in block.renderText: %s", async (_label, invalidCharacter) => {
    const model = makeExportModel([
      {
        sectionId: "section-a",
        label: "Safe label",
        order: 0,
        blocks: [{ blockId: "block-a", order: 0, renderText: `SECRET_XML_BODY_${invalidCharacter}` }],
      },
    ]);

    await expect(renderResumeExportModelToDocx({ exportModel: model })).rejects.toThrow(
      DocxRenderErrorCode.UnsupportedTextCharacter,
    );
    await expect(renderResumeExportModelToDocx({ exportModel: model })).rejects.not.toThrow("SECRET_XML_BODY");
  });

  it("accepts XML-compatible tabs, line breaks, emoji, non-BMP pairs, accents, and escapable symbols", async () => {
    const result = await renderDefault(makeExportModel([
      {
        sectionId: "section-a",
        label: "Résumé 🚀",
        order: 0,
        blocks: [{
          blockId: "block-a",
          order: 0,
          renderText: "Tab\tLF\nCR\rEmoji 🚀 NonBMP 𠜎 Accents áéíóú Ñ & < >",
        }],
      },
    ]));
    const documentXml = await readZipText(await openResultZip(result), "word/document.xml");

    expect(documentXml).toContain("Résumé 🚀");
    expect(documentXml).toContain("<w:tab/>");
    expect(countOccurrences(documentXml, "<w:br/>")).toBe(2);
    expect(documentXml).toContain("Emoji 🚀 NonBMP 𠜎 Accents áéíóú Ñ &amp; &lt; &gt;");
  });

  it("maps packing failures to a stable renderer error", async () => {
    const spy = vi.spyOn(Packer, "toBuffer").mockRejectedValue(new Error("library failure"));

    try {
      await expectThrowsCode({ exportModel: makeExportModel() }, DocxRenderErrorCode.PackingFailed);
    } finally {
      spy.mockRestore();
    }
  });

  it("maps empty packed buffers to a stable renderer error", async () => {
    const spy = vi.spyOn(Packer, "toBuffer").mockResolvedValue(Buffer.alloc(0));

    try {
      await expectThrowsCode({ exportModel: makeExportModel() }, DocxRenderErrorCode.EmptyOutput);
    } finally {
      spy.mockRestore();
    }
  });

  it("maps non-ZIP packed buffers to a stable renderer error", async () => {
    const spy = vi.spyOn(Packer, "toBuffer").mockResolvedValue(Buffer.from("not a zip"));

    try {
      await expectThrowsCode({ exportModel: makeExportModel() }, DocxRenderErrorCode.InvalidPackage);
    } finally {
      spy.mockRestore();
    }
  });

  it("maps ZIP packages with missing OOXML parts to a stable renderer error", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    const partialPackage = await zip.generateAsync({ type: "nodebuffer" });
    const spy = vi.spyOn(Packer, "toBuffer").mockResolvedValue(partialPackage);

    try {
      await expectThrowsCode({ exportModel: makeExportModel() }, DocxRenderErrorCode.InvalidPackage);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(getRequiredDocxPackageParts())("maps package missing required part %s to a stable renderer error", async (missingPart) => {
    const zip = new JSZip();
    for (const part of getRequiredDocxPackageParts()) {
      if (part !== missingPart) {
        zip.file(part, "<xml/>");
      }
    }
    const partialPackage = await zip.generateAsync({ type: "nodebuffer" });
    const spy = vi.spyOn(Packer, "toBuffer").mockResolvedValue(partialPackage);

    try {
      await expectThrowsCode({ exportModel: makeExportModel() }, DocxRenderErrorCode.InvalidPackage);
    } finally {
      spy.mockRestore();
    }
  });

  it("maps invalid renderer output to a stable error", async () => {
    const spy = vi.spyOn(DocxRenderResultSchema, "safeParse").mockReturnValue({ success: false } as never);

    try {
      await expectThrowsCode({ exportModel: makeExportModel() }, DocxRenderErrorCode.OutputInvalid);
    } finally {
      spy.mockRestore();
    }
  });
});
