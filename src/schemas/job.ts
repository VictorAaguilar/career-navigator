import { z } from "zod";
import { IdSchema, LocationSchema, NonEmptyString, OptionalDateString, OptionalUrlSchema } from "./common";
import { RequirementSchema } from "./requirement";

const SalarySchema = z
  .object({
    minimum: z.number().min(0, { message: "El salario mínimo debe ser 0 o mayor." }),
    maximum: z.number().min(0, { message: "El salario máximo debe ser 0 o mayor." }),
    currency: NonEmptyString,
    period: z.enum(["hourly", "daily", "weekly", "monthly", "yearly", "unspecified"]).optional(),
  })
  .passthrough();

const ModalitySchema = z.enum(["remote", "hybrid", "on-site", "unspecified"]);
const ContractSchema = z.enum(["full-time", "part-time", "contract", "internship", "temporary", "freelance", "unspecified"]);
const OfferStatusSchema = z.enum(["open", "closed", "draft", "unknown"]);

export const OfferSchema = z
  .object({
    id: IdSchema,
    company: z.object({
      name: NonEmptyString,
      industry: z.string().optional(),
    }),
    title: NonEmptyString,
    location: LocationSchema,
    modality: ModalitySchema,
    contract: ContractSchema,
    salary: SalarySchema.optional(),
    source: NonEmptyString,
    url: OptionalUrlSchema,
    description: NonEmptyString,
    responsibilities: z.array(NonEmptyString).min(1, { message: "Debe haber al menos una responsabilidad." }),
    requirements: z.array(RequirementSchema).min(1, { message: "Debe haber al menos un requisito." }),
    datePosted: OptionalDateString,
    status: OfferStatusSchema,
    language: z.string().optional(),
  })
  .passthrough();

export type Offer = z.infer<typeof OfferSchema>;
