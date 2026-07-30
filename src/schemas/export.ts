import { z } from "zod";
import {
  AdaptedResumeDocumentIdSchema,
  ApplicationBlockStatusSchema,
  buildAdaptedResumeDocumentId,
  buildAppliedRewriteChangeId,
  buildRewriteApplicationId,
} from "./application";
import { IdSchema, NonEmptyString } from "./common";
import {
  ResumeBlockKindSchema,
  ResumeBlockSchema,
  ResumeSectionKindSchema,
  ResumeSourceLocatorSchema,
  ResumeSourceSchema,
} from "./resume";

const RESUME_EXPORT_MODEL_ID_PREFIX = "resume-export-model|application=";
const RESUME_EXPORT_SECTION_ID_PREFIX = "resume-export-section|export-model=";
const RESUME_EXPORT_BLOCK_ID_PREFIX = "resume-export-block|export-model=";

export const ResumeExportScopeSchema = z.literal("structured_content_for_future_docx_rendering");

export const ResumeExportTextSourceSchema = z.enum(["source_original", "approved_selection"]);

export const ResumeExportModelIdSchema = prefixedLineageIdSchema(
  RESUME_EXPORT_MODEL_ID_PREFIX,
  ["application", "adapted-document"],
  "resume export model ID",
);

export const ResumeExportSectionIdSchema = prefixedLineageIdSchema(
  RESUME_EXPORT_SECTION_ID_PREFIX,
  ["export-model", "section"],
  "resume export section ID",
);

export const ResumeExportBlockIdSchema = prefixedLineageIdSchema(
  RESUME_EXPORT_BLOCK_ID_PREFIX,
  ["export-model", "section", "block"],
  "resume export block ID",
);

const NonWhitespaceStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "RESUME_EXPORT_EMPTY_OR_WHITESPACE_TEXT",
});

export const ResumeExportBlockSchema = z
  .object({
    exportBlockId: ResumeExportBlockIdSchema,
    sectionId: IdSchema,
    blockId: IdSchema,
    kind: ResumeBlockKindSchema,
    order: z.number().int().nonnegative(),
    originalText: NonWhitespaceStringSchema,
    effectiveText: NonWhitespaceStringSchema,
    renderText: NonWhitespaceStringSchema,
    applicationStatus: ApplicationBlockStatusSchema,
    textSource: ResumeExportTextSourceSchema,
    evidenceIds: ResumeBlockSchema.shape.evidenceIds,
    sourceLocator: ResumeSourceLocatorSchema.optional(),
    appliedSelectionId: NonWhitespaceStringSchema.optional(),
    appliedChangeId: NonWhitespaceStringSchema.optional(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.renderText !== block.effectiveText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "renderText must match effectiveText.",
        path: ["renderText"],
      });
    }

    if (block.applicationStatus === "unchanged") {
      if (block.textSource !== "source_original") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unchanged blocks must use source_original.",
          path: ["textSource"],
        });
      }
      if (block.originalText !== block.effectiveText) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unchanged blocks must keep originalText and effectiveText identical.",
          path: ["effectiveText"],
        });
      }
      if (block.appliedSelectionId !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unchanged blocks must not include appliedSelectionId.",
          path: ["appliedSelectionId"],
        });
      }
      if (block.appliedChangeId !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unchanged blocks must not include appliedChangeId.",
          path: ["appliedChangeId"],
        });
      }
      return;
    }

    if (block.textSource !== "approved_selection") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected blocks must use approved_selection.",
        path: ["textSource"],
      });
    }
    if (block.appliedSelectionId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected blocks must include appliedSelectionId.",
        path: ["appliedSelectionId"],
      });
    }
    if (block.appliedChangeId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected blocks must include appliedChangeId.",
        path: ["appliedChangeId"],
      });
    }
    if (block.applicationStatus === "rewritten" && block.originalText === block.effectiveText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rewritten blocks must change effectiveText.",
        path: ["effectiveText"],
      });
    }
    if (block.applicationStatus === "approved_unchanged" && block.originalText !== block.effectiveText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approved_unchanged blocks must keep originalText and effectiveText identical.",
        path: ["effectiveText"],
      });
    }
  });

