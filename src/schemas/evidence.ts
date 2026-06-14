import { z } from "zod";
import { ConfidenceSchema, IdSchema, NonEmptyString, OptionalDateString } from "./common";

const EvidenceTypeSchema = z.enum(["experience", "project", "education", "certification", "skill", "award", "other"]);
const EvidenceSourceSchema = z.enum(["cv", "project", "education", "certification", "external", "user"]);
const DeclaredLevelSchema = z.enum(["beginner", "intermediate", "advanced", "expert", "master", "unspecified"]);

export const EvidenceReferenceSchema = z
  .object({
    profileSection: z.string().optional(),
    experienceId: IdSchema.optional(),
    projectId: IdSchema.optional(),
    educationId: IdSchema.optional(),
  })
  .passthrough();

export const EvidenceSchema = z
  .object({
    id: IdSchema,
    type: EvidenceTypeSchema,
    title: NonEmptyString,
    description: NonEmptyString,
    associatedCompetency: z.string().optional(),
    source: EvidenceSourceSchema,
    declaredLevel: DeclaredLevelSchema,
    date: OptionalDateString,
    verified: z.boolean(),
    confidence: ConfidenceSchema,
    tags: z.array(NonEmptyString).optional(),
    reference: EvidenceReferenceSchema.optional(),
  })
  .passthrough();

export type Evidence = z.infer<typeof EvidenceSchema>;
