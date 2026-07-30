import { z } from "zod";
import { NonEmptyString } from "./common";

export const DOCX_RENDER_SCOPE = "generated_docx_artifact";
export const DOCX_RENDER_PROFILE = "single_column_cv_v1";
export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOCX_CONTENT_ENCODING = "base64";
export const DOCX_FILE_EXTENSION = ".docx";

export const DOCX_RENDER_PROFILE_SINGLE_COLUMN_V1 = deepFreeze({
  profile: DOCX_RENDER_PROFILE,
  page: {
    size: "A4",
    orientation: "portrait",
    marginMillimeters: {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20,
    },
  },
  typography: {
    fontFamily: "Arial",
    baseFontSizePoints: 10.5,
    sectionHeadingFontSizePoints: 13,
    sectionHeadingBold: true,
  },
  spacing: {
    sectionHeadingBeforePoints: 8,
    sectionHeadingAfterPoints: 4,
    blockAfterPoints: 4,
    lineSpacingMultiple: 1.08,
  },
  layout: {
    columns: 1,
    tables: false,
    images: false,
    headers: false,
    footers: false,
    numbering: false,
  },
} as const);

export const DocxRenderScopeSchema = z.literal(DOCX_RENDER_SCOPE);
export const DocxRenderProfileSchema = z.literal(DOCX_RENDER_PROFILE);
export const DocxMimeTypeSchema = z.literal(DOCX_MIME_TYPE);
export const DocxContentEncodingSchema = z.literal(DOCX_CONTENT_ENCODING);

export const DocxArtifactIdSchema = z.string().superRefine((artifactId, context) => {
  if (artifactId.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DOCX_ARTIFACT_ID_EMPTY",
    });
  }
  if (!artifactId.startsWith("docx-artifact|export-model=")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DOCX_ARTIFACT_ID_INVALID_PREFIX",
    });
  }
});

export const DocxRenderSummarySchema = z
  .object({
    totalSections: z.number().int().nonnegative(),
    totalBlocks: z.number().int().nonnegative(),
    totalSectionHeadings: z.number().int().nonnegative(),
    totalBlockParagraphs: z.number().int().nonnegative(),
    totalParagraphs: z.number().int().nonnegative(),
  })
  .strict();

export const DocxRenderResultSchema = z
  .object({
    artifactId: DocxArtifactIdSchema,
    exportModelId: NonEmptyString,
    applicationId: NonEmptyString,
    offerId: NonEmptyString,
    profileId: NonEmptyString,
    sourceDocumentId: NonEmptyString,
    adaptedDocumentId: NonEmptyString,
    renderScope: DocxRenderScopeSchema,
    renderProfile: DocxRenderProfileSchema,
    suggestedFilename: NonEmptyString,
    mimeType: DocxMimeTypeSchema,
    fileExtension: z.literal(DOCX_FILE_EXTENSION),
    contentEncoding: DocxContentEncodingSchema,
    contentBase64: z.string().min(1),
    byteLength: z.number().int().positive(),
    summary: DocxRenderSummarySchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.artifactId !== buildDocxArtifactId(result.exportModelId, result.renderProfile)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Docx artifactId must derive from exportModelId and renderProfile.",
        path: ["artifactId"],
      });
    }

    if (result.suggestedFilename !== buildDocxSuggestedFilename(result.exportModelId, result.renderProfile)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Docx suggestedFilename must derive from exportModelId and renderProfile.",
        path: ["suggestedFilename"],
      });
    }

    if (result.summary.totalSectionHeadings !== result.summary.totalSections) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Docx summary totalSectionHeadings must match totalSections.",
        path: ["summary", "totalSectionHeadings"],
      });
    }

    if (result.summary.totalBlockParagraphs !== result.summary.totalBlocks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Docx summary totalBlockParagraphs must match totalBlocks.",
        path: ["summary", "totalBlockParagraphs"],
      });
    }

    if (result.summary.totalParagraphs !== result.summary.totalSectionHeadings + result.summary.totalBlockParagraphs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Docx summary totalParagraphs must match rendered paragraphs.",
        path: ["summary", "totalParagraphs"],
      });
    }

    addBase64Issues(result.contentBase64, result.byteLength, context);
  });

export function buildDocxArtifactId(exportModelId: string, renderProfile: string): string {
  return canonicalId("docx-artifact", [
    ["export-model", exportModelId],
    ["profile", renderProfile],
  ]);
}

export function buildDocxSuggestedFilename(exportModelId: string, renderProfile: string): string {
  return `cv-tailored-${encodeURIComponent(exportModelId)}-${encodeURIComponent(renderProfile)}.docx`;
}

function addBase64Issues(contentBase64: string, byteLength: number, context: z.RefinementCtx): void {
  if (/\r|\n/.test(contentBase64)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Docx contentBase64 must not contain line breaks.",
      path: ["contentBase64"],
    });
    return;
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Docx contentBase64 must be canonical base64.",
      path: ["contentBase64"],
    });
    return;
  }

  const decoded = Buffer.from(contentBase64, "base64");
  if (decoded.length !== byteLength) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Docx byteLength must match decoded contentBase64 bytes.",
      path: ["byteLength"],
    });
  }

  if (decoded.length < 4 || decoded[0] !== 0x50 || decoded[1] !== 0x4b || decoded[2] !== 0x03 || decoded[3] !== 0x04) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Docx contentBase64 must decode to a ZIP package.",
      path: ["contentBase64"],
    });
  }
}

function canonicalId(kind: string, parts: Array<[string, string]>): string {
  const encodedParts = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return [kind, ...encodedParts].join("|");
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

export type DocxRenderScope = z.infer<typeof DocxRenderScopeSchema>;
export type DocxRenderProfile = z.infer<typeof DocxRenderProfileSchema>;
export type DocxMimeType = z.infer<typeof DocxMimeTypeSchema>;
export type DocxContentEncoding = z.infer<typeof DocxContentEncodingSchema>;
export type DocxArtifactId = z.infer<typeof DocxArtifactIdSchema>;
export type DocxRenderSummary = z.infer<typeof DocxRenderSummarySchema>;
export type DocxRenderResult = z.infer<typeof DocxRenderResultSchema>;