export const ResumeExportSectionSchema = z
  .object({
    exportSectionId: ResumeExportSectionIdSchema,
    sectionId: IdSchema,
    kind: ResumeSectionKindSchema,
    label: NonEmptyString,
    order: z.number().int().nonnegative(),
    blocks: z.array(ResumeExportBlockSchema).min(1),
  })
  .strict()
  .superRefine((section, context) => {
    const blockIds = section.blocks.map((block) => block.blockId);
    const blockOrders = section.blocks.map((block) => String(block.order));
    const exportBlockIds = section.blocks.map((block) => block.exportBlockId);
    addDuplicateIssue(blockIds, context, "Resume export section blocks must not duplicate blockId.");
    addDuplicateIssue(blockOrders, context, "Resume export section blocks must not duplicate order.");
    addDuplicateIssue(exportBlockIds, context, "Resume export section blocks must not duplicate exportBlockId.");

    for (const [index, block] of section.blocks.entries()) {
      if (block.sectionId !== section.sectionId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "block sectionId must match section sectionId.",
          path: ["blocks", index, "sectionId"],
        });
      }
    }
  });

export const ResumeExportSummarySchema = z
  .object({
    totalSections: z.number().int().nonnegative(),
    totalBlocks: z.number().int().nonnegative(),
    renderedFromOriginal: z.number().int().nonnegative(),
    renderedFromApprovedSelection: z.number().int().nonnegative(),
    rewrittenBlocks: z.number().int().nonnegative(),
    approvedUnchangedBlocks: z.number().int().nonnegative(),
    totalAppliedChangeReferences: z.number().int().nonnegative(),
  })
  .strict();

export const ResumeExportModelSchema = z
  .object({
    exportModelId: ResumeExportModelIdSchema,
    applicationId: NonWhitespaceStringSchema,
    offerId: NonWhitespaceStringSchema,
    profileId: IdSchema,
    sourceDocumentId: IdSchema,
    adaptedDocumentId: AdaptedResumeDocumentIdSchema,
    exportScope: ResumeExportScopeSchema,
    source: ResumeSourceSchema,
    sections: z.array(ResumeExportSectionSchema).min(1),
    summary: ResumeExportSummarySchema,
  })
  .strict()
  .superRefine((model, context) => {
    addModelStructureIssues(model, context);
    addModelTraceabilityIssues(model, context);
    addModelSummaryIssues(model, context);
  });

export function buildResumeExportModelId(applicationId: string, adaptedDocumentId: string): string {
  return canonicalId("resume-export-model", [
    ["application", applicationId],
    ["adapted-document", adaptedDocumentId],
  ]);
}

export function buildResumeExportSectionId(exportModelId: string, sectionId: string): string {
  return canonicalId("resume-export-section", [
    ["export-model", exportModelId],
    ["section", sectionId],
  ]);
}

export function buildResumeExportBlockId(exportModelId: string, sectionId: string, blockId: string): string {
  return canonicalId("resume-export-block", [
    ["export-model", exportModelId],
    ["section", sectionId],
    ["block", blockId],
  ]);
}

