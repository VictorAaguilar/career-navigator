import { applyApprovedRewrites } from "../../../../src/core/tailoring/apply-approved-rewrites.js";
import { buildResumeExportModel } from "../../../../src/core/tailoring/resume-export-model.js";
import { validateRewriteCandidates } from "../../../../src/core/tailoring/rewrite-candidate-validation.js";
import { buildRewriteGenerationRequests } from "../../../../src/core/tailoring/rewrite-generation.js";
import { buildRewriteProposals } from "../../../../src/core/tailoring/rewrite-proposals.js";
import { buildRewriteReviewDecisions } from "../../../../src/core/tailoring/rewrite-review-decisions.js";
import { buildTailoringPlan } from "../../../../src/core/tailoring/planner.js";
import { resolveTailoringTargets } from "../../../../src/core/tailoring/targeting.js";
import { scoreTraceabilityResult } from "../../../../src/core/scoring/scoring.js";
import { JobMatchResultSchema, type JobMatchResult, type RequirementMatchResult } from "../../../../src/core/matching/types.js";
import type { ApprovedRewriteApplicationResult } from "../../../../src/schemas/application.js";
import type { RewriteCandidateSubmission, RewriteCandidateValidationBatch } from "../../../../src/schemas/candidate.js";
import type { Evidence } from "../../../../src/schemas/evidence.js";
import type { ResumeExportModel } from "../../../../src/schemas/export.js";
import type { RewriteGenerationBatch } from "../../../../src/schemas/generation.js";
import type { Offer } from "../../../../src/schemas/job.js";
import type { Profile } from "../../../../src/schemas/profile.js";
import type { RewriteReviewDecisionBatch, RewriteReviewerDecisionSubmission } from "../../../../src/schemas/review.js";
import type { Requirement } from "../../../../src/schemas/requirement.js";
import type { ResumeDocument } from "../../../../src/schemas/resume.js";
import type { RewriteProposalResult } from "../../../../src/schemas/rewrite.js";
import type { ScoringResult } from "../../../../src/core/scoring/types.js";
import type { TailoringPlan } from "../../../../src/schemas/tailoring.js";
import type { TailoringTargetingResult } from "../../../../src/schemas/targeting.js";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits.js";
import {
  parseJobText,
  parseResumeText,
  significantTokens,
  type ParsedOfferInput,
  type ParsedResumeInput,
} from "./tailoring-demo-parsers.js";

export const TailoringDemoPipelineErrorCode = {
  TooManyProposals: "TAILORING_DEMO_TOO_MANY_PROPOSALS",
  ReviewIncomplete: "TAILORING_DEMO_REVIEW_INCOMPLETE",
  EditedProposalTooLong: "TAILORING_DEMO_EDITED_PROPOSAL_TOO_LONG",
} as const;

export type DemoAnalysisResult = Readonly<{
  parsedResume: ParsedResumeInput;
  parsedOffer: ParsedOfferInput;
  jobMatchResult: JobMatchResult;
  scoringResult: ScoringResult;
  tailoringPlan: TailoringPlan;
  targetingResult: TailoringTargetingResult;
  rewriteProposalResult: RewriteProposalResult;
  generationBatch: RewriteGenerationBatch;
  candidateSubmissions: readonly RewriteCandidateSubmission[];
  validationBatch: RewriteCandidateValidationBatch;
  requirementRows: readonly DemoRequirementRow[];
  proposalRows: readonly DemoProposalRow[];
}>;

export type DemoRequirementRow = Readonly<{
  requirementId: string;
  text: string;
  status: "met" | "partially_met" | "not_met" | "unknown";
  label: string;
  evidenceTexts: readonly string[];
  explanation: string;
  contribution: number;
}>;

export type DemoProposalRow = Readonly<{
  validationId: string;
  requestId: string;
  proposalId: string;
  blockId: string;
  requirementText: string;
  evidenceTexts: readonly string[];
  originalText: string;
  proposedText: string;
  currentCandidateText: string;
  validationStatus: RewriteCandidateValidationBatch["results"][number]["status"];
  findingLabels: readonly string[];
  rationale: string;
}>;

export type DemoReviewDecisionType = "approved" | "rejected" | "changes_requested";

export type DemoReviewState = Readonly<Record<string, DemoReviewDecisionType>>;

export type DemoAppliedResult = Readonly<{
  reviewDecisionBatch: RewriteReviewDecisionBatch;
  applicationResult: ApprovedRewriteApplicationResult;
  exportModel: ResumeExportModel;
}>;

