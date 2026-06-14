import { z } from "zod";

export const IdSchema = z.string().min(1, { message: "El identificador no puede estar vacío." }).regex(/^[a-zA-Z0-9_-]+$/, {
  message: "El identificador sólo puede contener letras, números, guiones y guion bajo.",
});

export const NonEmptyString = z.string().min(1, { message: "Este campo no puede estar vacío." });

export const OptionalUrlSchema = z.string().url({ message: "La URL debe ser válida." }).optional();

export const OptionalDateString = z
  .string()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
    message: "La fecha debe tener un formato válido ISO 8601.",
  })
  .optional();

export const ConfidenceSchema = z.number().min(0, { message: "La confianza debe ser al menos 0." }).max(1, {
  message: "La confianza no puede ser mayor que 1.",
});

export const PercentageSchema = z.number().min(0, { message: "El valor debe ser al menos 0." }).max(100, {
  message: "El valor no puede ser mayor que 100.",
});

export const NonEmptyStringArray = z.array(NonEmptyString).min(1, { message: "El arreglo no puede estar vacío." });

export const LocationSchema = z
  .object({
    country: z.string().min(1, { message: "El país no puede estar vacío." }).optional(),
    region: z.string().min(1, { message: "La región no puede estar vacía." }).optional(),
    city: z.string().min(1, { message: "La ciudad no puede estar vacía." }).optional(),
    remoteFriendly: z.boolean().optional(),
  })
  .passthrough();
