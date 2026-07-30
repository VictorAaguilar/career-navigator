import type { Evidence } from "../../schemas/evidence";
import { EvidenceSchema } from "../../schemas/evidence";
import type { RewriteProposalResult } from "../../schemas/rewrite";
import { RewriteProposalResultSchema } from "../../schemas/rewrite";
import type { GenerationEvidenceContext, RewriteGenerationBatch } from "../../schemas/generation";
import {
  CANONICAL_GENERATION_RESPONSE_CONTRACT,
  RewriteGenerationBatchSchema,
} from "../../schemas/generation";

export const RewriteGenerationInputErrorCode = {
  InvalidRewriteResult: "GENERATION_INPUT_INVALID_REWRITE_RESULT",
  InvalidEvidence: "GENERATION_INPUT_INVALID_EVIDENCE",
  DuplicateProposalId: "GENERATION_INPUT_DUPLICATE_PROPOSAL_ID",
  DuplicateEvidenceId: "GENERATION_INPUT_DUPLICATE_EVIDENCE_ID",
  UnknownEvidenceId: "GENERATION_INPUT_UNKNOWN_EVIDENCE_ID",
  EmptyEvidenceContent: "GENERATION_INPUT_EMPTY_EVIDENCE_CONTENT",
} as const;

export type RewriteGenerationInputErrorCode =
  (typeof RewriteGenerationInputErrorCode)[keyof typeof RewriteGenerationInputErrorCode];

export type BuildRewriteGenerationRequestsInput = {
  rewriteProposalResult: RewriteProposalResult;
  evidences: Evidence[];
};

type ValidatedGenerationInput = {
  rewriteProposalResult: RewriteProposalResult;
  evidences: Evidence[];
};

export function buildRewriteGenerationRequests(
  input: BuildRewriteGenerationRequestsInput,
): RewriteGenerationBatch {
  const validatedInput = validateInput(input);
  const evidencesById = mapEvidencesById(validatedInput.evidences);

  const requests = [...validatedInput.rewriteProposalResult.proposals]
    .map((proposal) => {
      const evidenceIds = sortedUnique(proposal.evidenceIds);
      const evidenceContexts = evidenceIds.map((evidenceId) => {
        const evidence = evidencesById.get(evidenceId);
        if (!evidence) {
          throwInputError(RewriteGenerationInputErrorCode.UnknownEvidenceId);
        }
        return buildEvidenceContext(evidence);
      });

      return {
        requestId: requestId(validatedInput.rewriteProposalResult, proposal.proposalId),
        proposalId: proposal.proposalId,
        actionId: proposal.actionId,
        resolutionId: proposal.resolutionId,
        blockId: proposal.blockId,
        originalText: proposal.originalText,
        rewriteGoal: proposal.rewriteGoal,
        constraints: [...proposal.constraints],
        requirementIds: sortedUnique(proposal.requirementIds),
        evidenceIds,
        evidenceContexts,
        responseContract: { ...CANONICAL_GENERATION_RESPONSE_CONTRACT },
      };
    })
    .sort((left, right) => compareStable(left.requestId, right.requestId));

  assertUnique(
    requests.map((request) => request.requestId),
    RewriteGenerationInputErrorCode.DuplicateProposalId,
  );

  const summary = {
    totalProposals: requests.length,
    generationReady: requests.length,
    totalEvidenceContexts: requests.reduce((total, request) => total + request.evidenceContexts.length, 0),
  };

  const batch = RewriteGenerationBatchSchema.parse({
    offerId: validatedInput.rewriteProposalResult.offerId,
    profileId: validatedInput.rewriteProposalResult.profileId,
    documentId: validatedInput.rewriteProposalResult.documentId,
    requests,
    summary,
  });

  return deepFreeze(batch);
}

function validateInput(input: BuildRewriteGenerationRequestsInput): ValidatedGenerationInput {
  const rewriteResult = RewriteProposalResultSchema.safeParse(input.rewriteProposalResult);
  if (!rewriteResult.success) {
    throwInputError(RewriteGenerationInputErrorCode.InvalidRewriteResult);
  }
  assertUnique(
    rewriteResult.data.proposals.map((proposal) => proposal.proposalId),
    RewriteGenerationInputErrorCode.DuplicateProposalId,
  );

  const evidences: Evidence[] = [];
  for (const evidence of input.evidences) {
    const evidenceResult = EvidenceSchema.safeParse(evidence);
    if (!evidenceResult.success) {
      throwInputError(RewriteGenerationInputErrorCode.InvalidEvidence);
    }
    evidences.push(evidenceResult.data);
  }
  assertUnique(
    evidences.map((evidence) => evidence.id),
    RewriteGenerationInputErrorCode.DuplicateEvidenceId,
  );

  return {
    rewriteProposalResult: rewriteResult.data,
    evidences,
  };
}

function mapEvidencesById(evidences: Evidence[]): Map<string, Evidence> {
  return new Map(evidences.map((evidence) => [evidence.id, evidence]));
}

function buildEvidenceContext(evidence: Evidence): GenerationEvidenceContext {
  if (evidence.title.trim().length === 0 || evidence.description.trim().length === 0) {
    throwInputError(RewriteGenerationInputErrorCode.EmptyEvidenceContent);
  }

  return {
    evidenceId: evidence.id,
    title: evidence.title,
    description: evidence.description,
    ...(evidence.associatedCompetency === undefined ? {} : { associatedCompetency: evidence.associatedCompetency }),
    ...(evidence.date === undefined ? {} : { date: evidence.date }),
    ...(evidence.tags === undefined ? {} : { tags: [...evidence.tags] }),
    ...(evidence.reference === undefined ? {} : { reference: copyEvidenceReference(evidence.reference) }),
  };
}

function copyEvidenceReference(reference: Evidence["reference"]): GenerationEvidenceContext["reference"] {
  if (reference === undefined) {
    return undefined;
  }

  const copiedReference = {
    ...(reference.profileSection === undefined ? {} : { profileSection: reference.profileSection }),
    ...(reference.experienceId === undefined ? {} : { experienceId: reference.experienceId }),
    ...(reference.projectId === undefined ? {} : { projectId: reference.projectId }),
    ...(reference.educationId === undefined ? {} : { educationId: reference.educationId }),
  };

  return Object.keys(copiedReference).length === 0 ? undefined : copiedReference;
}

function requestId(rewriteProposalResult: RewriteProposalResult, proposalId: string): string {
  return canonicalId("generation-request", [
    ["offer", rewriteProposalResult.offerId],
    ["profile", rewriteProposalResult.profileId],
    ["document", rewriteProposalResult.documentId],
    ["proposal", proposalId],
  ]);
}

function canonicalId(kind: string, parts: Array<[string, string]>): string {
  const encodedParts = parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return [kind, ...encodedParts].join("|");
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function assertUnique<T extends string | number>(values: T[], errorCode: RewriteGenerationInputErrorCode): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      throwInputError(errorCode);
    }
    seen.add(value);
  }
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwInputError(code: RewriteGenerationInputErrorCode): never {
  throw new Error(code);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }

  return value;
}
