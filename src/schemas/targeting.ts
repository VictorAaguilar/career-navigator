import { z } from "zod";
import { IdSchema, NonEmptyString } from "./common";
import { TailoringTargetSectionSchema } from "./tailoring";

export const TailoringTargetStatusSchema = z.enum(["resolved", "ambiguous", "unresolved"]);

function addDuplicateIssue(values: string[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Targeting resolution ID arrays must not contain duplicates.",
    });
  }
}

const UniqueNonEmptyStringArraySchema = z.array(NonEmptyString).min(1).superRefine(addDuplicateIssue);

const CommonTailoringTargetResolutionFields = {
  resolutionId: NonEmptyString,
  actionId: NonEmptyString,
  targetSection: TailoringTargetSectionSchema,
  requirementIds: UniqueNonEmptyStringArraySchema,
  evidenceIds: UniqueNonEmptyStringArraySchema,
  reason: NonEmptyString,
} as const;

const ResolvedTailoringTargetResolutionSchema = z
  .object({
    ...CommonTailoringTargetResolutionFields,
    status: z.literal("resolved"),
    candidateBlockIds: z.array(IdSchema).length(1).superRefine(addDuplicateIssue),
    selectedBlockIds: z.array(IdSchema).length(1).superRefine(addDuplicateIssue),
  })
  .strict()
  .superRefine((resolution, context) => {
    if (resolution.selectedBlockIds[0] !== resolution.candidateBlockIds[0]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Resolved targeting selectedBlockIds must contain the same block as candidateBlockIds.",
        path: ["selectedBlockIds", 0],
      });
    }
  });

const AmbiguousTailoringTargetResolutionSchema = z
  .object({
    ...CommonTailoringTargetResolutionFields,
    status: z.literal("ambiguous"),
    candidateBlockIds: z.array(IdSchema).min(2).superRefine(addDuplicateIssue),
    selectedBlockIds: z.array(IdSchema).length(0),
  })
  .strict();

const UnresolvedTailoringTargetResolutionSchema = z
  .object({
    ...CommonTailoringTargetResolutionFields,
    status: z.literal("unresolved"),
    candidateBlockIds: z.array(IdSchema).length(0),
    selectedBlockIds: z.array(IdSchema).length(0),
  })
  .strict();

export const TailoringTargetResolutionSchema = z.union([
  ResolvedTailoringTargetResolutionSchema,
  AmbiguousTailoringTargetResolutionSchema,
  UnresolvedTailoringTargetResolutionSchema,
]);

export const TailoringTargetingSummarySchema = z
  .object({
    totalActions: z.number().int().nonnegative(),
    resolvedCount: z.number().int().nonnegative(),
    ambiguousCount: z.number().int().nonnegative(),
    unresolvedCount: z.number().int().nonnegative(),
  })
  .strict();

export const TailoringTargetingResultSchema = z
  .object({
    offerId: IdSchema,
    profileId: IdSchema,
    documentId: IdSchema,
    resolutions: z.array(TailoringTargetResolutionSchema),
    summary: TailoringTargetingSummarySchema,
  })
  .strict()
  .superRefine((result, context) => {
    const resolvedCount = result.resolutions.filter((resolution) => resolution.status === "resolved").length;
    const ambiguousCount = result.resolutions.filter((resolution) => resolution.status === "ambiguous").length;
    const unresolvedCount = result.resolutions.filter((resolution) => resolution.status === "unresolved").length;

    if (result.summary.totalActions !== result.resolutions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeting summary totalActions must match resolutions length.",
        path: ["summary", "totalActions"],
      });
    }
    if (result.summary.resolvedCount !== resolvedCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeting summary resolvedCount must match resolved resolutions.",
        path: ["summary", "resolvedCount"],
      });
    }
    if (result.summary.ambiguousCount !== ambiguousCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeting summary ambiguousCount must match ambiguous resolutions.",
        path: ["summary", "ambiguousCount"],
      });
    }
    if (result.summary.unresolvedCount !== unresolvedCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeting summary unresolvedCount must match unresolved resolutions.",
        path: ["summary", "unresolvedCount"],
      });
    }
    if (resolvedCount + ambiguousCount + unresolvedCount !== result.summary.totalActions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Targeting summary status counts must add up to totalActions.",
        path: ["summary"],
      });
    }
  });

export type TailoringTargetStatus = z.infer<typeof TailoringTargetStatusSchema>;
export type TailoringTargetResolution = z.infer<typeof TailoringTargetResolutionSchema>;
export type TailoringTargetingSummary = z.infer<typeof TailoringTargetingSummarySchema>;
export type TailoringTargetingResult = z.infer<typeof TailoringTargetingResultSchema>;
