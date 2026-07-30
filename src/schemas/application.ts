import { z } from "zod";
import {
  RewriteCandidateFindingCodeSchema,
  type RewriteCandidateFindingCode,
} from "./candidate";
import { IdSchema } from "./common";
import {
  ResumeBlockSchema,
  ResumeSectionSchema,
  ResumeSourceSchema,
} from "./resume";

const ADAPTED_RESUME_DOCUMENT_ID_PREFIX = "adapted-resume|application=";

export const ApplicationBlockStatusSchema = z.enum(["unchanged", "rewritten", "approved_unchanged"]);

export const RewriteApplicationScopeSchema = z.literal("approved_rewrites_only");

export const AdaptedResumeDocumentIdSchema = z.string().superRefine((documentId, context) => {
  if (documentId.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "adapted documentId must not be empty or whitespace.",
    });
  }
  if (!documentId.startsWith(ADAPTED_RESUME_DOCUMENT_ID_PREFIX)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "adapted documentId must start with adapted-resume|application=.",
    });
    return;
  }
  if (documentId.slice(ADAPTED_RESUME_DOCUMENT_ID_PREFIX.length).length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "adapted documentId must include an encoded application component.",
    });
  }
});

const NonWhitespaceStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "REWRITE_APPLICATION_EMPTY_OR_WHITESPACE_TEXT",
});

const ErrorFindingCodes = new Set<RewriteCandidateFindingCode>([
  "candidate_contains_markdown",
  "candidate_added_unsupported_date",
  "candidate_removed_original_date",
  "candidate_added_unsupported_metric",
  "candidate_removed_original_metric",
]);

const ReviewFindingCodes = new Set<RewriteCandidateFindingCode>([
  "candidate_added_unverified_proper_noun",
  "candidate_removed_original_proper_noun",
  "candidate_unchanged",
]);

const SourceFindingCodesSchema = z.array(RewriteCandidateFindingCodeSchema).superRefine((codes, context) => {
  addDuplicateIssue(codes, context, "sourceFindingCodes must not contain duplicates.");
  addSortedIssue(codes, context, "sourceFindingCodes must be sorted in stable canonical order.");
});

export const AdaptedResumeBlockSchema = ResumeBlockSchema.extend({
  effectiveText: NonWhitespaceStringSchema,
  applicationStatus: ApplicationBlockStatusSchema,
  appliedSelectionId: NonWhitespaceStringSchema.optional(),
})
  .strict()
  .superRefine((block, context) => {
    if (block.applicationStatus === "unchanged") {
      if (block.effectiveText !== block.originalText) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "unchanged blocks must keep effectiveText equal to originalText.",
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
      return;
    }

    if (block.appliedSelectionId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected blocks must include appliedSelectionId.",
        path: ["appliedSelectionId"],
      });
    }
    if (block.applicationStatus === "rewritten" && block.effectiveText === block.originalText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rewritten blocks must change effectiveText.",
        path: ["effectiveText"],
      });
    }
    if (block.applicationStatus === "approved_unchanged" && block.effectiveText !== block.originalText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approved_unchanged blocks must keep effectiveText equal to originalText.",
        path: ["effectiveText"],
      });
    }
  });

export const AdaptedResumeSectionSchema = ResumeSectionSchema.omit({ blocks: true })
  .extend({
    blocks: z.array(AdaptedResumeBlockSchema).min(1),
  })
  .strict();

export const AdaptedResumeDocumentSchema = z
  .object({
    documentId: AdaptedResumeDocumentIdSchema,
    sourceDocumentId: IdSchema,
    profileId: IdSchema,
    source: ResumeSourceSchema,
    sections: z.array(AdaptedResumeSectionSchema).min(1),
  })
  .strict()
  .superRefine((document, context) => {
    if (document.documentId === document.sourceDocumentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "adapted documentId must differ from sourceDocumentId.",
        path: ["documentId"],
      });
    }
    addDocumentStructureIssues(document.sections, context);
  });

