import type { ResumeDocument, ResumeSectionKind } from "../../schemas/resume";
import { ResumeDocumentSchema } from "../../schemas/resume";
import type { TailoringAction, TailoringPlan, TailoringTargetSection } from "../../schemas/tailoring";
import { TailoringPlanSchema } from "../../schemas/tailoring";
import type { TailoringTargetingResult, TailoringTargetStatus } from "../../schemas/targeting";
import { TailoringTargetingResultSchema } from "../../schemas/targeting";

export const TailoringTargetingInputErrorCode = {
  InvalidTailoringPlan: "TARGETING_INPUT_INVALID_TAILORING_PLAN",
  InvalidResumeDocument: "TARGETING_INPUT_INVALID_RESUME_DOCUMENT",
  ProfileIdMismatch: "TARGETING_INPUT_PROFILE_ID_MISMATCH",
  DuplicateActionId: "TARGETING_INPUT_DUPLICATE_ACTION_ID",
  DuplicateBlockId: "TARGETING_INPUT_DUPLICATE_BLOCK_ID",
  EmptyActionEvidenceId: "TARGETING_INPUT_EMPTY_ACTION_EVIDENCE_ID",
} as const;

export type TailoringTargetingInputErrorCode =
  (typeof TailoringTargetingInputErrorCode)[keyof typeof TailoringTargetingInputErrorCode];

export type ResolveTailoringTargetsInput = {
  tailoringPlan: TailoringPlan;
  resumeDocument: ResumeDocument;
};

type ResumeBlockCandidate = {
  blockId: string;
  sectionKind: ResumeSectionKind;
  evidenceIds: string[];
};

type ScoredCandidate = ResumeBlockCandidate & {
  sharedEvidenceCount: number;
  sectionCompatibilityScore: number;
};

const COMPATIBLE_SECTION_KINDS: Record<TailoringTargetSection, readonly ResumeSectionKind[]> = {
  summary: ["summary"],
  experience: ["experience"],
  projects: ["projects"],
  skills: ["skills"],
  education: ["education"],
  certifications: ["certifications"],
  languages: ["languages"],
  other: ["other"],
};

export function resolveTailoringTargets(input: ResolveTailoringTargetsInput): TailoringTargetingResult {
  const validatedInput = validateInput(input);

  const blocks = flattenBlocks(validatedInput.resumeDocument);
  const resolutions = [...validatedInput.tailoringPlan.actions]
    .sort((left, right) => compareStable(left.actionId, right.actionId))
    .map((action) => resolveAction(action, validatedInput, blocks));

  const summary = {
    totalActions: resolutions.length,
    resolvedCount: resolutions.filter((resolution) => resolution.status === "resolved").length,
    ambiguousCount: resolutions.filter((resolution) => resolution.status === "ambiguous").length,
    unresolvedCount: resolutions.filter((resolution) => resolution.status === "unresolved").length,
  };

  const result = TailoringTargetingResultSchema.parse({
    offerId: validatedInput.tailoringPlan.offerId,
    profileId: validatedInput.tailoringPlan.profileId,
    documentId: validatedInput.resumeDocument.documentId,
    resolutions,
    summary,
  });

  return deepFreeze(result);
}

function validateInput(input: ResolveTailoringTargetsInput): ResolveTailoringTargetsInput {
  validateDefensiveDuplicates(input);

  const planResult = TailoringPlanSchema.safeParse(input.tailoringPlan);
  if (!planResult.success) {
    throwInputError(TailoringTargetingInputErrorCode.InvalidTailoringPlan);
  }

  const documentResult = ResumeDocumentSchema.safeParse(input.resumeDocument);
  if (!documentResult.success) {
    throwInputError(TailoringTargetingInputErrorCode.InvalidResumeDocument);
  }

  if (planResult.data.profileId !== documentResult.data.profileId) {
    throwInputError(TailoringTargetingInputErrorCode.ProfileIdMismatch);
  }

  return {
    tailoringPlan: planResult.data,
    resumeDocument: documentResult.data,
  };
}

function validateDefensiveDuplicates(input: ResolveTailoringTargetsInput): void {
  const actions = arrayProperty(input.tailoringPlan, "actions");
  assertUnique(
    actions
      .map((action) => stringProperty(action, "actionId"))
      .filter((actionId): actionId is string => actionId !== undefined),
    TailoringTargetingInputErrorCode.DuplicateActionId,
  );

  for (const action of actions) {
    const evidenceIds = arrayProperty(action, "evidenceIds");
    for (const evidenceId of evidenceIds) {
      if (typeof evidenceId === "string" && evidenceId.length === 0) {
        throwInputError(TailoringTargetingInputErrorCode.EmptyActionEvidenceId);
      }
    }
  }

  assertUnique(defensiveBlockIds(input.resumeDocument), TailoringTargetingInputErrorCode.DuplicateBlockId);
}

