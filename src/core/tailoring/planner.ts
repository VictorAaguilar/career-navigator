import type { Evidence, Offer, Profile, TailoringActionType, TailoringPlan, TailoringPriority, TailoringTargetSection } from "../../schemas";
import { TailoringPlanSchema } from "../../schemas";
import type { JobMatchResult, RequirementMatchResult } from "../matching";
import type { ScoringResult } from "../scoring";

export const TailoringInputErrorCode = {
  JobIdMismatch: "TAILORING_INPUT_JOB_ID_MISMATCH",
  ProfileIdMismatch: "TAILORING_INPUT_PROFILE_ID_MISMATCH",
  DuplicateMatch: "TAILORING_INPUT_DUPLICATE_MATCH",
  DuplicateScore: "TAILORING_INPUT_DUPLICATE_SCORE",
  RequirementSetMismatch: "TAILORING_INPUT_REQUIREMENT_SET_MISMATCH",
  RequirementStatusMismatch: "TAILORING_INPUT_REQUIREMENT_STATUS_MISMATCH",
} as const;

export type BuildTailoringPlanInput = {
  offer: Offer;
  profile: Profile;
  evidences: Evidence[];
  jobMatchResult: JobMatchResult;
  scoringResult: ScoringResult;
};

type RequirementScore = ScoringResult["requirementScores"][number];

const TARGET_SECTION_BY_CATEGORY: Record<RequirementMatchResult["category"], TailoringTargetSection> = {
  skill: "skills",
  experience: "experience",
  education: "education",
  language: "languages",
  certification: "certifications",
  tool: "skills",
  "soft-skill": "experience",
  other: "other",
};

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function findDuplicateRequirementId<T extends { requirementId: string }>(items: T[]): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.requirementId)) {
      return item.requirementId;
    }
    seen.add(item.requirementId);
  }
  return undefined;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function throwInputError(code: (typeof TailoringInputErrorCode)[keyof typeof TailoringInputErrorCode]): never {
  throw new Error(code);
}

function validateInput(input: BuildTailoringPlanInput): void {
  if (input.offer.id !== input.jobMatchResult.jobId || input.scoringResult.jobId !== input.offer.id || input.scoringResult.jobId !== input.jobMatchResult.jobId) {
    throwInputError(TailoringInputErrorCode.JobIdMismatch);
  }

  if (input.profile.id !== input.jobMatchResult.profileId || input.scoringResult.profileId !== input.profile.id || input.scoringResult.profileId !== input.jobMatchResult.profileId) {
    throwInputError(TailoringInputErrorCode.ProfileIdMismatch);
  }

  if (findDuplicateRequirementId(input.jobMatchResult.requirementMatches)) {
    throwInputError(TailoringInputErrorCode.DuplicateMatch);
  }

  if (findDuplicateRequirementId(input.scoringResult.requirementScores)) {
    throwInputError(TailoringInputErrorCode.DuplicateScore);
  }

  const matchRequirementIds = sortedUnique(input.jobMatchResult.requirementMatches.map((match) => match.requirementId));
  const scoreRequirementIds = sortedUnique(input.scoringResult.requirementScores.map((score) => score.requirementId));
  if (!sameStringSet(matchRequirementIds, scoreRequirementIds)) {
    throwInputError(TailoringInputErrorCode.RequirementSetMismatch);
  }

  const scoreByRequirementId = new Map(input.scoringResult.requirementScores.map((score) => [score.requirementId, score]));
  for (const match of input.jobMatchResult.requirementMatches) {
    const score = scoreByRequirementId.get(match.requirementId);
    if (!score || score.requirementStatus !== match.status) {
      throwInputError(TailoringInputErrorCode.RequirementStatusMismatch);
    }
  }
}

function canonicalId(kind: string, parts: Array<[string, string | string[]]>): string {
  const encodedParts = parts.map(([key, value]) => {
    const encodedValue = Array.isArray(value)
      ? value.map((item) => encodeURIComponent(item)).join(",")
      : encodeURIComponent(value);
    return `${key}=${encodedValue}`;
  });
  return [kind, ...encodedParts].join("|");
}

function priorityForMatch(match: RequirementMatchResult): TailoringPriority {
  if (match.status === "met") {
    return match.mandatory ? "high" : "medium";
  }
  if (match.status === "partially_met") {
    return match.mandatory ? "medium" : "low";
  }
  if (match.status === "unknown") {
    return match.mandatory ? "medium" : "low";
  }
  return match.mandatory ? "high" : "medium";
}

function splitEvidenceIds(match: RequirementMatchResult, evidenceIds: Set<string>): { valid: string[]; invalid: string[] } {
  const deduplicated = sortedUnique(match.matchedEvidenceIds);
  return {
    valid: deduplicated.filter((evidenceId) => evidenceIds.has(evidenceId)),
    invalid: deduplicated.filter((evidenceId) => !evidenceIds.has(evidenceId)),
  };
}

function missingEvidenceWarnings(match: RequirementMatchResult, invalidEvidenceIds: string[]): string[] {
  return invalidEvidenceIds.map((evidenceId) => `Evidence "${evidenceId}" referenced by requirement "${match.requirementId}" was not provided.`);
}

