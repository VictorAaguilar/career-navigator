import { z } from "zod";
import { ConfidenceSchema, IdSchema, LocationSchema, NonEmptyString, NonEmptyStringArray, OptionalDateString } from "./common";

const ProfessionalLevelSchema = z.enum(["entry", "junior", "mid", "senior", "lead", "executive", "unspecified"]);
const WorkArrangementSchema = z.enum(["remote", "hybrid", "on-site", "unspecified"]);
const EmploymentTypeSchema = z.enum(["full-time", "part-time", "contract", "internship", "freelance", "unspecified"]);
const AvailabilitySchema = z.enum(["immediate", "30-days", "60-days", "flexible", "unspecified"]);

const ExperienceSchema = z
  .object({
    id: IdSchema,
    title: NonEmptyString,
    company: NonEmptyString,
    startDate: OptionalDateString,
    endDate: OptionalDateString,
    location: z.string().optional(),
    summary: z.string().optional(),
    competencies: z.array(NonEmptyString).optional(),
    tools: z.array(NonEmptyString).optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const EducationSchema = z
  .object({
    id: IdSchema,
    degree: NonEmptyString,
    institution: NonEmptyString,
    fieldOfStudy: z.string().optional(),
    startDate: OptionalDateString,
    endDate: OptionalDateString,
    summary: z.string().optional(),
  })
  .passthrough();

const ProjectSchema = z
  .object({
    id: IdSchema,
    name: NonEmptyString,
    summary: z.string().optional(),
    competencies: z.array(NonEmptyString).optional(),
    tools: z.array(NonEmptyString).optional(),
    outcome: z.string().optional(),
    startDate: OptionalDateString,
    endDate: OptionalDateString,
  })
  .passthrough();

const CertificationSchema = z
  .object({
    id: IdSchema,
    name: NonEmptyString,
    issuer: NonEmptyString,
    issueDate: OptionalDateString,
    expirationDate: OptionalDateString,
    credentialId: z.string().optional(),
  })
  .passthrough();

const PreferencesSchema = z
  .object({
    workArrangement: WorkArrangementSchema.optional(),
    employmentType: EmploymentTypeSchema.optional(),
    availability: AvailabilitySchema.optional(),
    salaryRange: z
      .object({
        minimum: z.number().min(0, { message: "El salario mínimo debe ser 0 o mayor." }),
        maximum: z.number().min(0, { message: "El salario máximo debe ser 0 o mayor." }),
        currency: NonEmptyString,
      })
      .optional(),
    relocation: z.boolean().optional(),
    travel: z.boolean().optional(),
    remotePreferred: z.boolean().optional(),
  })
  .passthrough();

const RestrictionsSchema = z
  .object({
    authorizedToWork: z.boolean().optional(),
    authorizationCountries: z.array(NonEmptyString).optional(),
    visaSponsorRequired: z.boolean().optional(),
    relocationRequired: z.boolean().optional(),
  })
  .passthrough();

export const ProfileSchema = z
  .object({
    id: IdSchema,
    professionalTitle: NonEmptyString,
    headline: z.string().optional(),
    summary: z.string().optional(),
    location: LocationSchema,
    workAuthorization: z.array(NonEmptyString).optional(),
    targetRoles: NonEmptyStringArray,
    targetIndustries: NonEmptyStringArray,
    professionalLevel: ProfessionalLevelSchema,
    experience: z.array(ExperienceSchema).optional(),
    education: z.array(EducationSchema).optional(),
    projects: z.array(ProjectSchema).optional(),
    competencies: z.array(NonEmptyString).optional(),
    tools: z.array(NonEmptyString).optional(),
    languages: z.array(NonEmptyString).optional(),
    certifications: z.array(CertificationSchema).optional(),
    preferences: PreferencesSchema.optional(),
    restrictions: RestrictionsSchema.optional(),
    evidenceIds: z.array(IdSchema).optional(),
    confidence: ConfidenceSchema.optional(),
  })
  .passthrough();

export type Profile = z.infer<typeof ProfileSchema>;
