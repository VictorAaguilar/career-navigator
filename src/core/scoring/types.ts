import { z } from "zod";
import { ConfidenceSchema, IdSchema, NonEmptyString } from "../../schemas/common";
import { RequirementMatchStatusSchema } from "../matching/types";

export const RequirementScoreSchema = z
  .object({
    requirementId: IdSchema,
    requirementStatus: RequirementMatchStatusSchema,
    mandatory: z.boolean(),
    weight: z.number().min(0).max(100),
    rawContribution: z.number().nonnegative(),
    normalizedContribution: z.number().min(0).max(100),
    penalty: z.number().nonnegative(),
    confidence: ConfidenceSchema,
    explanation: NonEmptyString,
  })
  .passthrough();

export const RequirementSummarySchema = z
  .object({
    count: z.number().int().nonnegative(),
    met: z.number().int().nonnegative(),
    partiallyMet: z.number().int().nonnegative(),
    notMet: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    totalPotential: z.number().nonnegative(),
  })
  .passthrough();

export const StrengthItemSchema = z
  .object({
    requirementId: IdSchema,
    explanation: NonEmptyString,
  })
  .passthrough();

export const ScoringResultSchema = z
  .object({
    jobId: IdSchema,
    profileId: IdSchema,
    score: z.number().min(0).max(100),
    scoreScale: z.literal("0-100"),
    classification: z.enum(["excellent_match", "strong_match", "moderate_match", "weak_match", "insufficient_information"]),
    requirementScores: z.array(RequirementScoreSchema),
    mandatoryRequirementSummary: RequirementSummarySchema,
    optionalRequirementSummary: RequirementSummarySchema,
    confidence: ConfidenceSchema,
    strengths: z.array(StrengthItemSchema),
    gaps: z.array(StrengthItemSchema),
    unknowns: z.array(StrengthItemSchema),
    warnings: z.array(NonEmptyString),
    scoringVersion: NonEmptyString,
  })
  .passthrough();

export type RequirementScore = z.infer<typeof RequirementScoreSchema>;
export type RequirementSummary = z.infer<typeof RequirementSummarySchema>;
export type StrengthItem = z.infer<typeof StrengthItemSchema>;
export type ScoringResult = z.infer<typeof ScoringResultSchema>;