function addModelStructureIssues(
  model: z.infer<typeof ResumeExportModelSchema>,
  context: z.RefinementCtx,
): void {
  const sectionIds = model.sections.map((section) => section.sectionId);
  const sectionOrders = model.sections.map((section) => String(section.order));
  const exportSectionIds = model.sections.map((section) => section.exportSectionId);
  const blocks = model.sections.flatMap((section) => section.blocks);
  const blockIds = blocks.map((block) => block.blockId);
  const exportBlockIds = blocks.map((block) => block.exportBlockId);
  const appliedSelectionIds = blocks
    .map((block) => block.appliedSelectionId)
    .filter((value): value is string => value !== undefined);
  const appliedChangeIds = blocks
    .map((block) => block.appliedChangeId)
    .filter((value): value is string => value !== undefined);

  addDuplicateIssue(sectionIds, context, "Resume export model sections must not duplicate sectionId.");
  addDuplicateIssue(sectionOrders, context, "Resume export model sections must not duplicate order.");
  addDuplicateIssue(exportSectionIds, context, "Resume export model sections must not duplicate exportSectionId.");
  addDuplicateIssue(blockIds, context, "Resume export model blocks must not duplicate blockId.");
  addDuplicateIssue(exportBlockIds, context, "Resume export model blocks must not duplicate exportBlockId.");
  addDuplicateIssue(appliedSelectionIds, context, "Resume export model blocks must not duplicate appliedSelectionId.");
  addDuplicateIssue(appliedChangeIds, context, "Resume export model blocks must not duplicate appliedChangeId.");
}

function addModelTraceabilityIssues(
  model: z.infer<typeof ResumeExportModelSchema>,
  context: z.RefinementCtx,
): void {
  const selectedBlocks = model.sections.flatMap((section) =>
    section.blocks.filter((block) => block.appliedSelectionId !== undefined),
  );
  const expectedApplicationId = buildRewriteApplicationId({
    offerId: model.offerId,
    profileId: model.profileId,
    sourceDocumentId: model.sourceDocumentId,
    selectionIds: selectedBlocks.map((block) => block.appliedSelectionId as string),
  });
  if (model.applicationId !== expectedApplicationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resume export model applicationId must match canonical selected block selectionIds.",
      path: ["applicationId"],
    });
  }

  if (model.adaptedDocumentId !== buildAdaptedResumeDocumentId(model.applicationId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resume export model adaptedDocumentId must derive from applicationId.",
      path: ["adaptedDocumentId"],
    });
  }

  if (model.exportModelId !== buildResumeExportModelId(model.applicationId, model.adaptedDocumentId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resume export model exportModelId must derive from applicationId and adaptedDocumentId.",
      path: ["exportModelId"],
    });
  }

  for (const [sectionIndex, section] of model.sections.entries()) {
    if (section.exportSectionId !== buildResumeExportSectionId(model.exportModelId, section.sectionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Resume export section ID must derive from exportModelId and sectionId.",
        path: ["sections", sectionIndex, "exportSectionId"],
      });
    }

    for (const [blockIndex, block] of section.blocks.entries()) {
      if (block.exportBlockId !== buildResumeExportBlockId(model.exportModelId, section.sectionId, block.blockId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Resume export block ID must derive from exportModelId, sectionId, and blockId.",
          path: ["sections", sectionIndex, "blocks", blockIndex, "exportBlockId"],
        });
      }

      if (block.appliedSelectionId !== undefined) {
        const expectedChangeId = buildAppliedRewriteChangeId(model.applicationId, block.appliedSelectionId, block.blockId);
        if (block.appliedChangeId !== expectedChangeId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Resume export block appliedChangeId must derive from applicationId, appliedSelectionId, and blockId.",
            path: ["sections", sectionIndex, "blocks", blockIndex, "appliedChangeId"],
          });
        }
      }
    }
  }
}

