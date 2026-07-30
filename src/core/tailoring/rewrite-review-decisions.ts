import type {
  RewriteCandidateFindingCode,
  RewriteCandidateValidationBatch,
  RewriteCandidateValidationResult,
} from "../../schemas/candidate";
import { RewriteCandidateValidationBatchSchema } from "../../schemas/candidate";
import type {
  ApprovedRewriteSelection,
  RewriteReviewerDecisionResult,
  RewriteReviewerDecisionSubmission,
  RewriteReviewDecisionBatch,
} from "../../schemas/review";
import {
  RewriteReviewerDecisionSubmissionSchema,
  RewriteReviewDecisionBatchSchema,
} from "../../schemas/review";

export const RewriteReviewDecisionInputErrorCode = {
  InvalidValidationBatch: "REVIEW_DECISION_INPUT_INVALID_VALIDATION_BATCH",
  InvalidDecision: "REVIEW_DECISION_INPUT_INVALID_DECISION",
  DuplicateValidationId: "REVIEW_DECISION_INPUT_DUPLICATE_VALIDATION_ID",
  UnknownValidationId: "REVIEW_DECISION_INPUT_UNKNOWN_VALIDATION_ID",
  MissingDecision: "REVIEW_DECISION_INPUT_MISSING_DECISION",
  ApprovalNotAllowedForRejected: "REVIEW_DECISION_APPROVAL_NOT_ALLOWED_FOR_REJECTED",
  MultipleApprovalsForBlock: "REVIEW_DECISION_MULTIPLE_APPROVALS_FOR_BLOCK",
} as const;

export type RewriteReviewDecisionInputErrorCode =
  (typeof RewriteReviewDecisionInputErrorCode)[keyof typeof RewriteReviewDecisionInputErrorCode];

export type BuildRewriteReviewDecisionsInput = {
  validationBatch: RewriteCandidateValidationBatch;
  decisions: RewriteReviewerDecisionSubmission[];
};

type ValidatedReviewDecisionInput = {
  validationBatch: RewriteCandidateValidationBatch;
  decisions: RewriteReviewerDecisionSubmission[];
};

export function buildRewriteReviewDecisions(
  input: BuildRewriteReviewDecisionsInput,
): RewriteReviewDecisionBatch {
  const validatedInput = validateInput(input);
  const decisionsByValidationId = new Map(
    validatedInput.decisions.map((decision) => [decision.validationId, decision]),
  );

  assertApprovedBlockConflicts(validatedInput.validationBatch, decisionsByValidationId);

  const decisions = [...validatedInput.validationBatch.results]
    .map((result) => {
      const submission = decisionsByValidationId.get(result.validationId);
      if (!submission) {
        throwInputError(RewriteReviewDecisionInputErrorCode.MissingDecision);
      }
      return buildDecisionResult(validatedInput.validationBatch, result, submission);
    })
    .sort((left, right) => compareStable(left.decisionId, right.decisionId));

  const approvedSelections = decisions
    .filter((decision) => decision.decision === "approved")
    .map((decision) => buildApprovedSelection(validatedInput.validationBatch, decision))
    .sort((left, right) => compareStable(left.selectionId, right.selectionId));

  const summary = {
    totalValidationResults: decisions.length,
    totalDecisions: decisions.length,
    approved: decisions.filter((decision) => decision.decision === "approved").length,
    rejected: decisions.filter((decision) => decision.decision === "rejected").length,
    changesRequested: decisions.filter((decision) => decision.decision === "changes_requested").length,
    approvedSelections: approvedSelections.length,
    approvalsFromAccepted: decisions.filter(
      (decision) => decision.decision === "approved" && decision.sourceValidationStatus === "accepted",
    ).length,
    approvalsFromHumanReview: decisions.filter(
      (decision) => decision.decision === "approved" && decision.sourceValidationStatus === "human_review",
    ).length,
  };

  const batch = RewriteReviewDecisionBatchSchema.parse({
    offerId: validatedInput.validationBatch.offerId,
    profileId: validatedInput.validationBatch.profileId,
    documentId: validatedInput.validationBatch.documentId,
    reviewScope: "explicit_reviewer_decisions_only",
    decisions,
    approvedSelections,
    summary,
  });

  return deepFreeze(batch);
}

