import { z } from "zod";
import { IdSchema, NonEmptyString } from "./common";
import { TailoringTargetSectionSchema } from "./tailoring";

export const RewriteGoalSchema = z.enum(["emphasize_supported_evidence"]);

export const RewriteConstraintSchema = z.enum([
  "preserve_factual_meaning",
  "use_only_linked_evidence",
  "do_not_add_claims",
  "preserve_dates",
  "preserve_metrics",
  "preserve_proper_nouns",
]);

export const CANONICAL_REWRITE_CONSTRAINTS = Object.freeze([
  "preserve_factual_meaning",
  "use_only_linked_evidence",
  "do_not_add_claims",
  "preserve_dates",
  "preserve_metrics",
  "preserve_proper_nouns",
] as const);

export const RewriteSkippedReasonSchema = z.enum([
  "no_rewrite_required",
  "structural_change_required",
  "ambiguous_target",
  "unresolved_target",
]);

function addDuplicateIssue(values: string[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rewrite proposal ID arrays must not contain duplicates.",
    });
  }
}

const UniqueNonEmptyStringArraySchema = z.array(NonEmptyString).min(1).superRefine(addDuplicateIssue);
const CanonicalRewriteConstraintsSchema = z.array(RewriteConstraintSchema).superRefine((constraints, context) => {
  addDuplicateIssue(constraints, context);
  if (constraints.length !== CANONICAL_REWRITE_CONSTRAINTS.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rewrite proposal constraints must contain the exact canonical sequence.",
    });
    return;
  }

  for (const [index, constraint] of constraints.entries()) {
    if (constraint !== CANONICAL_REWRITE_CONSTRAINTS[index]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rewrite proposal constraints must contain the exact canonical sequence.",
        path: [index],
      });
    }
  }
});
const OriginalTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "REWRITE_PROPOSAL_EMPTY_OR_WHITESPACE_ORIGINAL_TEXT",
});

export const RewriteProposalSchema = z
  .object({
    proposalId: NonEmptyString,
    actionId: NonEmptyString,
    resolutionId: NonEmptyString,
    sectionId: IdSchema,
    blockId: IdSchema,
    actionType: z.literal("highlight_evidence"),
    targetSection: TailoringTargetSectionSchema,
    requirementIds: UniqueNonEmptyStringArraySchema,
    evidenceIds: UniqueNonEmptyStringArraySchema,
    originalText: OriginalTextSchema,
    rewriteGoal: RewriteGoalSchema,
    constraints: CanonicalRewriteConstraintsSchema,
  })
  .strict();

const CommonRewriteSkippedItemFields = {
  skippedItemId: NonEmptyString,
  actionId: NonEmptyString,
  resolutionId: NonEmptyString,
} as const;

const AmbiguousRewriteSkippedItemSchema = z
  .object({
    ...CommonRewriteSkippedItemFields,
    reason: z.literal("ambiguous_target"),
    candidateBlockIds: z.array(IdSchema).min(2).superRefine(addDuplicateIssue),
  })
  .strict();

const UnresolvedRewriteSkippedItemSchema = z
  .object({
    ...CommonRewriteSkippedItemFields,
    reason: z.literal("unresolved_target"),
    candidateBlockIds: z.array(IdSchema).length(0),
  })
  .strict();

const NoRewriteRequiredSkippedItemSchema = z
  .object({
    ...CommonRewriteSkippedItemFields,
    reason: z.literal("no_rewrite_required"),
    candidateBlockIds: z.array(IdSchema).length(1).superRefine(addDuplicateIssue),
  })
  .strict();

const StructuralChangeSkippedItemSchema = z
  .object({
    ...CommonRewriteSkippedItemFields,
    reason: z.literal("structural_change_required"),
    candidateBlockIds: z.array(IdSchema).length(1).superRefine(addDuplicateIssue),
  })
  .strict();

export const RewriteSkippedItemSchema = z.union([
  AmbiguousRewriteSkippedItemSchema,
  UnresolvedRewriteSkippedItemSchema,
  NoRewriteRequiredSkippedItemSchema,
  StructuralChangeSkippedItemSchema,
]);

export const RewriteProposalSummarySchema = z
  .object({
    totalResolutions: z.number().int().nonnegative(),
    readyProposals: z.number().int().nonnegative(),
    ambiguousTargets: z.number().int().nonnegative(),
    unresolvedTargets: z.number().int().nonnegative(),
    noRewriteRequired: z.number().int().nonnegative(),
  })
  .strict();

export const RewriteProposalResultSchema = z
  .object({
    offerId: IdSchema,
    profileId: IdSchema,
    documentId: IdSchema,
    proposals: z.array(RewriteProposalSchema),
    skippedItems: z.array(RewriteSkippedItemSchema),
    summary: RewriteProposalSummarySchema,
  })
  .strict()
  .superRefine((result, context) => {
    const ambiguousTargets = result.skippedItems.filter((item) => item.reason === "ambiguous_target").length;
    const unresolvedTargets = result.skippedItems.filter((item) => item.reason === "unresolved_target").length;
    const noRewriteRequired = result.skippedItems.filter(
      (item) => item.reason === "no_rewrite_required" || item.reason === "structural_change_required",
    ).length;

    if (result.summary.totalResolutions !== result.proposals.length + result.skippedItems.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rewrite summary totalResolutions must match proposals plus skippedItems.",
        path: ["summary", "totalResolutions"],
      });
    }
    if (result.summary.readyProposals !== result.proposals.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rewrite summary readyProposals must match proposals length.",
        path: ["summary", "readyProposals"],
      });
    }
    if (result.summary.ambiguousTargets !== ambiguousTargets) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rewrite summary ambiguousTargets must match skipped ambiguous targets.",
        path: ["summary", "ambiguousTargets"],
      });
    }
    if (result.summary.unresolvedTargets !== unresolvedTargets) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rewrite summary unresolvedTargets must match skipped unresolved targets.",
        path: ["summary", "unresolvedTargets"],
      });
    }
    if (result.summary.noRewriteRequired !== noRewriteRequired) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rewrite summary noRewriteRequired must match non-textual skipped items.",
        path: ["summary", "noRewriteRequired"],
      });
    }
  });

export type RewriteGoal = z.infer<typeof RewriteGoalSchema>;
export type RewriteConstraint = z.infer<typeof RewriteConstraintSchema>;
export type RewriteSkippedReason = z.infer<typeof RewriteSkippedReasonSchema>;
export type RewriteProposal = z.infer<typeof RewriteProposalSchema>;
export type RewriteSkippedItem = z.infer<typeof RewriteSkippedItemSchema>;
export type RewriteProposalSummary = z.infer<typeof RewriteProposalSummarySchema>;
export type RewriteProposalResult = z.infer<typeof RewriteProposalResultSchema>;