export const AppliedRewriteChangeSchema = z
  .object({
    changeId: NonWhitespaceStringSchema,
    applicationId: NonWhitespaceStringSchema,
    selectionId: NonWhitespaceStringSchema,
    decisionId: NonWhitespaceStringSchema,
    validationId: NonWhitespaceStringSchema,
    candidateId: NonWhitespaceStringSchema,
    requestId: NonWhitespaceStringSchema,
    proposalId: NonWhitespaceStringSchema,
    actionId: NonWhitespaceStringSchema,
    resolutionId: NonWhitespaceStringSchema,
    sectionId: IdSchema,
    blockId: IdSchema,
    beforeText: NonWhitespaceStringSchema,
    afterText: NonWhitespaceStringSchema,
    applicationStatus: z.enum(["rewritten", "approved_unchanged"]),
    sourceValidationStatus: z.enum(["accepted", "human_review"]),
    sourceFindingCodes: SourceFindingCodesSchema,
    approvalRationale: NonWhitespaceStringSchema,
  })
  .strict()
  .superRefine((change, context) => {
    addSourceStatusIssues(change.sourceValidationStatus, change.sourceFindingCodes, context);
    if (change.applicationStatus === "rewritten" && change.beforeText === change.afterText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rewritten changes must have different beforeText and afterText.",
        path: ["afterText"],
      });
    }
    if (change.applicationStatus === "approved_unchanged" && change.beforeText !== change.afterText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approved_unchanged changes must have identical beforeText and afterText.",
        path: ["afterText"],
      });
    }
  });

export const ApprovedRewriteApplicationSummarySchema = z
  .object({
    totalSections: z.number().int().nonnegative(),
    totalBlocks: z.number().int().nonnegative(),
    totalApprovedSelections: z.number().int().nonnegative(),
    rewrittenBlocks: z.number().int().nonnegative(),
    approvedUnchangedBlocks: z.number().int().nonnegative(),
    untouchedBlocks: z.number().int().nonnegative(),
    totalChanges: z.number().int().nonnegative(),
  })
  .strict();

export const ApprovedRewriteApplicationResultSchema = z
  .object({
    applicationId: NonWhitespaceStringSchema,
    offerId: NonWhitespaceStringSchema,
    profileId: IdSchema,
    sourceDocumentId: IdSchema,
    applicationScope: RewriteApplicationScopeSchema,
    adaptedDocument: AdaptedResumeDocumentSchema,
    changes: z.array(AppliedRewriteChangeSchema),
    summary: ApprovedRewriteApplicationSummarySchema,
  })
  .strict()
  .superRefine((result, context) => {
    addCanonicalTraceabilityIssues(result, context);
    if (result.adaptedDocument.sourceDocumentId !== result.sourceDocumentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "adaptedDocument.sourceDocumentId must match result sourceDocumentId.",
        path: ["adaptedDocument", "sourceDocumentId"],
      });
    }
    if (result.adaptedDocument.profileId !== result.profileId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "adaptedDocument.profileId must match result profileId.",
        path: ["adaptedDocument", "profileId"],
      });
    }

    const changeIds = result.changes.map((change) => change.changeId);
    const selectionIds = result.changes.map((change) => change.selectionId);
    const blockIds = result.changes.map((change) => change.blockId);
    addDuplicateIssue(changeIds, context, "changes must not duplicate changeId.");
    addDuplicateIssue(selectionIds, context, "changes must not duplicate selectionId.");
    addDuplicateIssue(blockIds, context, "changes must not duplicate blockId.");
    addSortedIssue(changeIds, context, "changes must be sorted by changeId.", ["changes"]);
    addChangeBlockCorrespondenceIssues(result, context);
    addSummaryIssues(result, context);
  });

export function buildRewriteApplicationId(input: {
  offerId: string;
  profileId: string;
  sourceDocumentId: string;
  selectionIds: readonly string[];
}): string {
  return canonicalId("rewrite-application", [
    ["offer", input.offerId],
    ["profile", input.profileId],
    ["source-document", input.sourceDocumentId],
    ["selections", JSON.stringify(sortStable(input.selectionIds))],
  ]);
}

export function buildAdaptedResumeDocumentId(applicationId: string): string {
  return canonicalId("adapted-resume", [["application", applicationId]]);
}

export function buildAppliedRewriteChangeId(applicationId: string, selectionId: string, blockId: string): string {
  return canonicalId("applied-rewrite", [
    ["application", applicationId],
    ["selection", selectionId],
    ["block", blockId],
  ]);
}

