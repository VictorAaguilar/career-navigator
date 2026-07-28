import { z } from "zod";
import { ConfidenceSchema, IdSchema, NonEmptyString } from "../../schemas/common";

const RequirementCategorySchema = z.enum(["skill", "experience", "education", "language", "certification", "tool", "soft-skill", "other"]);
export const RequirementMatchStatusSchema = z.enum(["met", "partially_met", "not_met", "unknown"]);
export const MatchStrengthSchema = z.enum(["exact", "strong", "partial", "none", "unknown"]);

export const RequirementMatchResultSchema = z
  .object({
    requirementId: IdSchema,
    category: RequirementCategorySchema,
    status: RequirementMatchStatusSchema,
    mandatory: z.boolean(),
    weight: z.number().min(0).max(100),
    matchedEvidenceIds: z.array(IdSchema),
    matchStrength: MatchStrengthSchema,
    confidence: ConfidenceSchema,
    explanation: NonEmptyString,
    missingInformation: z.array(NonEmptyString),
    warnings: z.array(NonEmptyString),
  })
  .passthrough();

export const JobMatchResultSchema = z
  .object({
    jobId: IdSchema,
    profileId: IdSchema,
    requirementMatches: z.array(RequirementMatchResultSchema),
    totalRequirements: z.number().int().nonnegative(),
    metRequirements: z.number().int().nonnegative(),
    partiallyMetRequirements: z.number().int().nonnegative(),
    notMetRequirements: z.number().int().nonnegative(),
    unknownRequirements: z.number().int().nonnegative(),
    generatedAt: z.string(),
    warnings: z.array(NonEmptyString),
  })
  .passthrough();

export type RequirementMatchStatus = z.infer<typeof RequirementMatchStatusSchema>;
export type MatchStrength = z.infer<typeof MatchStrengthSchema>;
export type RequirementMatchResult = z.infer<typeof RequirementMatchResultSchema>;
export type JobMatchResult = z.infer<typeof JobMatchResultSchema>;