export function runTailoringDemoAnalysis(resumeText: string, jobText: string): DemoAnalysisResult {
  const parsedResume = parseResumeText(resumeText);
  const parsedOffer = parseJobText(jobText);
  const jobMatchResult = buildDeterministicJobMatch(
    parsedResume.profile,
    parsedOffer.offer,
    parsedResume.evidences,
  );
  const scoringResult = scoreTraceabilityResult(
    parsedResume.profile.id,
    parsedOffer.offer.id,
    jobMatchResult.requirementMatches,
    "tailoring-ui-demo-v1",
  );
  const tailoringPlan = buildTailoringPlan({
    profile: parsedResume.profile,
    offer: parsedOffer.offer,
    evidences: parsedResume.evidences,
    jobMatchResult,
    scoringResult,
  });
  const targetingResult = resolveTailoringTargets({
    tailoringPlan,
    resumeDocument: parsedResume.resumeDocument,
  });
  const rewriteProposalResult = buildRewriteProposals({
    tailoringPlan,
    targetingResult,
    resumeDocument: parsedResume.resumeDocument,
  });

  if (rewriteProposalResult.proposals.length > TAILORING_DEMO_LIMITS.maxProposals) {
    throw new Error(TailoringDemoPipelineErrorCode.TooManyProposals);
  }

  const generationBatch = buildRewriteGenerationRequests({
    rewriteProposalResult,
    evidences: parsedResume.evidences,
  });
  const candidateSubmissions = buildCandidateSubmissions(generationBatch, parsedOffer.offer);
  const validationBatch = validateRewriteCandidates({
    generationBatch,
    candidates: candidateSubmissions,
  });

  return deepFreeze({
    parsedResume,
    parsedOffer,
    jobMatchResult,
    scoringResult,
    tailoringPlan,
    targetingResult,
    rewriteProposalResult,
    generationBatch,
    candidateSubmissions,
    validationBatch,
    requirementRows: buildRequirementRows(parsedOffer.offer, jobMatchResult, scoringResult, parsedResume.evidences),
    proposalRows: buildProposalRows(parsedOffer.offer, parsedResume.evidences, generationBatch, validationBatch),
  });
}

export function rebuildValidationWithCandidates(
  analysis: DemoAnalysisResult,
  candidates: readonly RewriteCandidateSubmission[],
): Pick<DemoAnalysisResult, "candidateSubmissions" | "validationBatch" | "proposalRows"> {
  for (const candidate of candidates) {
    if (candidate.candidateText.length > TAILORING_DEMO_LIMITS.editedProposalMaxLength) {
      throw new Error(TailoringDemoPipelineErrorCode.EditedProposalTooLong);
    }
  }
  const validationBatch = validateRewriteCandidates({
    generationBatch: analysis.generationBatch,
    candidates: candidates.map((candidate) => ({ ...candidate })),
  });
  return deepFreeze({
    candidateSubmissions: validationBatch.results.map((result) => ({
      requestId: result.requestId,
      candidateText: result.candidateText,
    })),
    validationBatch,
    proposalRows: buildProposalRows(
      analysis.parsedOffer.offer,
      analysis.parsedResume.evidences,
      analysis.generationBatch,
      validationBatch,
    ),
  });
}

export function applyTailoringDemoReview(
  analysis: DemoAnalysisResult,
  decisions: DemoReviewState,
): DemoAppliedResult {
  const submissions = analysis.validationBatch.results.map((result): RewriteReviewerDecisionSubmission => {
    const decision = decisions[result.validationId];
    if (decision === undefined) {
      throw new Error(TailoringDemoPipelineErrorCode.ReviewIncomplete);
    }
    return {
      validationId: result.validationId,
      decision,
      rationale: rationaleForDecision(decision, result.status),
    };
  });
  const reviewDecisionBatch = buildRewriteReviewDecisions({
    validationBatch: analysis.validationBatch,
    decisions: submissions,
  });
  const applicationResult = applyApprovedRewrites({
    resumeDocument: analysis.parsedResume.resumeDocument,
    reviewDecisionBatch,
  });
  const exportModel = buildResumeExportModel({ applicationResult });

  return deepFreeze({ reviewDecisionBatch, applicationResult, exportModel });
}

export function isReviewComplete(analysis: DemoAnalysisResult | null, decisions: DemoReviewState): boolean {
  if (analysis === null || analysis.validationBatch.results.length === 0) {
    return analysis !== null;
  }
  return analysis.validationBatch.results.every((result) => decisions[result.validationId] !== undefined);
}

