import { z } from "zod";
import { ConfidenceSchema, IdSchema, NonEmptyString, PercentageSchema } from "./common";

export const TailoringActionTypeSchema = z.enum([
  "highlight_evidence",
  "prioritize_section",
  "retain_content",
]);

export const TailoringTargetSectionSchema = z.enum([
  "summary",
  "experience",
  "projects",
  "skills",
  "education",
  "certifications",
  "languages",
  "other",
]);

export const TailoringSupportStatusSchema = z.enum([
  "supported",
  "partially_supported",
  "unsupported",
  "needs_confirmation",
]);

export const TailoringPrioritySchema = z.enum(["high", "medium", "low"]);
export const TailoringStableIdSchema = NonEmptyString;

export const TailoringActionSchema = z
  .object({
    actionId: TailoringStableIdSchema,
    type: TailoringActionTypeSchema,
    targetSection: TailoringTargetSectionSchema,
    requirementIds: z.array(NonEmptyString).min(1, { message: "Tailoring actions must reference at least one requirement." }),
    evidenceIds: z.array(NonEmptyString).min(1, { message: "Tailoring actions must reference at least one evidence item." }),
    reason: NonEmptyString,
    supportStatus: TailoringSupportStatusSchema,
    priority: TailoringPrioritySchema,
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.supportStatus !== "supported" && action.supportStatus !== "partially_supported") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supportStatus"],
        message: "Tailoring actions must declare evidence-backed support.",
      });
    }
  });

export const TailoringGapSchema = z
  .object({
    gapId: TailoringStableIdSchema,
    requirementId: NonEmptyString,
    reason: NonEmptyString,
    priority: TailoringPrioritySchema,
    supportStatus: z.literal("unsupported"),
    missingInformation: z.array(NonEmptyString),
  })
  .strict();

export const TailoringReviewItemSchema = z
  .object({
    reviewItemId: TailoringStableIdSchema,
    requirementId: NonEmptyString,
    reason: NonEmptyString,
    priority: TailoringPrioritySchema,
    supportStatus: z.literal("needs_confirmation"),
    requestedInformation: z.array(NonEmptyString),
  })
  .strict();

export const TailoringPlanSummarySchema = z
  .object({
    totalRequirements: z.number().int().nonnegative(),
    supportedRequirements: z.number().int().nonnegative(),
    partiallySupportedRequirements: z.number().int().nonnegative(),
    unsupportedRequirements: z.number().int().nonnegative(),
    unknownRequirements: z.number().int().nonnegative(),
    actionCount: z.number().int().nonnegative(),
    gapCount: z.number().int().nonnegative(),
    reviewItemCount: z.number().int().nonnegative(),
    score: PercentageSchema,
    confidence: ConfidenceSchema,
    classification: z.enum(["excellent_match", "strong_match", "moderate_match", "weak_match", "insufficient_information"]),
  })
  .strict();

export const TailoringPlanSchema = z
  .object({
    offerId: IdSchema,
    profileId: IdSchema,
    summary: TailoringPlanSummarySchema,
    actions: z.array(TailoringActionSchema),
    gaps: z.array(TailoringGapSchema),
    reviewItems: z.array(TailoringReviewItemSchema),
    warnings: z.array(NonEmptyString),
  })
  .strict();

export type TailoringActionType = z.infer<typeof TailoringActionTypeSchema>;
export type TailoringTargetSection = z.infer<typeof TailoringTargetSectionSchema>;
export type TailoringSupportStatus = z.infer<typeof TailoringSupportStatusSchema>;
export type TailoringPriority = z.infer<typeof TailoringPrioritySchema>;
export type TailoringStableId = z.infer<typeof TailoringStableIdSchema>;
export type TailoringAction = z.infer<typeof TailoringActionSchema>;
export type TailoringGap = z.infer<typeof TailoringGapSchema>;
export type TailoringReviewItem = z.infer<typeof TailoringReviewItemSchema>;
export type TailoringPlanSummary = z.infer<typeof TailoringPlanSummarySchema>;
export type TailoringPlan = z.infer<typeof TailoringPlanSchema>;