function addModelSummaryIssues(
  model: z.infer<typeof ResumeExportModelSchema>,
  context: z.RefinementCtx,
): void {
  const blocks = model.sections.flatMap((section) => section.blocks);
  const renderedFromOriginal = blocks.filter((block) => block.textSource === "source_original").length;
  const renderedFromApprovedSelection = blocks.filter((block) => block.textSource === "approved_selection").length;
  const rewrittenBlocks = blocks.filter((block) => block.applicationStatus === "rewritten").length;
  const approvedUnchangedBlocks = blocks.filter((block) => block.applicationStatus === "approved_unchanged").length;
  const totalAppliedChangeReferences = blocks.filter((block) => block.appliedChangeId !== undefined).length;

  addSummaryIssueIf(model.summary.totalSections !== model.sections.length, context, "totalSections");
  addSummaryIssueIf(model.summary.totalBlocks !== blocks.length, context, "totalBlocks");
  addSummaryIssueIf(model.summary.renderedFromOriginal !== renderedFromOriginal, context, "renderedFromOriginal");
  addSummaryIssueIf(
    model.summary.renderedFromApprovedSelection !== renderedFromApprovedSelection,
    context,
    "renderedFromApprovedSelection",
  );
  addSummaryIssueIf(model.summary.rewrittenBlocks !== rewrittenBlocks, context, "rewrittenBlocks");
  addSummaryIssueIf(model.summary.approvedUnchangedBlocks !== approvedUnchangedBlocks, context, "approvedUnchangedBlocks");
  addSummaryIssueIf(
    model.summary.totalAppliedChangeReferences !== totalAppliedChangeReferences,
    context,
    "totalAppliedChangeReferences",
  );
  addSummaryIssueIf(
    model.summary.renderedFromOriginal + model.summary.renderedFromApprovedSelection !== model.summary.totalBlocks,
    context,
    "totalBlocks",
  );
  addSummaryIssueIf(
    model.summary.rewrittenBlocks + model.summary.approvedUnchangedBlocks !== model.summary.renderedFromApprovedSelection,
    context,
    "renderedFromApprovedSelection",
  );
  addSummaryIssueIf(
    model.summary.totalAppliedChangeReferences !== model.summary.renderedFromApprovedSelection,
    context,
    "totalAppliedChangeReferences",
  );
}

function prefixedLineageIdSchema(prefix: string, components: readonly string[], label: string): z.ZodType<string> {
  return z.string().superRefine((value, context) => {
    if (value.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must not be empty or whitespace.`,
      });
    }
    if (!value.startsWith(prefix)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must start with ${prefix}.`,
      });
      return;
    }

    const parts = value.split("|");
    if (parts.length !== components.length + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must include all required components.`,
      });
      return;
    }

    const kind = prefix.split("|")[0];
    if (parts[0] !== kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must use the expected kind.`,
      });
    }

    for (const [index, component] of components.entries()) {
      const expectedPrefix = `${component}=`;
      const part = parts[index + 1];
      if (!part.startsWith(expectedPrefix)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must include component ${component}.`,
        });
        continue;
      }
      if (part.slice(expectedPrefix.length).length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} component ${component} must not be empty.`,
        });
      }
    }
  });
}

function addDuplicateIssue(values: string[], context: z.RefinementCtx, message: string): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message,
    });
  }
}

function addSummaryIssueIf(condition: boolean, context: z.RefinementCtx, field: string): void {
  if (condition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resume export summary must match sections and blocks.",
      path: ["summary", field],
    });
  }
}

function canonicalId(kind: string, parts: Array<[string, string]>): string {
  const encodedParts = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return [kind, ...encodedParts].join("|");
}

export type ResumeExportScope = z.infer<typeof ResumeExportScopeSchema>;
export type ResumeExportTextSource = z.infer<typeof ResumeExportTextSourceSchema>;
export type ResumeExportModelId = z.infer<typeof ResumeExportModelIdSchema>;
export type ResumeExportSectionId = z.infer<typeof ResumeExportSectionIdSchema>;
export type ResumeExportBlockId = z.infer<typeof ResumeExportBlockIdSchema>;
export type ResumeExportBlock = z.infer<typeof ResumeExportBlockSchema>;
export type ResumeExportSection = z.infer<typeof ResumeExportSectionSchema>;
export type ResumeExportSummary = z.infer<typeof ResumeExportSummarySchema>;
export type ResumeExportModel = z.infer<typeof ResumeExportModelSchema>;
