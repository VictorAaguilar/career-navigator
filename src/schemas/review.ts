import { z } from "zod";
import {
  RewriteCandidateFindingCodeSchema,
  RewriteCandidateValidationStatusSchema,
  type RewriteCandidateFindingCode,
} from "./candidate";

export const RewriteReviewerDecisionTypeSchema = z.enum(["approved", "rejected", "changes_requested"]);

export const RewriteReviewScopeSchema = z.literal("explicit_reviewer_decisions_only");

export const ApprovedRewriteSelectionScopeSchema = z.literal("approved_for_future_application_only");

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

const NonWhitespaceStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "REVIEW_DECISION_EMPTY_OR_WHITESPACE_TEXT",
});

const SourceFindingCodesSchema = z.array(RewriteCandidateFindingCodeSchema).superRefine((codes, context) => {
  addDuplicateIssue(codes, context, "sourceFindingCodes must not contain duplicates.");
  addSortedIssue(codes, context, "sourceFindingCodes must be sorted in stable canonical order.");
});

export const RewriteReviewerDecisionSubmissionSchema = z
  .object({
    validationId: NonWhitespaceStringSchema,
    decision: RewriteReviewerDecisionTypeSchema,
    rationale: NonWhitespaceStringSchema,
  })
  .strict();

export const RewriteReviewerDecisionResultSchema = z
  .object({
    decisionId: NonWhitespaceStringSchema,
    validationId: NonWhitespaceStringSchema,
    candidateId: NonWhitespaceStringSchema,
    requestId: NonWhitespaceStringSchema,
    proposalId: NonWhitespaceStringSchema,
    actionId: NonWhitespaceStringSchema,
    resolutionId: NonWhitespaceStringSchema,
    blockId: NonWhitespaceStringSchema,
    originalText: NonWhitespaceStringSchema,
    candidateText: NonWhitespaceStringSchema,
    sourceValidationStatus: RewriteCandidateValidationStatusSchema,
    sourceFindingCodes: SourceFindingCodesSchema,
    decision: RewriteReviewerDecisionTypeSchema,
    rationale: NonWhitespaceStringSchema,
  })
  .strict()
  .superRefine((decision, context) => {
    addSourceStatusIssues(decision.sourceValidationStatus, decision.sourceFindingCodes, context);
    if (decision.sourceValidationStatus === "rejected" && decision.decision === "approved") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approved decisions are not allowed for rejected validation results.",
        path: ["decision"],
      });
    }
  });

export const ApprovedRewriteSelectionSchema = z
  .object({
    selectionId: NonWhitespaceStringSchema,
    decisionId: NonWhitespaceStringSchema,
    validationId: NonWhitespaceStringSchema,
    candidateId: NonWhitespaceStringSchema,
    requestId: NonWhitespaceStringSchema,
    proposalId: NonWhitespaceStringSchema,
    actionId: NonWhitespaceStringSchema,
    resolutionId: NonWhitespaceStringSchema,
    blockId: NonWhitespaceStringSchema,
    originalText: NonWhitespaceStringSchema,
    approvedText: NonWhitespaceStringSchema,
    sourceValidationStatus: z.enum(["accepted", "human_review"]),
    sourceFindingCodes: SourceFindingCodesSchema,
    approvalRationale: NonWhitespaceStringSchema,
    approvalScope: ApprovedRewriteSelectionScopeSchema,
  })
  .strict()
  .superRefine((selection, context) => {
    addSourceStatusIssues(selection.sourceValidationStatus, selection.sourceFindingCodes, context);
  });

export const RewriteReviewDecisionSummarySchema = z
  .object({
    totalValidationResults: z.number().int().nonnegative(),
    totalDecisions: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    changesRequested: z.number().int().nonnegative(),
    approvedSelections: z.number().int().nonnegative(),
    approvalsFromAccepted: z.number().int().nonnegative(),
    approvalsFromHumanReview: z.number().int().nonnegative(),
  })
  .strict();

export const RewriteReviewDecisionBatchSchema = z
  .object({
    offerId: NonWhitespaceStringSchema,
    profileId: NonWhitespaceStringSchema,
    documentId: NonWhitespaceStringSchema,
    reviewScope: RewriteReviewScopeSchema,
    decisions: z.array(RewriteReviewerDecisionResultSchema),
    approvedSelections: z.array(ApprovedRewriteSelectionSchema),
    summary: RewriteReviewDecisionSummarySchema,
  })
  .strict()
  .superRefine((batch, context) => {
    const decisionIds = batch.decisions.map((decision) => decision.decisionId);
    const validationIds = batch.decisions.map((decision) => decision.validationId);
    const selectionIds = batch.approvedSelections.map((selection) => selection.selectionId);
    const selectionBlockIds = batch.approvedSelections.map((selection) => selection.blockId);

    addDuplicateIssue(decisionIds, context, "Review decisions must not duplicate decisionId.");
    addDuplicateIssue(validationIds, context, "Review decisions must not duplicate validationId.");
    addSortedIssue(decisionIds, context, "Review decisions must be sorted by decisionId.", ["decisions"]);
    addDuplicateIssue(selectionIds, context, "Approved selections must not duplicate selectionId.");
    addDuplicateIssue(selectionBlockIds, context, "Approved selections must not duplicate blockId.");
    addSortedIssue(selectionIds, context, "Approved selections must be sorted by selectionId.", ["approvedSelections"]);
    addDecisionSelectionIssues(batch, context);
    addSummaryIssues(batch, context);
  });

