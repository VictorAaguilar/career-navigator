import { Packer } from "docx";
import {
  buildResumeExportModelDocxDocument,
  buildResumeExportModelDocxSummary,
} from "../../../../src/core/tailoring/docx-renderer.js";
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
  const blob = await Packer.toBlob(buildResumeExportModelDocxDocument(exportModel));
  const bytes = new Uint8Array(await blob.arrayBuffer());

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
    summary: buildResumeExportModelDocxSummary(exportModel),
  });
}

export function docxResultToBlob(result: DocxRenderResult): Blob {
  const bytes = base64ToBytes(result.contentBase64);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: result.mimeType });
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