function addCanonicalTraceabilityIssues(
  result: z.infer<typeof ApprovedRewriteApplicationResultSchema>,
  context: z.RefinementCtx,
): void {
  const expectedApplicationId = buildRewriteApplicationId({
    offerId: result.offerId,
    profileId: result.profileId,
    sourceDocumentId: result.sourceDocumentId,
    selectionIds: result.changes.map((change) => change.selectionId),
  });
  if (result.applicationId !== expectedApplicationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "applicationId must match offerId, profileId, sourceDocumentId, and canonical selectionIds.",
      path: ["applicationId"],
    });
  }

  const expectedAdaptedDocumentId = buildAdaptedResumeDocumentId(result.applicationId);
  if (result.adaptedDocument.documentId !== expectedAdaptedDocumentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "adaptedDocument.documentId must be derived from applicationId.",
      path: ["adaptedDocument", "documentId"],
    });
  }

  for (const [index, change] of result.changes.entries()) {
    if (change.applicationId !== result.applicationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change applicationId must match result applicationId.",
        path: ["changes", index, "applicationId"],
      });
    }

    const expectedChangeId = buildAppliedRewriteChangeId(result.applicationId, change.selectionId, change.blockId);
    if (change.changeId !== expectedChangeId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "changeId must match applicationId, selectionId, and blockId.",
        path: ["changes", index, "changeId"],
      });
    }
  }
}

function addDocumentStructureIssues(
  sections: z.infer<typeof AdaptedResumeSectionSchema>[],
  context: z.RefinementCtx,
): void {
  const sectionIds = new Set<string>();
  const sectionOrders = new Set<number>();
  const blockIds = new Set<string>();

  for (const [sectionIndex, section] of sections.entries()) {
    if (sectionIds.has(section.sectionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ADAPTED_RESUME_DUPLICATE_SECTION_ID",
        path: ["sections", sectionIndex, "sectionId"],
      });
    }
    sectionIds.add(section.sectionId);

    if (sectionOrders.has(section.order)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ADAPTED_RESUME_DUPLICATE_SECTION_ORDER",
        path: ["sections", sectionIndex, "order"],
      });
    }
    sectionOrders.add(section.order);

    const blockOrders = new Set<number>();
    for (const [blockIndex, block] of section.blocks.entries()) {
      if (blockIds.has(block.blockId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ADAPTED_RESUME_DUPLICATE_BLOCK_ID",
          path: ["sections", sectionIndex, "blocks", blockIndex, "blockId"],
        });
      }
      blockIds.add(block.blockId);

      if (blockOrders.has(block.order)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ADAPTED_RESUME_DUPLICATE_BLOCK_ORDER",
          path: ["sections", sectionIndex, "blocks", blockIndex, "order"],
        });
      }
      blockOrders.add(block.order);
    }
  }
}

function addChangeBlockCorrespondenceIssues(
  result: z.infer<typeof ApprovedRewriteApplicationResultSchema>,
  context: z.RefinementCtx,
): void {
  const blockEntries = new Map<string, { sectionId: string; block: z.infer<typeof AdaptedResumeBlockSchema> }>();
  for (const section of result.adaptedDocument.sections) {
    for (const block of section.blocks) {
      blockEntries.set(block.blockId, { sectionId: section.sectionId, block });
    }
  }

  const changesByBlockId = new Map(result.changes.map((change) => [change.blockId, change]));
  for (const [index, change] of result.changes.entries()) {
    const entry = blockEntries.get(change.blockId);
    if (entry === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change must reference an existing adapted block.",
        path: ["changes", index, "blockId"],
      });
      continue;
    }
    if (entry.sectionId !== change.sectionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change sectionId must match the adapted section containing the block.",
        path: ["changes", index, "sectionId"],
      });
    }
    if (entry.block.appliedSelectionId !== change.selectionId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change selectionId must match block appliedSelectionId.",
        path: ["changes", index, "selectionId"],
      });
    }
    if (entry.block.originalText !== change.beforeText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change beforeText must match block originalText.",
        path: ["changes", index, "beforeText"],
      });
    }
    if (entry.block.effectiveText !== change.afterText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change afterText must match block effectiveText.",
        path: ["changes", index, "afterText"],
      });
    }
    if (entry.block.applicationStatus !== change.applicationStatus) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "change applicationStatus must match block applicationStatus.",
        path: ["changes", index, "applicationStatus"],
      });
    }
  }

  for (const [blockId, entry] of blockEntries.entries()) {
    const change = changesByBlockId.get(blockId);
    if (entry.block.applicationStatus === "unchanged" && change !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unchanged blocks must not have changes.",
        path: ["changes"],
      });
    }
    if (entry.block.applicationStatus !== "unchanged" && change === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected blocks must have exactly one change.",
        path: ["changes"],
      });
    }
  }
}

