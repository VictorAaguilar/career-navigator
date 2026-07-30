import { z } from "zod";
import { NonEmptyString } from "./common";

export const RewriteCandidateValidationScopeSchema = z.literal("deterministic_surface_checks_only");

export const RewriteCandidateValidationStatusSchema = z.enum(["accepted", "rejected", "human_review"]);

export const RewriteCandidateFindingSeveritySchema = z.enum(["error", "review"]);

export const RewriteCandidateFindingCodeSchema = z.enum([
  "candidate_contains_markdown",
  "candidate_added_unsupported_date",
  "candidate_removed_original_date",
  "candidate_added_unsupported_metric",
  "candidate_removed_original_metric",
  "candidate_added_unverified_proper_noun",
  "candidate_removed_original_proper_noun",
  "candidate_unchanged",
]);

const ErrorFindingCodes = new Set([
  "candidate_contains_markdown",
  "candidate_added_unsupported_date",
  "candidate_removed_original_date",
  "candidate_added_unsupported_metric",
  "candidate_removed_original_metric",
]);

const ReviewFindingCodes = new Set([
  "candidate_added_unverified_proper_noun",
  "candidate_removed_original_proper_noun",
  "candidate_unchanged",
]);

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

const NonWhitespaceStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "CANDIDATE_VALIDATION_EMPTY_OR_WHITESPACE_TEXT",
});

const FindingValuesSchema = z.array(NonEmptyString).superRefine((values, context) => {
  addDuplicateIssue(values, context, "Finding values must not contain duplicates.");
  addSortedIssue(values, context, "Finding values must be sorted in stable canonical order.");
});

export const RewriteCandidateSubmissionSchema = z
  .object({
    requestId: NonEmptyString,
    candidateText: NonWhitespaceStringSchema,
  })
  .strict();

export const RewriteCandidateFindingSchema = z
  .object({
    findingId: NonEmptyString,
    code: RewriteCandidateFindingCodeSchema,
    severity: RewriteCandidateFindingSeveritySchema,
    values: FindingValuesSchema,
  })
  .strict()
  .superRefine((finding, context) => {
    if (ErrorFindingCodes.has(finding.code) && finding.severity !== "error") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finding severity must match finding code.",
        path: ["severity"],
      });
    }
    if (ReviewFindingCodes.has(finding.code) && finding.severity !== "review") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finding severity must match finding code.",
        path: ["severity"],
      });
    }
    if (finding.code === "candidate_unchanged") {
      if (finding.values.length !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "candidate_unchanged finding must not contain values.",
          path: ["values"],
        });
      }
      return;
    }
    if (finding.values.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Finding values are required for this finding code.",
        path: ["values"],
      });
    }
  });

export const RewriteCandidateValidationResultSchema = z
  .object({
    validationId: NonEmptyString,
    candidateId: NonEmptyString,
    requestId: NonEmptyString,
    proposalId: NonEmptyString,
    actionId: NonEmptyString,
    resolutionId: NonEmptyString,
    blockId: NonEmptyString,
    originalText: NonWhitespaceStringSchema,
    candidateText: NonWhitespaceStringSchema,
    status: RewriteCandidateValidationStatusSchema,
    findings: z.array(RewriteCandidateFindingSchema),
  })
  .strict()
  .superRefine((result, context) => {
    const findingIds = result.findings.map((finding) => finding.findingId);
    const findingCodes = result.findings.map((finding) => finding.code);
    addDuplicateIssue(findingIds, context, "Validation result findings must not duplicate findingId.");
    addDuplicateIssue(findingCodes, context, "Validation result findings must not duplicate code.");
    addSortedIssue(findingCodes, context, "Validation result findings must be sorted by code.", ["findings"]);

    const hasError = result.findings.some((finding) => finding.severity === "error");
    const hasReview = result.findings.some((finding) => finding.severity === "review");
    if (result.status === "accepted" && result.findings.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "accepted validation results must not contain findings.",
        path: ["status"],
      });
    }
    if (result.status === "rejected" && !hasError) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rejected validation results must contain at least one error finding.",
        path: ["status"],
      });
    }
    if (result.status === "human_review" && (hasError || !hasReview)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "human_review validation results must contain review findings and no error findings.",
        path: ["status"],
      });
    }
  });

export const RewriteCandidateValidationSummarySchema = z
  .object({
    totalRequests: z.number().int().nonnegative(),
    totalCandidates: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    humanReview: z.number().int().nonnegative(),
    totalFindings: z.number().int().nonnegative(),
  })
  .strict();

export const RewriteCandidateValidationBatchSchema = z
  .object({
    offerId: NonEmptyString,
    profileId: NonEmptyString,
    documentId: NonEmptyString,
    validationScope: RewriteCandidateValidationScopeSchema,
    results: z.array(RewriteCandidateValidationResultSchema),
    summary: RewriteCandidateValidationSummarySchema,
  })
  .strict()
  .superRefine((batch, context) => {
    const validationIds = batch.results.map((result) => result.validationId);
    const requestIds = batch.results.map((result) => result.requestId);
    addDuplicateIssue(validationIds, context, "Validation batch results must not duplicate validationId.");
    addDuplicateIssue(requestIds, context, "Validation batch results must not duplicate requestId.");
    addSortedIssue(validationIds, context, "Validation batch results must be sorted by validationId.", ["results"]);

    const accepted = batch.results.filter((result) => result.status === "accepted").length;
    const rejected = batch.results.filter((result) => result.status === "rejected").length;
    const humanReview = batch.results.filter((result) => result.status === "human_review").length;
    const totalFindings = batch.results.reduce((total, result) => total + result.findings.length, 0);

    if (batch.summary.totalRequests !== batch.results.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate validation summary totalRequests must match results length.",
        path: ["summary", "totalRequests"],
      });
    }
    if (batch.summary.totalCandidates !== batch.results.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate validation summary totalCandidates must match results length.",
        path: ["summary", "totalCandidates"],
      });
    }
    if (batch.summary.accepted !== accepted) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate validation summary accepted must match accepted results.",
        path: ["summary", "accepted"],
      });
    }
    if (batch.summary.rejected !== rejected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate validation summary rejected must match rejected results.",
        path: ["summary", "rejected"],
      });
    }
    if (batch.summary.humanReview !== humanReview) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate validation summary humanReview must match human_review results.",
        path: ["summary", "humanReview"],
      });
    }
    if (batch.summary.totalFindings !== totalFindings) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate validation summary totalFindings must match findings length.",
        path: ["summary", "totalFindings"],
      });
    }
  });

export type RewriteCandidateValidationScope = z.infer<typeof RewriteCandidateValidationScopeSchema>;
export type RewriteCandidateValidationStatus = z.infer<typeof RewriteCandidateValidationStatusSchema>;
export type RewriteCandidateFindingSeverity = z.infer<typeof RewriteCandidateFindingSeveritySchema>;
export type RewriteCandidateFindingCode = z.infer<typeof RewriteCandidateFindingCodeSchema>;
export type RewriteCandidateSubmission = z.infer<typeof RewriteCandidateSubmissionSchema>;
export type RewriteCandidateFinding = z.infer<typeof RewriteCandidateFindingSchema>;
export type RewriteCandidateValidationResult = z.infer<typeof RewriteCandidateValidationResultSchema>;
export type RewriteCandidateValidationSummary = z.infer<typeof RewriteCandidateValidationSummarySchema>;
export type RewriteCandidateValidationBatch = z.infer<typeof RewriteCandidateValidationBatchSchema>;
