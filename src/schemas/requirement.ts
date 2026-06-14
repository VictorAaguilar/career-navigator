import { z } from "zod";
import { ConfidenceSchema, IdSchema, NonEmptyString, PercentageSchema } from "./common";

const RequirementCategorySchema = z.enum(["skill", "experience", "education", "language", "certification", "tool", "soft-skill", "other"]);
const RequirementLevelSchema = z.enum(["basic", "intermediate", "advanced", "expert", "unspecified"]);

export const RequirementSchema = z
  .object({
    id: IdSchema,
    originalText: NonEmptyString,
    category: RequirementCategorySchema,
    isRequired: z.boolean(),
    level: RequirementLevelSchema,
    yearsExperience: z.number().int().min(0, { message: "Los años de experiencia deben ser 0 o mayores." }).optional(),
    competencyOrTool: z.string().optional(),
    language: z.string().optional(),
    education: z.string().optional(),
    location: z.string().optional(),
    certification: z.string().optional(),
    weight: PercentageSchema.default(50),
    extractionConfidence: ConfidenceSchema,
  })
  .passthrough();

export type Requirement = z.infer<typeof RequirementSchema>;