function defaultRequestedInformation(match: RequirementMatchResult): string[] {
  if (match.missingInformation.length > 0) {
    return sortedUnique(match.missingInformation);
  }
  return [`Confirm whether requirement "${match.requirementId}" is supported by real candidate evidence.`];
}

function buildPositiveReason(match: RequirementMatchResult): string {
  if (match.status === "met") {
    return `Requirement "${match.requirementId}" is supported by matched evidence with ${match.matchStrength} match strength.`;
  }
  return `Requirement "${match.requirementId}" is partially supported by matched evidence and should be presented conservatively.`;
}

function actionId(input: BuildTailoringPlanInput, match: RequirementMatchResult, actionType: TailoringActionType, evidenceIds: string[]): string {
  return canonicalId("action", [
    ["offer", input.offer.id],
    ["profile", input.profile.id],
    ["requirement", match.requirementId],
    ["status", match.status],
    ["type", actionType],
    ["evidence", evidenceIds],
  ]);
}

function gapId(input: BuildTailoringPlanInput, match: RequirementMatchResult): string {
  return canonicalId("gap", [
    ["offer", input.offer.id],
    ["profile", input.profile.id],
    ["requirement", match.requirementId],
    ["status", match.status],
  ]);
}

function reviewItemId(input: BuildTailoringPlanInput, match: RequirementMatchResult, reason: "unknown" | "missing-evidence"): string {
  return canonicalId("review", [
    ["offer", input.offer.id],
    ["profile", input.profile.id],
    ["requirement", match.requirementId],
    ["status", match.status],
    ["reason", reason],
  ]);
}

export function buildTailoringPlan(input: BuildTailoringPlanInput): TailoringPlan {
  validateInput(input);

  const evidenceIds = new Set(input.evidences.map((evidence) => evidence.id));
  const warnings = new Set<string>([
    ...input.jobMatchResult.warnings,
    ...input.scoringResult.warnings,
  ]);

  const actions: TailoringPlan["actions"] = [];
  const gaps: TailoringPlan["gaps"] = [];
  const reviewItems: TailoringPlan["reviewItems"] = [];
  const requirementMatches = [...input.jobMatchResult.requirementMatches].sort((left, right) => compareStable(left.requirementId, right.requirementId));

  for (const match of requirementMatches) {
    for (const warning of match.warnings) {
      warnings.add(warning);
    }

    const evidenceSplit = splitEvidenceIds(match, evidenceIds);
    for (const warning of missingEvidenceWarnings(match, evidenceSplit.invalid)) {
      warnings.add(warning);
    }

    const targetSection = TARGET_SECTION_BY_CATEGORY[match.category] ?? "other";
    const priority = priorityForMatch(match);

    if (match.status === "met" || match.status === "partially_met") {
      if (evidenceSplit.valid.length === 0) {
        reviewItems.push({
          reviewItemId: reviewItemId(input, match, "missing-evidence"),
          requirementId: match.requirementId,
          reason: `Requirement "${match.requirementId}" has no provided evidence IDs that can support a positive tailoring action.`,
          priority,
          supportStatus: "needs_confirmation",
          requestedInformation: defaultRequestedInformation(match),
        });
        continue;
      }

      const type: TailoringActionType = "highlight_evidence";
      actions.push({
        actionId: actionId(input, match, type, evidenceSplit.valid),
        type,
        targetSection,
        requirementIds: [match.requirementId],
        evidenceIds: evidenceSplit.valid,
        reason: buildPositiveReason(match),
        supportStatus: match.status === "met" ? "supported" : "partially_supported",
        priority,
      });
      continue;
    }

    if (match.status === "not_met") {
      gaps.push({
        gapId: gapId(input, match),
        requirementId: match.requirementId,
        reason: `Requirement "${match.requirementId}" is not supported by candidate evidence and must not be claimed in the CV.`,
        priority,
        supportStatus: "unsupported",
        missingInformation: sortedUnique(match.missingInformation),
      });
      continue;
    }

    reviewItems.push({
      reviewItemId: reviewItemId(input, match, "unknown"),
      requirementId: match.requirementId,
      reason: `Requirement "${match.requirementId}" needs confirmation before any CV tailoring action is allowed.`,
      priority,
      supportStatus: "needs_confirmation",
      requestedInformation: defaultRequestedInformation(match),
    });
  }

  const summary = {
    totalRequirements: input.jobMatchResult.requirementMatches.length,
    supportedRequirements: input.jobMatchResult.requirementMatches.filter((match) => match.status === "met").length,
    partiallySupportedRequirements: input.jobMatchResult.requirementMatches.filter((match) => match.status === "partially_met").length,
    unsupportedRequirements: input.jobMatchResult.requirementMatches.filter((match) => match.status === "not_met").length,
    unknownRequirements: input.jobMatchResult.requirementMatches.filter((match) => match.status === "unknown").length,
    actionCount: actions.length,
    gapCount: gaps.length,
    reviewItemCount: reviewItems.length,
    score: input.scoringResult.score,
    confidence: input.scoringResult.confidence,
    classification: input.scoringResult.classification,
  };

  return TailoringPlanSchema.parse({
    offerId: input.offer.id,
    profileId: input.profile.id,
    summary,
    actions,
    gaps,
    reviewItems,
    warnings: Array.from(warnings).sort(compareStable),
  });
}
