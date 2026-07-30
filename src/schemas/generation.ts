import { z } from "zod";
import { IdSchema, NonEmptyString, OptionalDateString } from "./common";
import { CANONICAL_REWRITE_CONSTRAINTS, RewriteConstraintSchema, RewriteGoalSchema } from "./rewrite";

export const CANONICAL_GENERATION_RESPONSE_CONTRACT = Object.freeze({
  outputType: "plain_text",
  languagePolicy: "preserve_original_language",
  candidateCount: 1,
  allowMarkdown: false,
  allowAdditionalClaims: false,
  requireEvidenceGrounding: true,
} as const);

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function addDuplicateIssue(values: string[], context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Generation request ID arrays must not contain duplicates.",
    });
  }
}

function addSortedIssue(values: string[], context: z.RefinementCtx, message: string, pathPrefix: Array<string | number> = []): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareStable(values[index - 1], values[index]) > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: [...pathPrefix, index],
      });
    }
  }
}

const UniqueNonEmptyStringArraySchema = z.array(NonEmptyString).min(1).superRefine(addDuplicateIssue);
const CanonicalNonEmptyStringArraySchema = UniqueNonEmptyStringArraySchema.superRefine((values, context) => {
  addSortedIssue(values, context, "Generation request ID arrays must be sorted in stable canonical order.");
});
const NonWhitespaceStringSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "GENERATION_REQUEST_EMPTY_OR_WHITESPACE_TEXT",
});

const CanonicalRewriteConstraintsSchema = z.array(RewriteConstraintSchema).superRefine((constraints, context) => {
  addDuplicateIssue(constraints, context);
  if (constraints.length !== CANONICAL_REWRITE_CONSTRAINTS.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Generation request constraints must contain the exact canonical sequence.",
    });
    return;
  }

  for (const [index, constraint] of constraints.entries()) {
    if (constraint !== CANONICAL_REWRITE_CONSTRAINTS[index]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Generation request constraints must contain the exact canonical sequence.",
        path: [index],
      });
    }
  }
});

export const GenerationEvidenceReferenceSchema = z
  .object({
    profileSection: z.string().optional(),
    experienceId: IdSchema.optional(),
    projectId: IdSchema.optional(),
    educationId: IdSchema.optional(),
  })
  .strict();

export const GenerationEvidenceContextSchema = z
  .object({
    evidenceId: IdSchema,
    title: NonWhitespaceStringSchema,
    description: NonWhitespaceStringSchema,
    associatedCompetency: z.string().optional(),
    date: OptionalDateString,
    tags: z.array(NonEmptyString).optional(),
    reference: GenerationEvidenceReferenceSchema.optional(),
  })
  .strict();

export const GenerationResponseContractSchema = z
  .object({
    outputType: z.literal(CANONICAL_GENERATION_RESPONSE_CONTRACT.outputType),
    languagePolicy: z.literal(CANONICAL_GENERATION_RESPONSE_CONTRACT.languagePolicy),
    candidateCount: z.literal(CANONICAL_GENERATION_RESPONSE_CONTRACT.candidateCount),
    allowMarkdown: z.literal(CANONICAL_GENERATION_RESPONSE_CONTRACT.allowMarkdown),
    allowAdditionalClaims: z.literal(CANONICAL_GENERATION_RESPONSE_CONTRACT.allowAdditionalClaims),
    requireEvidenceGrounding: z.literal(CANONICAL_GENERATION_RESPONSE_CONTRACT.requireEvidenceGrounding),
  })
  .strict();

export const RewriteGenerationRequestSchema = z
  .object({
    requestId: NonEmptyString,
    proposalId: NonEmptyString,
    actionId: NonEmptyString,
    resolutionId: NonEmptyString,
    blockId: IdSchema,
    originalText: NonWhitespaceStringSchema,
    rewriteGoal: RewriteGoalSchema,
    constraints: CanonicalRewriteConstraintsSchema,
    requirementIds: CanonicalNonEmptyStringArraySchema,
    evidenceIds: CanonicalNonEmptyStringArraySchema,
    evidenceContexts: z.array(GenerationEvidenceContextSchema).min(1),
    responseContract: GenerationResponseContractSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const contextEvidenceIds = request.evidenceContexts.map((evidenceContext) => evidenceContext.evidenceId);
    addDuplicateIssue(contextEvidenceIds, context);
    addSortedIssue(
      contextEvidenceIds,
      context,
      "Generation request evidenceContexts must be sorted by evidenceId.",
      ["evidenceContexts"],
    );

    if (request.evidenceIds.length !== request.evidenceContexts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Generation request evidenceIds and evidenceContexts must describe the same evidence set.",
        path: ["evidenceContexts"],
      });
      return;
    }

    for (const [index, evidenceId] of request.evidenceIds.entries()) {
      if (evidenceId !== contextEvidenceIds[index]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Generation request evidenceIds must align with evidenceContexts by index.",
          path: ["evidenceContexts", index, "evidenceId"],
        });
      }
    }
  });

export const RewriteGenerationSummarySchema = z
  .object({
    totalProposals: z.number().int().nonnegative(),
    generationReady: z.number().int().nonnegative(),
    totalEvidenceContexts: z.number().int().nonnegative(),
  })
  .strict();

export const RewriteGenerationBatchSchema = z
  .object({
    offerId: IdSchema,
    profileId: IdSchema,
    documentId: IdSchema,
    requests: z.array(RewriteGenerationRequestSchema),
    summary: RewriteGenerationSummarySchema,
  })
  .strict()
  .superRefine((batch, context) => {
    addDuplicateIssue(
      batch.requests.map((request) => request.requestId),
      context,
    );
    addDuplicateIssue(
      batch.requests.map((request) => request.proposalId),
      context,
    );

    const totalEvidenceContexts = batch.requests.reduce(
      (total, request) => total + request.evidenceContexts.length,
      0,
    );

    if (batch.summary.totalProposals !== batch.requests.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Generation summary totalProposals must match requests length.",
        path: ["summary", "totalProposals"],
      });
    }
    if (batch.summary.generationReady !== batch.requests.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Generation summary generationReady must match requests length.",
        path: ["summary", "generationReady"],
      });
    }
    if (batch.summary.totalEvidenceContexts !== totalEvidenceContexts) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Generation summary totalEvidenceContexts must match request evidenceContexts.",
        path: ["summary", "totalEvidenceContexts"],
      });
    }
  });

export type GenerationEvidenceReference = z.infer<typeof GenerationEvidenceReferenceSchema>;
export type GenerationEvidenceContext = z.infer<typeof GenerationEvidenceContextSchema>;
export type GenerationResponseContract = z.infer<typeof GenerationResponseContractSchema>;
export type RewriteGenerationRequest = z.infer<typeof RewriteGenerationRequestSchema>;
export type RewriteGenerationSummary = z.infer<typeof RewriteGenerationSummarySchema>;
export type RewriteGenerationBatch = z.infer<typeof RewriteGenerationBatchSchema>;
