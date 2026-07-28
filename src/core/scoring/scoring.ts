import { z } from "zod";
import { RequirementMatchResult, RequirementMatchStatus } from "../matching/types";
import {
  RequirementScoreSchema,
  RequirementSummarySchema,
  ScoringResultSchema,
  StrengthItemSchema,
} from "./types";

const REQUIRED_STATUS_FULL_VALUE: RequirementMatchStatus[] = ["met"];
const REQUIRED_STATUS_PARTIAL_VALUE: RequirementMatchStatus[] = ["partially_met"];
const OPTIONAL_STATUS_FULL_VALUE: RequirementMatchStatus[] = ["met"];

const CLASSIFICATION_THRESHOLDS = {
  excellent_match: 85,
  strong_match: 70,
  moderate_match: 50,
  weak_match: 1,
};

const DEFAULT_SCORING_VERSION = "1.0.0";

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function normalizeWeight(weight?: number): number {
  if (weight === undefined) {
    return 50;
  }
  return Math.min(100, Math.max(0, weight));
}

function requirementRawContribution(match: RequirementMatchResult): number {
  const weight = normalizeWeight(match.weight ?? 50);
  const base = weight * (match.mandatory ? 1.2 : 1);
  switch (match.status) {
    case "met":
      return base;
    case "partially_met":
      return base * 0.5;
    case "unknown":
      return base * 0.5;
    default:
      return 0;
  }
}

function requirementPenalty(match: RequirementMatchResult): number {
  if (!match.mandatory) {
    return 0;
  }
  if (match.status === "not_met") {
    if (match.explanation.toLowerCase().includes("certificación")) {
      return 20;
    }
    return 15;
  }
  if (match.status === "unknown") {
    return 5;
  }
  return 0;
}

export function scoreRequirementMatch(match: RequirementMatchResult): z.infer<typeof RequirementScoreSchema> {
  const weight = normalizeWeight(match.weight);
  const rawContribution = requirementRawContribution(match);
  const penalty = requirementPenalty(match);
  const normalizedContribution = match.status === "unknown"
    ? 0
    : clampScore(Math.max(0, rawContribution - penalty));

  const requirementStatus = match.status;
  const result = {
    requirementId: match.requirementId,
    requirementStatus,
    mandatory: match.mandatory,
    weight,
    rawContribution,
    normalizedContribution,
    penalty: clampScore(penalty),
    confidence: match.confidence,
    explanation: `Aporte derivado del requisito con estado ${requirementStatus} y peso ${weight}.`,
  };

  return RequirementScoreSchema.parse(result);
}

function deterministicGeneratedAt(): string {
  const timestamp = Math.floor(Date.now() / 1000) * 1000;
  return new Date(timestamp).toISOString();
}

function summarizeRequirements(scores: z.infer<typeof RequirementScoreSchema>[]): z.infer<typeof RequirementSummarySchema> {
  const summary = {
    count: scores.length,
    met: scores.filter((item) => item.requirementStatus === "met").length,
    partiallyMet: scores.filter((item) => item.requirementStatus === "partially_met").length,
    notMet: scores.filter((item) => item.requirementStatus === "not_met").length,
    unknown: scores.filter((item) => item.requirementStatus === "unknown").length,
    totalPotential: scores.reduce((sum, item) => sum + item.weight, 0),
  };

  return RequirementSummarySchema.parse(summary);
}

export function calculateGlobalConfidence(scores: z.infer<typeof RequirementScoreSchema>[]): number {
  if (scores.length === 0) {
    return 0.1;
  }
  const knownCount = scores.filter((item) => item.requirementStatus !== "unknown").length;
  const knownRatio = knownCount / scores.length;
  const averageConfidence = scores.reduce((sum, item) => sum + item.confidence, 0) / scores.length;
  const unknownRatio = scores.filter((item) => item.requirementStatus === "unknown").length / scores.length;
  const confidence = averageConfidence * knownRatio * (1 - unknownRatio * 0.3);
  return Math.min(1, Math.max(0, parseFloat(confidence.toFixed(2))));
}

export function classifyScore(score: number, unknownRatio: number): z.infer<typeof ScoringResultSchema> ["classification"] {
  if (score < CLASSIFICATION_THRESHOLDS.weak_match) {
    return "insufficient_information";
  }
  if (unknownRatio >= 0.5) {
    return "insufficient_information";
  }
  if (score >= CLASSIFICATION_THRESHOLDS.excellent_match) {
    return "excellent_match";
  }
  if (score >= CLASSIFICATION_THRESHOLDS.strong_match) {
    return "strong_match";
  }
  if (score >= CLASSIFICATION_THRESHOLDS.moderate_match) {
    return "moderate_match";
  }
  return "weak_match";
}

function buildStrengths(scores: z.infer<typeof RequirementScoreSchema>[]) {
  return scores
    .filter((item) => item.requirementStatus === "met" && item.confidence >= 0.7)
    .map((item) => ({ requirementId: item.requirementId, explanation: item.explanation }));
}

function buildGaps(scores: z.infer<typeof RequirementScoreSchema>[]) {
  return scores
    .filter((item) => item.requirementStatus === "not_met" || (item.requirementStatus === "partially_met" && item.mandatory))
    .map((item) => ({ requirementId: item.requirementId, explanation: item.explanation }));
}

function buildUnknowns(scores: z.infer<typeof RequirementScoreSchema>[]) {
  return scores
    .filter((item) => item.requirementStatus === "unknown")
    .map((item) => ({ requirementId: item.requirementId, explanation: item.explanation }));
}

export function scoreTraceabilityResult(
  profileId: string,
  jobId: string,
  requirementMatches: RequirementMatchResult[],
  scoringVersion = DEFAULT_SCORING_VERSION,
): z.infer<typeof ScoringResultSchema> {
  const requirementScores = requirementMatches.map(scoreRequirementMatch);

  const mandatoryScores = requirementScores.filter((item) => item.mandatory);
  const optionalScores = requirementScores.filter((item) => !item.mandatory);

  const totalPotential = requirementScores.reduce((sum, item) => sum + item.weight * (item.mandatory ? 1.2 : 1), 0);
  const positivePotential = requirementScores.reduce((sum, item) => sum + item.normalizedContribution, 0);
  const rawScore = totalPotential === 0 ? 0 : (positivePotential / totalPotential) * 100;
  const score = clampScore(rawScore);

  const knownCount = requirementScores.filter((item) => item.requirementStatus !== "unknown").length;
  const unknownRatio = requirementScores.length === 0 ? 1 : 1 - knownCount / requirementScores.length;

  const confidence = calculateGlobalConfidence(requirementScores);
  const classification = classifyScore(score, unknownRatio);

  const result = {
    jobId,
    profileId,
    score,
    scoreScale: "0-100" as const,
    classification,
    requirementScores,
    mandatoryRequirementSummary: summarizeRequirements(mandatoryScores),
    optionalRequirementSummary: summarizeRequirements(optionalScores),
    confidence,
    strengths: buildStrengths(requirementScores),
    gaps: buildGaps(requirementScores),
    unknowns: buildUnknowns(requirementScores),
    warnings: requirementMatches.flatMap((match) => match.warnings ?? []),
    generatedAt: deterministicGeneratedAt(),
    scoringVersion,
  };

  return ScoringResultSchema.parse(result);
}