function resolveAction(
  action: TailoringAction,
  input: ResolveTailoringTargetsInput,
  blocks: ResumeBlockCandidate[],
): TailoringTargetingResult["resolutions"][number] {
  const actionEvidenceIds = sortedUnique(action.evidenceIds);
  const actionEvidenceSet = new Set(actionEvidenceIds);
  const candidates = blocks
    .map((block) => scoreCandidate(block, action, actionEvidenceSet))
    .filter((candidate) => candidate.sharedEvidenceCount > 0);

  const bestCandidates = bestScoredCandidates(candidates);
  const status = statusForCandidates(bestCandidates);
  const candidateBlockIds = bestCandidates.map((candidate) => candidate.blockId).sort(compareStable);
  const selectedBlockIds = status === "resolved" ? [candidateBlockIds[0]] : [];

  return {
    resolutionId: resolutionId(input, action),
    actionId: action.actionId,
    status,
    targetSection: action.targetSection,
    requirementIds: sortedUnique(action.requirementIds),
    evidenceIds: actionEvidenceIds,
    candidateBlockIds,
    selectedBlockIds,
    reason: reasonForStatus(status, action.actionId),
  };
}

function flattenBlocks(resumeDocument: ResumeDocument): ResumeBlockCandidate[] {
  return resumeDocument.sections.flatMap((section) =>
    section.blocks.map((block) => ({
      blockId: block.blockId,
      sectionKind: section.kind,
      evidenceIds: sortedUnique(block.evidenceIds),
    })),
  );
}

function scoreCandidate(
  block: ResumeBlockCandidate,
  action: TailoringAction,
  actionEvidenceIds: Set<string>,
): ScoredCandidate {
  const sharedEvidenceCount = block.evidenceIds.filter((evidenceId) => actionEvidenceIds.has(evidenceId)).length;
  const sectionCompatibilityScore = (COMPATIBLE_SECTION_KINDS[action.targetSection] ?? []).includes(block.sectionKind) ? 1 : 0;

  return {
    ...block,
    sharedEvidenceCount,
    sectionCompatibilityScore,
  };
}

function bestScoredCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  if (candidates.length === 0) {
    return [];
  }

  const bestScore = candidates.reduce(
    (best, candidate) =>
      compareCandidateScore(candidate, best) > 0
        ? {
            sharedEvidenceCount: candidate.sharedEvidenceCount,
            sectionCompatibilityScore: candidate.sectionCompatibilityScore,
          }
        : best,
    {
      sharedEvidenceCount: candidates[0].sharedEvidenceCount,
      sectionCompatibilityScore: candidates[0].sectionCompatibilityScore,
    },
  );

  return candidates.filter(
    (candidate) =>
      candidate.sharedEvidenceCount === bestScore.sharedEvidenceCount &&
      candidate.sectionCompatibilityScore === bestScore.sectionCompatibilityScore,
  );
}

function compareCandidateScore(left: ScoredCandidate, right: Pick<ScoredCandidate, "sharedEvidenceCount" | "sectionCompatibilityScore">): number {
  if (left.sharedEvidenceCount !== right.sharedEvidenceCount) {
    return left.sharedEvidenceCount - right.sharedEvidenceCount;
  }
  return left.sectionCompatibilityScore - right.sectionCompatibilityScore;
}

function statusForCandidates(candidates: ScoredCandidate[]): TailoringTargetStatus {
  if (candidates.length === 0) {
    return "unresolved";
  }
  if (candidates.length === 1) {
    return "resolved";
  }
  return "ambiguous";
}

function reasonForStatus(status: TailoringTargetStatus, actionId: string): string {
  if (status === "resolved") {
    return `Action "${actionId}" resolves to one resume block by shared evidence and deterministic section compatibility.`;
  }
  if (status === "ambiguous") {
    return `Action "${actionId}" has multiple equally ranked resume block candidates and requires human review.`;
  }
  return `Action "${actionId}" has no resume block sharing any referenced evidence.`;
}

function resolutionId(input: ResolveTailoringTargetsInput, action: TailoringAction): string {
  return canonicalId("resolution", [
    ["offer", input.tailoringPlan.offerId],
    ["profile", input.tailoringPlan.profileId],
    ["document", input.resumeDocument.documentId],
    ["action", action.actionId],
  ]);
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

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareStable);
}

function assertUnique<T extends string | number>(values: T[], errorCode: TailoringTargetingInputErrorCode): void {
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

function throwInputError(code: TailoringTargetingInputErrorCode): never {
  throw new Error(code);
}

function defensiveBlockIds(resumeDocument: unknown): string[] {
  return arrayProperty(resumeDocument, "sections").flatMap((section) =>
    arrayProperty(section, "blocks")
      .map((block) => stringProperty(block, "blockId"))
      .filter((blockId): blockId is string => blockId !== undefined),
  );
}

function arrayProperty(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const property = value[key];
  return Array.isArray(property) ? property : [];
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const property = value[key];
  return typeof property === "string" ? property : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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
