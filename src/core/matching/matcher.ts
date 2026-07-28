import { z } from "zod";
import { Evidence, Offer, Profile, Requirement } from "../../schemas";
import {
  JobMatchResultSchema,
  MatchStrength,
  MatchStrengthSchema,
  RequirementMatchResult,
  RequirementMatchResultSchema,
  RequirementMatchStatus,
  RequirementMatchStatusSchema,
} from "./types";

const requirementLevelRank: Record<string, number> = {
  unspecified: 0,
  basic: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

const evidenceLevelRank: Record<string, number> = {
  unspecified: 0,
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
  master: 5,
};

const strengthPriority: Record<MatchStrength, number> = {
  exact: 4,
  strong: 3,
  partial: 2,
  unknown: 1,
  none: 0,
};

const statusPriority: Record<RequirementMatchStatus, number> = {
  met: 4,
  partially_met: 3,
  unknown: 2,
  not_met: 1,
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getEvidenceTextCandidates(evidence: Evidence): string[] {
  const candidates = [evidence.associatedCompetency, evidence.title, evidence.description];
  if (evidence.tags) {
    candidates.push(...evidence.tags);
  }
  return candidates.filter((value): value is string => Boolean(value)).map(normalizeText);
}

function getRequirementTextCandidates(requirement: Requirement): string[] {
  const candidates = [
    requirement.competencyOrTool,
    requirement.certification,
    requirement.education,
    requirement.language,
    requirement.originalText,
  ];
  return candidates.filter((value): value is string => Boolean(value)).map(normalizeText);
}

function hasExactNormalizedMatch(requirement: Requirement, evidence: Evidence): boolean {
  const requirementCandidates = getRequirementTextCandidates(requirement);
  const evidenceCandidates = getEvidenceTextCandidates(evidence);
  return requirementCandidates.some((requirementValue) => evidenceCandidates.includes(requirementValue));
}

function hasTagMatch(requirement: Requirement, evidence: Evidence): boolean {
  if (!evidence.tags?.length) {
    return false;
  }
  const requirementCandidates = getRequirementTextCandidates(requirement);
  const evidenceTags = evidence.tags.map(normalizeText);
  return requirementCandidates.some((requirementValue) => evidenceTags.includes(requirementValue));
}

function isCertificationEvidence(requirement: Requirement, evidence: Evidence): boolean {
  return requirement.category === "certification" && evidence.type === "certification";
}

function isEducationEvidence(requirement: Requirement, evidence: Evidence): boolean {
  return requirement.category === "education" && evidence.type === "education";
}

function isLanguageEvidence(requirement: Requirement, evidence: Evidence): boolean {
  return requirement.category === "language" && evidence.type === "certification";
}

function isRelevantEvidence(requirement: Requirement, evidence: Evidence): boolean {
  if (requirement.category === "certification") {
    return evidence.type === "certification";
  }
  if (requirement.category === "education") {
    return evidence.type === "education";
  }
  if (requirement.category === "language") {
    return evidence.type === "certification";
  }
  return true;
}

function compareLevels(requirementLevel: string, evidenceLevel: string): "sufficient" | "insufficient" | "unknown" {
  const requiredRank = requirementLevelRank[requirementLevel] ?? 0;
  const evidenceRank = evidenceLevelRank[evidenceLevel] ?? 0;
  if (requiredRank === 0) {
    return "sufficient";
  }
  if (evidenceRank === 0) {
    return "unknown";
  }
  return evidenceRank >= requiredRank ? "sufficient" : "insufficient";
}

function computeConfidenceFromEvidence(
  matchStrength: MatchStrength,
  evidenceConfidence: number | undefined,
  verified: boolean,
  missingInfoCount: number,
): number {
  const base = evidenceConfidence ?? 0.5;
  const verificationBonus = verified ? 0.1 : 0;
  const strengthBonus = matchStrength === "exact" ? 0.15 : matchStrength === "strong" ? 0.1 : matchStrength === "partial" ? 0 : matchStrength === "none" ? -0.1 : -0.2;
  const missingPenalty = Math.min(0.25, missingInfoCount * 0.05);
  const confidence = base + verificationBonus + strengthBonus - missingPenalty;
  return Math.min(1, Math.max(0, confidence));
}

function selectBestMatch<T extends { status: RequirementMatchStatus; matchStrength: MatchStrength }>(candidates: T[]): T | undefined {
  return candidates.reduce<T | undefined>((best, current) => {
    if (!best) {
      return current;
    }
    if (statusPriority[current.status] > statusPriority[best.status]) {
      return current;
    }
    if (current.status === best.status && strengthPriority[current.matchStrength] > strengthPriority[best.matchStrength]) {
      return current;
    }
    return best;
  }, undefined);
}

function createExplanation(
  requirement: Requirement,
  status: RequirementMatchStatus,
  matchStrength: MatchStrength,
  evidenceIds: string[],
  missingInformation: string[],
): string {
  const requirementText = normalizeText(requirement.originalText || requirement.certification || requirement.education || requirement.language || requirement.competencyOrTool || "requisito");
  if (status === "met") {
    return `Requisito respaldado por evidencia explícita relacionada con “${requirementText}”.`;
  }
  if (status === "partially_met") {
    if (missingInformation.length > 0) {
      return `Se encontró evidencia relacionada con “${requirementText}”, pero hay información incompleta: ${missingInformation.join("; ")}.`;
    }
    return `Se encontró evidencia relevante para “${requirementText}”, pero el ajuste es parcial.`;
  }
  if (status === "unknown") {
    return `No se puede determinar con certeza si el requisito “${requirementText}” se cumple debido a información insuficiente.`;
  }
  return `No se encontró evidencia suficiente para respaldar el requisito “${requirementText}”.`;
}

function normalizeRequirementWeight(weight?: number): number {
  if (weight === undefined) {
    return 50;
  }
  return Math.min(100, Math.max(0, weight));
}

function buildRequirementResult(
  requirement: Requirement,
  status: RequirementMatchStatus,
  matchStrength: MatchStrength,
  evidenceIds: string[],
  missingInformation: string[],
  warnings: string[],
  confidence: number,
): RequirementMatchResult {
  const result: RequirementMatchResult = {
    requirementId: requirement.id,
    category: requirement.category,
    mandatory: requirement.isRequired,
    weight: normalizeRequirementWeight(requirement.weight),
    status,
    matchedEvidenceIds: evidenceIds,
    matchStrength,
    confidence,
    explanation: createExplanation(requirement, status, matchStrength, evidenceIds, missingInformation),
    missingInformation,
    warnings,
  };
  return RequirementMatchResultSchema.parse(result);
}

function evaluateEvidenceCandidate(
  requirement: Requirement,
  evidence: Evidence,
): {
  evidenceId: string;
  status: RequirementMatchStatus;
  matchStrength: MatchStrength;
  missingInformation: string[];
  warnings: string[];
  confidence: number;
} {
  const evidenceId = evidence.id;
  const missingInformation: string[] = [];
  const warnings: string[] = [];
  const benefitsMatch = hasExactNormalizedMatch(requirement, evidence);
  const tagMatch = hasTagMatch(requirement, evidence);
  const levelComparison = compareLevels(requirement.level, evidence.declaredLevel);

  const relevant = isRelevantEvidence(requirement, evidence);
  if (!relevant || (!benefitsMatch && !tagMatch)) {
    return {
      evidenceId,
      status: "not_met",
      matchStrength: "none",
      missingInformation,
      warnings,
      confidence: computeConfidenceFromEvidence("none", evidence.confidence, evidence.verified, 0),
    };
  }

  if (levelComparison === "insufficient") {
    missingInformation.push("El nivel de la evidencia es inferior al requerido.");
  }

  if (requirement.yearsExperience !== undefined) {
    missingInformation.push("No hay información explícita de años de experiencia disponible.");
  }

  if (requirement.level !== "unspecified" && evidence.declaredLevel === "unspecified") {
    missingInformation.push("No hay nivel de competencia declarado en la evidencia.");
  }

  if (!evidence.verified) {
    warnings.push("La evidencia no está verificada.");
  }
  if (evidence.confidence < 0.5) {
    warnings.push("La confianza declarada en la evidencia es baja.");
  }

  const matchStrength: MatchStrength = benefitsMatch && !tagMatch ? "exact" : benefitsMatch && tagMatch ? "strong" : "partial";

  const status: RequirementMatchStatus = levelComparison === "insufficient" ? "partially_met" : requirement.yearsExperience !== undefined || (requirement.level !== "unspecified" && evidence.declaredLevel === "unspecified") ? "partially_met" : "met";

  const confidence = computeConfidenceFromEvidence(matchStrength, evidence.confidence, evidence.verified, missingInformation.length);
  return {
    evidenceId,
    status,
    matchStrength,
    missingInformation,
    warnings,
    confidence,
  };
}

function matchRequirementWithEvidence(
  requirement: Requirement,
  evidences: Evidence[],
): RequirementMatchResult {
  const candidates = evidences.map((evidence) => evaluateEvidenceCandidate(requirement, evidence));
  const validCandidates = candidates.filter((candidate) => candidate.status !== "not_met");

  if (validCandidates.length === 0) {
    return buildRequirementResult(requirement, "not_met", "none", [], [], [], 0.2);
  }

  const bestCandidate = selectBestMatch(validCandidates)!;
  const evidenceIds = validCandidates.map((candidate) => candidate.evidenceId);
  const aggregateMissingInformation = Array.from(new Set(validCandidates.flatMap((candidate) => candidate.missingInformation)));
  const aggregateWarnings = Array.from(new Set(validCandidates.flatMap((candidate) => candidate.warnings)));

  return buildRequirementResult(
    requirement,
    bestCandidate.status,
    bestCandidate.matchStrength,
    evidenceIds,
    aggregateMissingInformation,
    aggregateWarnings,
    bestCandidate.confidence,
  );
}

function matchLanguageRequirement(
  requirement: Requirement,
  profile: Profile,
  evidences: Evidence[],
): RequirementMatchResult {
  const providedLanguages = profile.languages?.map(normalizeText) ?? [];
  const requirementLanguage = normalizeText(requirement.language ?? requirement.originalText);
  const languagePresent = providedLanguages.includes(requirementLanguage);
  const relatedEvidence = evidences.filter((evidence) => isLanguageEvidence(requirement, evidence) && hasExactNormalizedMatch(requirement, evidence));
  const missingInformation: string[] = [];
  const warnings: string[] = [];

  if (relatedEvidence.length > 0) {
    if (requirement.level !== "unspecified") {
      missingInformation.push("No hay información explícita de nivel de idioma en la evidencia certificada.");
      return buildRequirementResult(
        requirement,
        "partially_met",
        "strong",
        relatedEvidence.map((evidence) => evidence.id),
        missingInformation,
        warnings,
        computeConfidenceFromEvidence("strong", relatedEvidence[0].confidence, relatedEvidence[0].verified, missingInformation.length),
      );
    }
    return buildRequirementResult(
      requirement,
      "met",
      "strong",
      relatedEvidence.map((evidence) => evidence.id),
      missingInformation,
      warnings,
      computeConfidenceFromEvidence("strong", relatedEvidence[0].confidence, relatedEvidence[0].verified, 0),
    );
  }

  if (languagePresent) {
    if (requirement.level !== "unspecified") {
      missingInformation.push("No hay información explícita de nivel de idioma en el perfil.");
      return buildRequirementResult(
        requirement,
        "partially_met",
        "strong",
        [],
        missingInformation,
        warnings,
        computeConfidenceFromEvidence("strong", 0.8, false, missingInformation.length),
      );
    }
    return buildRequirementResult(
      requirement,
      "met",
      "strong",
      [],
      missingInformation,
      warnings,
      computeConfidenceFromEvidence("strong", 0.8, false, 0),
    );
  }

  return buildRequirementResult(
    requirement,
    "not_met",
    "none",
    [],
    [],
    warnings,
    0.2,
  );
}

export function matchRequirement(
  requirement: Requirement,
  evidences: Evidence[],
  profile?: Profile,
): RequirementMatchResult {
  if (requirement.category === "language") {
    if (!profile) {
      return buildRequirementResult(requirement, "unknown", "unknown", [], ["No hay información de perfil para evaluar el idioma."], [], 0.3);
    }
    return matchLanguageRequirement(requirement, profile, evidences);
  }
  return matchRequirementWithEvidence(requirement, evidences);
}

export function evaluateJobRequirements(profile: Profile, offer: Offer, evidences: Evidence[]): z.infer<typeof JobMatchResultSchema> {
  const requirementMatches = offer.requirements.map((requirement) => {
    const match = matchRequirement(requirement, evidences, profile);
    return match;
  });

  const jobMatchResult = {
    jobId: offer.id,
    profileId: profile.id,
    requirementMatches,
    totalRequirements: requirementMatches.length,
    metRequirements: requirementMatches.filter((match) => match.status === "met").length,
    partiallyMetRequirements: requirementMatches.filter((match) => match.status === "partially_met").length,
    notMetRequirements: requirementMatches.filter((match) => match.status === "not_met").length,
    unknownRequirements: requirementMatches.filter((match) => match.status === "unknown").length,
    generatedAt: new Date().toISOString(),
    warnings: Array.from(new Set(requirementMatches.flatMap((match) => match.warnings))),
  };

  return JobMatchResultSchema.parse(jobMatchResult);
}