function addDecisionSelectionIssues(batch: z.infer<typeof RewriteReviewDecisionBatchSchema>, context: z.RefinementCtx): void {
  const selectionsByDecisionId = new Map(batch.approvedSelections.map((selection) => [selection.decisionId, selection]));

  for (const decision of batch.decisions) {
    const selection = selectionsByDecisionId.get(decision.decisionId);
    if (decision.decision === "approved") {
      if (selection === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each approved decision must have exactly one approved selection.",
          path: ["approvedSelections"],
        });
        continue;
      }
      addSelectionMismatchIssues(decision, selection, context);
      continue;
    }

    if (selection !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only approved decisions may have approved selections.",
        path: ["approvedSelections"],
      });
    }
  }

  const decisionIds = new Set(batch.decisions.map((decision) => decision.decisionId));
  for (const [index, selection] of batch.approvedSelections.entries()) {
    const decision = batch.decisions.find((item) => item.decisionId === selection.decisionId);
    if (!decisionIds.has(selection.decisionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Approved selection must reference an existing decision.",
        path: ["approvedSelections", index, "decisionId"],
      });
      continue;
    }
    if (decision?.decision !== "approved") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Approved selection must reference an approved decision.",
        path: ["approvedSelections", index, "decisionId"],
      });
    }
  }
}

function addSelectionMismatchIssues(
  decision: z.infer<typeof RewriteReviewerDecisionResultSchema>,
  selection: z.infer<typeof ApprovedRewriteSelectionSchema>,
  context: z.RefinementCtx,
): void {
  const pairedFields = [
    "decisionId",
    "validationId",
    "candidateId",
    "requestId",
    "proposalId",
    "actionId",
    "resolutionId",
    "blockId",
    "originalText",
    "sourceValidationStatus",
  ] as const;

  for (const field of pairedFields) {
    if (decision[field] !== selection[field]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Approved selection must match its approved decision.",
        path: ["approvedSelections"],
      });
    }
  }
  if (decision.candidateText !== selection.approvedText) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approved selection approvedText must match decision candidateText.",
      path: ["approvedSelections"],
    });
  }
  if (decision.rationale !== selection.approvalRationale) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approved selection approvalRationale must match decision rationale.",
      path: ["approvedSelections"],
    });
  }
  if (!sameStrings(decision.sourceFindingCodes, selection.sourceFindingCodes)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Approved selection sourceFindingCodes must match decision sourceFindingCodes.",
      path: ["approvedSelections"],
    });
  }
}

function addSummaryIssues(batch: z.infer<typeof RewriteReviewDecisionBatchSchema>, context: z.RefinementCtx): void {
  const approved = batch.decisions.filter((decision) => decision.decision === "approved").length;
  const rejected = batch.decisions.filter((decision) => decision.decision === "rejected").length;
  const changesRequested = batch.decisions.filter((decision) => decision.decision === "changes_requested").length;
  const approvalsFromAccepted = batch.decisions.filter(
    (decision) => decision.decision === "approved" && decision.sourceValidationStatus === "accepted",
  ).length;
  const approvalsFromHumanReview = batch.decisions.filter(
    (decision) => decision.decision === "approved" && decision.sourceValidationStatus === "human_review",
  ).length;

  addSummaryIssueIf(batch.summary.totalValidationResults !== batch.decisions.length, context, "totalValidationResults");
  addSummaryIssueIf(batch.summary.totalDecisions !== batch.decisions.length, context, "totalDecisions");
  addSummaryIssueIf(batch.summary.approved !== approved, context, "approved");
  addSummaryIssueIf(batch.summary.rejected !== rejected, context, "rejected");
  addSummaryIssueIf(batch.summary.changesRequested !== changesRequested, context, "changesRequested");
  addSummaryIssueIf(batch.summary.approvedSelections !== batch.approvedSelections.length, context, "approvedSelections");
  addSummaryIssueIf(batch.summary.approvedSelections !== approved, context, "approvedSelections");
  addSummaryIssueIf(batch.summary.approvalsFromAccepted !== approvalsFromAccepted, context, "approvalsFromAccepted");
  addSummaryIssueIf(batch.summary.approvalsFromHumanReview !== approvalsFromHumanReview, context, "approvalsFromHumanReview");
  addSummaryIssueIf(
    batch.summary.approvalsFromAccepted + batch.summary.approvalsFromHumanReview !== batch.summary.approved,
    context,
    "approved",
  );
}

function addSourceStatusIssues(
  status: z.infer<typeof RewriteCandidateValidationStatusSchema>,
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
  if (status === "rejected" && !hasError) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "rejected source status must have at least one error sourceFindingCode.",
      path: ["sourceFindingCodes"],
    });
  }
}

function addSummaryIssueIf(condition: boolean, context: z.RefinementCtx, field: string): void {
  if (condition) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Review decision summary must match decisions and approved selections.",
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

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type RewriteReviewerDecisionType = z.infer<typeof RewriteReviewerDecisionTypeSchema>;
export type RewriteReviewScope = z.infer<typeof RewriteReviewScopeSchema>;
export type ApprovedRewriteSelectionScope = z.infer<typeof ApprovedRewriteSelectionScopeSchema>;
export type RewriteReviewerDecisionSubmission = z.infer<typeof RewriteReviewerDecisionSubmissionSchema>;
export type RewriteReviewerDecisionResult = z.infer<typeof RewriteReviewerDecisionResultSchema>;
export type ApprovedRewriteSelection = z.infer<typeof ApprovedRewriteSelectionSchema>;
export type RewriteReviewDecisionSummary = z.infer<typeof RewriteReviewDecisionSummarySchema>;
export type RewriteReviewDecisionBatch = z.infer<typeof RewriteReviewDecisionBatchSchema>;