export function decisionIsApplicable(
  result: RewriteCandidateValidationBatch["results"][number],
  decision: DemoReviewDecisionType,
): boolean {
  return !(result.status === "rejected" && decision === "approved");
}

function buildDeterministicJobMatch(profile: Profile, offer: Offer, evidences: Evidence[]): JobMatchResult {
  const requirementMatches = offer.requirements.map((requirement) => matchRequirementDeterministically(requirement, evidences));
  const result = {
    jobId: offer.id,
    profileId: profile.id,
    requirementMatches,
    totalRequirements: requirementMatches.length,
    metRequirements: requirementMatches.filter((match) => match.status === "met").length,
    partiallyMetRequirements: requirementMatches.filter((match) => match.status === "partially_met").length,
    notMetRequirements: requirementMatches.filter((match) => match.status === "not_met").length,
    unknownRequirements: requirementMatches.filter((match) => match.status === "unknown").length,
    generatedAt: "deterministic_ui_demo_no_runtime_timestamp",
    warnings: [],
  };
  return JobMatchResultSchema.parse(result);
}

function matchRequirementDeterministically(requirement: Requirement, evidences: Evidence[]): RequirementMatchResult {
  const requirementTokens = significantTokens(requirement.originalText);
  if (requirementTokens.length === 0) {
    return {
      requirementId: requirement.id,
      category: requirement.category,
      status: "unknown",
      mandatory: requirement.isRequired,
      weight: requirement.weight,
      matchedEvidenceIds: [],
      matchStrength: "unknown",
      confidence: 0.2,
      explanation: "No hay tokens suficientes para evaluar el requisito de forma determinista.",
      missingInformation: ["Confirmar el requisito manualmente."],
      warnings: ["Requisito ambiguo: requiere revisión humana."],
    };
  }

  const scored = evidences
    .map((evidence) => {
      const evidenceTokens = new Set(significantTokens(`${evidence.title} ${evidence.description} ${(evidence.tags ?? []).join(" ")}`));
      const hitCount = requirementTokens.filter((token) => evidenceTokens.has(token)).length;
      return { evidence, hitCount };
    })
    .filter((item) => item.hitCount > 0)
    .sort((left, right) => right.hitCount - left.hitCount || compareStable(left.evidence.id, right.evidence.id));

  if (scored.length === 0) {
    return {
      requirementId: requirement.id,
      category: requirement.category,
      status: "not_met",
      mandatory: requirement.isRequired,
      weight: requirement.weight,
      matchedEvidenceIds: [],
      matchStrength: "none",
      confidence: 0.78,
      explanation: "No se ha encontrado evidencia literal suficiente en el currículum.",
      missingInformation: [requirement.originalText],
      warnings: [],
    };
  }

  const best = scored[0];
  const coverage = best.hitCount / requirementTokens.length;
  const status = coverage >= 0.5 || best.hitCount >= 2 ? "met" : "partially_met";
  return {
    requirementId: requirement.id,
    category: requirement.category,
    status,
    mandatory: requirement.isRequired,
    weight: requirement.weight,
    matchedEvidenceIds: [best.evidence.id],
    matchStrength: status === "met" ? "strong" : "partial",
    confidence: status === "met" ? 0.82 : 0.62,
    explanation:
      status === "met"
        ? "El requisito comparte evidencia literal con el currículum."
        : "El requisito comparte una señal parcial con el currículum y requiere revisión.",
    missingInformation: status === "met" ? [] : [requirement.originalText],
    warnings: status === "met" ? [] : ["Evidencia parcial: revisar antes de adaptar."],
  };
}

function buildCandidateSubmissions(
  generationBatch: RewriteGenerationBatch,
  offer: Offer,
): RewriteCandidateSubmission[] {
  const requirementsById = new Map(offer.requirements.map((requirement) => [requirement.id, requirement]));
  return generationBatch.requests.map((request) => ({
    requestId: request.requestId,
    candidateText: proposeCandidateText(
      request.originalText,
      request.requirementIds
        .map((requirementId) => requirementsById.get(requirementId)?.originalText)
        .filter((value): value is string => value !== undefined),
    ),
  }));
}

function proposeCandidateText(originalText: string, requirementTexts: readonly string[]): string {
  const sentences = splitSentences(originalText);
  if (sentences.length < 2) {
    return originalText;
  }
  const requirementTokens = new Set(requirementTexts.flatMap(significantTokens));
  const scored = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      hits: significantTokens(sentence).filter((token) => requirementTokens.has(token)).length,
    }))
    .sort((left, right) => right.hits - left.hits || left.index - right.index);

  const best = scored[0];
  if (best.hits === 0 || best.index === 0) {
    return originalText;
  }
  return [best.sentence, ...sentences.filter((_, index) => index !== best.index)].join(" ");
}

