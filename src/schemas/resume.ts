import { z } from "zod";
import { IdSchema, NonEmptyString } from "./common";

export const ResumeSourceFormatSchema = z.enum(["plain_text", "markdown", "docx", "pdf", "unknown"]);

export const ResumeSourceSchema = z
  .object({
    format: ResumeSourceFormatSchema,
    fileName: NonEmptyString.optional(),
  })
  .strict();

export const ResumeSourceLocatorSchema = z
  .object({
    kind: NonEmptyString,
    value: NonEmptyString,
  })
  .strict();

export const ResumeSectionKindSchema = z.enum([
  "header",
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
  "certifications",
  "languages",
  "publications",
  "volunteering",
  "other",
]);

export const ResumeBlockKindSchema = z.enum(["heading", "paragraph", "bullet", "entry", "key_value", "other"]);

const OriginalTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "RESUME_DOCUMENT_EMPTY_OR_WHITESPACE_ORIGINAL_TEXT",
});

export const ResumeBlockSchema = z
  .object({
    blockId: IdSchema,
    kind: ResumeBlockKindSchema,
    order: z.number().int().nonnegative(),
    originalText: OriginalTextSchema,
    evidenceIds: z.array(IdSchema),
    sourceLocator: ResumeSourceLocatorSchema.optional(),
  })
  .strict();

export const ResumeSectionSchema = z
  .object({
    sectionId: IdSchema,
    kind: ResumeSectionKindSchema,
    label: NonEmptyString,
    order: z.number().int().nonnegative(),
    blocks: z.array(ResumeBlockSchema).min(1),
  })
  .strict();

export const ResumeDocumentSchema = z
  .object({
    documentId: IdSchema,
    profileId: IdSchema,
    source: ResumeSourceSchema,
    sections: z.array(ResumeSectionSchema).min(1),
  })
  .strict()
  .superRefine((document, context) => {
    const sectionIds = new Set<string>();
    const sectionOrders = new Set<number>();
    const blockIds = new Set<string>();

    for (const [sectionIndex, section] of document.sections.entries()) {
      if (sectionIds.has(section.sectionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "RESUME_DOCUMENT_DUPLICATE_SECTION_ID",
          path: ["sections", sectionIndex, "sectionId"],
        });
      }
      sectionIds.add(section.sectionId);

      if (sectionOrders.has(section.order)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "RESUME_DOCUMENT_DUPLICATE_SECTION_ORDER",
          path: ["sections", sectionIndex, "order"],
        });
      }
      sectionOrders.add(section.order);

      const blockOrders = new Set<number>();
      for (const [blockIndex, block] of section.blocks.entries()) {
        if (blockIds.has(block.blockId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "RESUME_DOCUMENT_DUPLICATE_BLOCK_ID",
            path: ["sections", sectionIndex, "blocks", blockIndex, "blockId"],
          });
        }
        blockIds.add(block.blockId);

        if (blockOrders.has(block.order)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "RESUME_DOCUMENT_DUPLICATE_BLOCK_ORDER",
            path: ["sections", sectionIndex, "blocks", blockIndex, "order"],
          });
        }
        blockOrders.add(block.order);
      }
    }
  });

export type ResumeSourceFormat = z.infer<typeof ResumeSourceFormatSchema>;
export type ResumeSource = z.infer<typeof ResumeSourceSchema>;
export type ResumeSourceLocator = z.infer<typeof ResumeSourceLocatorSchema>;
export type ResumeSectionKind = z.infer<typeof ResumeSectionKindSchema>;
export type ResumeBlockKind = z.infer<typeof ResumeBlockKindSchema>;
export type ResumeBlock = z.infer<typeof ResumeBlockSchema>;
export type ResumeSection = z.infer<typeof ResumeSectionSchema>;
export type ResumeDocument = z.infer<typeof ResumeDocumentSchema>;
