import { Document, Packer, Paragraph, TextRun } from "docx";
import type { ResumeExportModel } from "../../../../src/schemas/export.js";
import {
  DOCX_CONTENT_ENCODING,
  DOCX_FILE_EXTENSION,
  DOCX_MIME_TYPE,
  DOCX_RENDER_PROFILE,
  DOCX_RENDER_SCOPE,
  buildDocxArtifactId,
  buildDocxSuggestedFilename,
  type DocxRenderResult,
} from "../../../../src/schemas/docx-render.js";

export const TAILORING_DEMO_DOWNLOAD_FILENAME = "curriculum-adaptado.docx";

export async function renderTailoringDemoDocx(exportModel: ResumeExportModel): Promise<DocxRenderResult> {
  const blob = await Packer.toBlob(buildDocument(exportModel));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const totalBlocks = exportModel.sections.reduce((total, section) => total + section.blocks.length, 0);

  return deepFreeze({
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
    contentBase64: bytesToBase64(bytes),
    byteLength: bytes.length,
    summary: {
      totalSections: exportModel.sections.length,
      totalBlocks,
      totalSectionHeadings: exportModel.sections.length,
      totalBlockParagraphs: totalBlocks,
      totalParagraphs: exportModel.sections.length + totalBlocks,
    },
  });
}

export function docxResultToBlob(result: DocxRenderResult): Blob {
  const bytes = base64ToBytes(result.contentBase64);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: result.mimeType });
}

function buildDocument(exportModel: ResumeExportModel): Document {
  return new Document({
    title: "Adapted Resume",
    subject: "Career Navigator Tailoring Demo",
    creator: "Career Navigator",
    sections: [
      {
        children: exportModel.sections.flatMap((section) => [
          new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [new TextRun({ text: section.label, bold: true, size: 26 })],
          }),
          ...section.blocks.map(
            (block) =>
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: block.renderText, size: 21 })],
              }),
          ),
        ]),
      },
    ],
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