function splitSentences(value: string): string[] {
  const sentences = value
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  return sentences.length > 0 ? sentences : [value];
}

function buildRequirementRows(
  offer: Offer,
  jobMatchResult: JobMatchResult,
  scoringResult: ScoringResult,
  evidences: Evidence[],
): DemoRequirementRow[] {
  const requirementsById = new Map(offer.requirements.map((requirement) => [requirement.id, requirement]));
  const scoresById = new Map(scoringResult.requirementScores.map((score) => [score.requirementId, score]));
  const evidencesById = new Map(evidences.map((evidence) => [evidence.id, evidence]));
  return jobMatchResult.requirementMatches.map((match) => ({
    requirementId: match.requirementId,
    text: requirementsById.get(match.requirementId)?.originalText ?? match.requirementId,
    status: match.status,
    label: statusLabel(match.status),
    evidenceTexts: match.matchedEvidenceIds
      .map((evidenceId) => evidencesById.get(evidenceId)?.description)
      .filter((value): value is string => value !== undefined),
    explanation: match.explanation,
    contribution: scoresById.get(match.requirementId)?.normalizedContribution ?? 0,
  }));
}

function buildProposalRows(
  offer: Offer,
  evidences: Evidence[],
  generationBatch: RewriteGenerationBatch,
  validationBatch: RewriteCandidateValidationBatch,
): DemoProposalRow[] {
  const requirementsById = new Map(offer.requirements.map((requirement) => [requirement.id, requirement]));
  const evidencesById = new Map(evidences.map((evidence) => [evidence.id, evidence]));
  const requestsById = new Map(generationBatch.requests.map((request) => [request.requestId, request]));
  return validationBatch.results.map((result) => {
    const request = requestsById.get(result.requestId);
    const requirementText = request?.requirementIds
      .map((requirementId) => requirementsById.get(requirementId)?.originalText)
      .filter((value): value is string => value !== undefined)
      .join(" · ") ?? "Requisito relacionado";
    return {
      validationId: result.validationId,
      requestId: result.requestId,
      proposalId: result.proposalId,
      blockId: result.blockId,
      requirementText,
      evidenceTexts: (request?.evidenceIds ?? [])
        .map((evidenceId) => evidencesById.get(evidenceId)?.description)
        .filter((value): value is string => value !== undefined),
      originalText: result.originalText,
      proposedText: request ? proposeCandidateText(result.originalText, [requirementText]) : result.candidateText,
      currentCandidateText: result.candidateText,
      validationStatus: result.status,
      findingLabels: result.findings.map((finding) => findingLabel(finding.code)),
      rationale: "Propuesta generada solo a partir del bloque original y evidencia enlazada.",
    };
  });
}

function statusLabel(status: RequirementMatchResult["status"]): string {
  if (status === "met") {
    return "Cubierto";
  }
  if (status === "partially_met") {
    return "Parcial";
  }
  if (status === "not_met") {
    return "No cubierto";
  }
  return "Por confirmar";
}

function findingLabel(code: RewriteCandidateValidationBatch["results"][number]["findings"][number]["code"]): string {
  const labels: Record<typeof code, string> = {
    candidate_contains_markdown: "Contiene Markdown",
    candidate_added_unsupported_date: "Añade una fecha no autorizada",
    candidate_removed_original_date: "Elimina una fecha original",
    candidate_added_unsupported_metric: "Añade una métrica no autorizada",
    candidate_removed_original_metric: "Elimina una métrica original",
    candidate_added_unverified_proper_noun: "Añade un nombre propio no verificado",
    candidate_removed_original_proper_noun: "Elimina un nombre propio original",
    candidate_unchanged: "No cambia el texto original",
  };
  return labels[code];
}

function rationaleForDecision(
  decision: DemoReviewDecisionType,
  validationStatus: RewriteCandidateValidationBatch["results"][number]["status"],
): string {
  if (decision === "approved") {
    return validationStatus === "human_review"
      ? "Aprobado manualmente tras revisar advertencias."
      : "Aprobado manualmente tras validación determinista.";
  }
  if (decision === "rejected") {
    return "Rechazado manualmente; no se aplicará al currículum.";
  }
  return "Cambios solicitados; no se aplicará en esta pasada.";
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