function addSummaryIssues(
  result: z.infer<typeof ApprovedRewriteApplicationResultSchema>,
  context: z.RefinementCtx,
): void {
  const blocks = result.adaptedDocument.sections.flatMap((section) => section.blocks);
  const rewrittenBlocks = blocks.filter((block) => block.applicationStatus === "rewritten").length;
  const approvedUnchangedBlocks = blocks.filter((block) => block.applicationStatus === "approved_unchanged").length;
  const untouchedBlocks = blocks.filter((block) => block.applicationStatus === "unchanged").length;
  const totalApprovedSelections = rewrittenBlocks + approvedUnchangedBlocks;

  addSummaryIssueIf(result.summary.totalSections !== result.adaptedDocument.sections.length, context, "totalSections");
  addSummaryIssueIf(result.summary.totalBlocks !== blocks.length, context, "totalBlocks");
  addSummaryIssueIf(result.summary.totalApprovedSelections !== result.changes.length, context, "totalApprovedSelections");
  addSummaryIssueIf(result.summary.totalChanges !== result.changes.length, context, "totalChanges");
  addSummaryIssueIf(result.summary.rewrittenBlocks !== rewrittenBlocks, context, "rewrittenBlocks");
  addSummaryIssueIf(result.summary.approvedUnchangedBlocks !== approvedUnchangedBlocks, context, "approvedUnchangedBlocks");
  addSummaryIssueIf(result.summary.untouchedBlocks !== untouchedBlocks, context, "untouchedBlocks");
  addSummaryIssueIf(result.summary.rewrittenBlocks + result.summary.approvedUnchangedBlocks !== result.summary.totalApprovedSelections, context, "totalApprovedSelections");
  addSummaryIssueIf(result.summary.untouchedBlocks + result.summary.totalApprovedSelections !== result.summary.totalBlocks, context, "totalBlocks");
  addSummaryIssueIf(totalApprovedSelections !== result.changes.length, context, "totalApprovedSelections");
}

function addSourceStatusIssues(
  status: "accepted" | "human_review",
  codes: RewriteCandidateFindingCode[],
  context: z.RefinementCtx,
): void {
  const hasError = codes.some((code) => ErrorFindingCodes.has(code));
  const allReview = codes.every((code) => ReviewFindingCodes.has(code));
  if (status === "accepted" && codes.length !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "accepted source status must have empty sourceFindingCodes.",
      path: ["sourceFindingCodes"],
    });
  }
  if (status === "human_review" && (codes.length === 0 || hasError || !allReview)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "human_review source status must have only review sourceFindingCodes.",
      path: ["sourceFindingCodes"],
    });
  }
}

function addSummaryIssueIf(condition: boolean, context: z.RefinementCtx, field: string): void {
  if (condition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Application summary must match adapted document and changes.",
      path: ["summary", field],
    });
  }
}

function addDuplicateIssue(values: string[], context: z.RefinementCtx, message: string): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message,
    });
  }
}

function addSortedIssue(values: string[], context: z.RefinementCtx, message: string, pathPrefix: Array<string | number> = []): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareStable(values[index - 1], values[index]) > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: [...pathPrefix, index],
      });
    }
  }
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortStable(values: readonly string[]): string[] {
  return [...values].sort(compareStable);
}

function canonicalId(kind: string, parts: Array<[string, string]>): string {
  const encodedParts = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return [kind, ...encodedParts].join("|");
}

export type ApplicationBlockStatus = z.infer<typeof ApplicationBlockStatusSchema>;
export type RewriteApplicationScope = z.infer<typeof RewriteApplicationScopeSchema>;
export type AdaptedResumeDocumentId = z.infer<typeof AdaptedResumeDocumentIdSchema>;
export type AdaptedResumeBlock = z.infer<typeof AdaptedResumeBlockSchema>;
export type AdaptedResumeSection = z.infer<typeof AdaptedResumeSectionSchema>;
export type AdaptedResumeDocument = z.infer<typeof AdaptedResumeDocumentSchema>;
export type AppliedRewriteChange = z.infer<typeof AppliedRewriteChangeSchema>;
export type ApprovedRewriteApplicationSummary = z.infer<typeof ApprovedRewriteApplicationSummarySchema>;
export type ApprovedRewriteApplicationResult = z.infer<typeof ApprovedRewriteApplicationResultSchema>;