function validateInput(input: BuildRewriteReviewDecisionsInput): ValidatedReviewDecisionInput {
  const batchResult = RewriteCandidateValidationBatchSchema.safeParse(input.validationBatch);
  if (!batchResult.success) {
    throwInputError(RewriteReviewDecisionInputErrorCode.InvalidValidationBatch);
  }

  const decisions: RewriteReviewerDecisionSubmission[] = [];
  for (const decision of input.decisions) {
    const decisionResult = RewriteReviewerDecisionSubmissionSchema.safeParse(decision);
    if (!decisionResult.success) {
      throwInputError(RewriteReviewDecisionInputErrorCode.InvalidDecision);
    }
    decisions.push(decisionResult.data);
  }

  assertUnique(
    decisions.map((decision) => decision.validationId),
    RewriteReviewDecisionInputErrorCode.DuplicateValidationId,
  );

  const validationIds = new Set(batchResult.data.results.map((result) => result.validationId));
  for (const decision of decisions) {
    if (!validationIds.has(decision.validationId)) {
      throwInputError(RewriteReviewDecisionInputErrorCode.UnknownValidationId);
    }
  }

  const decisionValidationIds = new Set(decisions.map((decision) => decision.validationId));
  for (const result of batchResult.data.results) {
    if (!decisionValidationIds.has(result.validationId)) {
      throwInputError(RewriteReviewDecisionInputErrorCode.MissingDecision);
    }
  }

  for (const decision of decisions) {
    const result = batchResult.data.results.find((item) => item.validationId === decision.validationId);
    if (result?.status === "rejected" && decision.decision === "approved") {
      throwInputError(RewriteReviewDecisionInputErrorCode.ApprovalNotAllowedForRejected);
    }
  }

  return {
    validationBatch: batchResult.data,
    decisions,
  };
}

function assertApprovedBlockConflicts(
  validationBatch: RewriteCandidateValidationBatch,
  decisionsByValidationId: Map<string, RewriteReviewerDecisionSubmission>,
): void {
  const approvedBlockIds = new Set<string>();
  for (const result of validationBatch.results) {
    const decision = decisionsByValidationId.get(result.validationId);
    if (decision?.decision !== "approved") {
      continue;
    }
    if (approvedBlockIds.has(result.blockId)) {
      throwInputError(RewriteReviewDecisionInputErrorCode.MultipleApprovalsForBlock);
    }
    approvedBlockIds.add(result.blockId);
  }
}

function buildDecisionResult(
  validationBatch: RewriteCandidateValidationBatch,
  result: RewriteCandidateValidationResult,
  submission: RewriteReviewerDecisionSubmission,
): RewriteReviewerDecisionResult {
  const sourceFindingCodes = sortedUnique(result.findings.map((finding) => finding.code));
  return {
    decisionId: canonicalId("review-decision", [
      ["offer", validationBatch.offerId],
      ["profile", validationBatch.profileId],
      ["document", validationBatch.documentId],
      ["validation", result.validationId],
      ["decision", submission.decision],
    ]),
    validationId: result.validationId,
    candidateId: result.candidateId,
    requestId: result.requestId,
    proposalId: result.proposalId,
    actionId: result.actionId,
    resolutionId: result.resolutionId,
    blockId: result.blockId,
    originalText: result.originalText,
    candidateText: result.candidateText,
    sourceValidationStatus: result.status,
    sourceFindingCodes,
    decision: submission.decision,
    rationale: submission.rationale,
  };
}

function buildApprovedSelection(
  validationBatch: RewriteCandidateValidationBatch,
  decision: RewriteReviewerDecisionResult,
): ApprovedRewriteSelection {
  if (decision.sourceValidationStatus === "rejected") {
    throwInputError(RewriteReviewDecisionInputErrorCode.ApprovalNotAllowedForRejected);
  }

  return {
    selectionId: canonicalId("approved-rewrite", [
      ["offer", validationBatch.offerId],
      ["profile", validationBatch.profileId],
      ["document", validationBatch.documentId],
      ["decision", decision.decisionId],
      ["block", decision.blockId],
    ]),
    decisionId: decision.decisionId,
    validationId: decision.validationId,
    candidateId: decision.candidateId,
    requestId: decision.requestId,
    proposalId: decision.proposalId,
    actionId: decision.actionId,
    resolutionId: decision.resolutionId,
    blockId: decision.blockId,
    originalText: decision.originalText,
    approvedText: decision.candidateText,
    sourceValidationStatus: decision.sourceValidationStatus,
    sourceFindingCodes: [...decision.sourceFindingCodes],
    approvalRationale: decision.rationale,
    approvalScope: "approved_for_future_application_only",
  };
}

function canonicalId(kind: string, parts: Array<[string, string]>): string {
  const encodedParts = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return [kind, ...encodedParts].join("|");
}

function sortedUnique(values: RewriteCandidateFindingCode[]): RewriteCandidateFindingCode[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function assertUnique<T extends string | number>(values: T[], errorCode: RewriteReviewDecisionInputErrorCode): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      throwInputError(errorCode);
    }
    seen.add(value);
  }
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwInputError(code: RewriteReviewDecisionInputErrorCode): never {
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
