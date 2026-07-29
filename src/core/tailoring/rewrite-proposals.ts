import type { ResumeDocument } from "../../schemas/resume";
import { ResumeDocumentSchema } from "../../schemas/resume";
import type { TailoringAction, TailoringPlan } from "../../schemas/tailoring";
import { TailoringPlanSchema } from "../../schemas/tailoring";
import type { TailoringTargetResolution, TailoringTargetingResult } from "../../schemas/targeting";
import { TailoringTargetingResultSchema } from "../../schemas/targeting";
import type { RewriteProposalResult, RewriteSkippedReason } from "../../schemas/rewrite";
import { CANONICAL_REWRITE_CONSTRAINTS, RewriteProposalResultSchema } from "../../schemas/rewrite";

export const RewriteProposalInputErrorCode = {
  InvalidTailoringPlan: "REWRITE_INPUT_INVALID_TAILORING_PLAN",
  InvalidTargetingResult: "REWRITE_INPUT_INVALID_TARGETING_RESULT",
  InvalidResumeDocument: "REWRITE_INPUT_INVALID_RESUME_DOCUMENT",
  ProfileIdMismatch: "REWRITE_INPUT_PROFILE_ID_MISMATCH",
  OfferIdMismatch: "REWRITE_INPUT_OFFER_ID_MISMATCH",
  DocumentIdMismatch: "REWRITE_INPUT_DOCUMENT_ID_MISMATCH",
  DuplicateActionId: "REWRITE_INPUT_DUPLICATE_ACTION_ID",
  DuplicateResolutionId: "REWRITE_INPUT_DUPLICATE_RESOLUTION_ID",
  ActionNotFound: "REWRITE_INPUT_ACTION_NOT_FOUND",
  ResolutionNotFound: "REWRITE_INPUT_RESOLUTION_NOT_FOUND",
  BlockNotFound: "REWRITE_INPUT_BLOCK_NOT_FOUND",
  ActionResolutionMismatch: "REWRITE_INPUT_ACTION_RESOLUTION_MISMATCH",
  RequirementSetMismatch: "REWRITE_INPUT_REQUIREMENT_SET_MISMATCH",
  EvidenceSetMismatch: "REWRITE_INPUT_EVIDENCE_SET_MISMATCH",
  NoSharedEvidence: "REWRITE_PROPOSAL_NO_SHARED_EVIDENCE",
} as const;

export type RewriteProposalInputErrorCode =
  (typeof RewriteProposalInputErrorCode)[keyof typeof RewriteProposalInputErrorCode];

export type BuildRewriteProposalsInput = {
  tailoringPlan: TailoringPlan;
  targetingResult: TailoringTargetingResult;
  resumeDocument: ResumeDocument;
};

type ValidatedRewriteInput = {
  tailoringPlan: TailoringPlan;
  targetingResult: TailoringTargetingResult;
  resumeDocument: ResumeDocument;
};

type LocatedBlock = {
  sectionId: string;
  blockId: string;
  originalText: string;
  evidenceIds: string[];
};

export function buildRewriteProposals(input: BuildRewriteProposalsInput): RewriteProposalResult {
  const validatedInput = validateInput(input);
  const actionsById = mapActionsById(validatedInput.tailoringPlan.actions);
  const blocksById = mapBlocksById(validatedInput.resumeDocument);

  const proposals: RewriteProposalResult["proposals"] = [];
  const skippedItems: RewriteProposalResult["skippedItems"] = [];

  const resolutions = [...validatedInput.targetingResult.resolutions].sort((left, right) =>
    compareStable(left.resolutionId, right.resolutionId),
  );

  for (const resolution of resolutions) {
    const action = actionsById.get(resolution.actionId);
    if (!action) {
      throwInputError(RewriteProposalInputErrorCode.ActionNotFound);
    }
    validateActionResolutionCoherence(action, resolution);

    if (resolution.status === "ambiguous") {
      skippedItems.push(buildSkippedItem(validatedInput, resolution, "ambiguous_target"));
      continue;
    }
    if (resolution.status === "unresolved") {
      skippedItems.push(buildSkippedItem(validatedInput, resolution, "unresolved_target"));
      continue;
    }

    const selectedBlockId = resolution.selectedBlockIds[0];
    const block = blocksById.get(selectedBlockId);
    if (!block) {
      throwInputError(RewriteProposalInputErrorCode.BlockNotFound);
    }

    if (action.type === "retain_content") {
      skippedItems.push(buildSkippedItem(validatedInput, resolution, "no_rewrite_required"));
      continue;
    }
    if (action.type === "prioritize_section") {
      skippedItems.push(buildSkippedItem(validatedInput, resolution, "structural_change_required"));
      continue;
    }

    const evidenceIds = sharedEvidenceIds(action, resolution, block);
    if (evidenceIds.length === 0) {
      throwInputError(RewriteProposalInputErrorCode.NoSharedEvidence);
    }

    proposals.push({
      proposalId: proposalId(validatedInput, action, resolution, block.blockId),
      actionId: action.actionId,
      resolutionId: resolution.resolutionId,
      sectionId: block.sectionId,
      blockId: block.blockId,
      actionType: action.type,
      targetSection: action.targetSection,
      requirementIds: sortedUnique(action.requirementIds),
      evidenceIds,
      originalText: block.originalText,
      rewriteGoal: "emphasize_supported_evidence",
      constraints: [...CANONICAL_REWRITE_CONSTRAINTS],
    });
  }

  const sortedProposals = [...proposals].sort((left, right) => compareStable(left.proposalId, right.proposalId));
  const sortedSkippedItems = [...skippedItems].sort((left, right) => compareStable(left.skippedItemId, right.skippedItemId));
  const summary = {
    totalResolutions: validatedInput.targetingResult.resolutions.length,
    readyProposals: sortedProposals.length,
    ambiguousTargets: sortedSkippedItems.filter((item) => item.reason === "ambiguous_target").length,
    unresolvedTargets: sortedSkippedItems.filter((item) => item.reason === "unresolved_target").length,
    noRewriteRequired: sortedSkippedItems.filter(
      (item) => item.reason === "no_rewrite_required" || item.reason === "structural_change_required",
    ).length,
  };

  const result = RewriteProposalResultSchema.parse({
    offerId: validatedInput.tailoringPlan.offerId,
    profileId: validatedInput.tailoringPlan.profileId,
    documentId: validatedInput.resumeDocument.documentId,
    proposals: sortedProposals,
    skippedItems: sortedSkippedItems,
    summary,
  });

  return deepFreeze(result);
}

function validateInput(input: BuildRewriteProposalsInput): ValidatedRewriteInput {
  validateDefensiveDuplicates(input);

  const planResult = TailoringPlanSchema.safeParse(input.tailoringPlan);
  if (!planResult.success) {
    throwInputError(RewriteProposalInputErrorCode.InvalidTailoringPlan);
  }
  const targetingResult = TailoringTargetingResultSchema.safeParse(input.targetingResult);
  if (!targetingResult.success) {
    throwInputError(RewriteProposalInputErrorCode.InvalidTargetingResult);
  }
  const documentResult = ResumeDocumentSchema.safeParse(input.resumeDocument);
  if (!documentResult.success) {
    throwInputError(RewriteProposalInputErrorCode.InvalidResumeDocument);
  }

  if (
    planResult.data.profileId !== targetingResult.data.profileId ||
    planResult.data.profileId !== documentResult.data.profileId
  ) {
    throwInputError(RewriteProposalInputErrorCode.ProfileIdMismatch);
  }
  if (planResult.data.offerId !== targetingResult.data.offerId) {
    throwInputError(RewriteProposalInputErrorCode.OfferIdMismatch);
  }
  if (targetingResult.data.documentId !== documentResult.data.documentId) {
    throwInputError(RewriteProposalInputErrorCode.DocumentIdMismatch);
  }

  assertUnique(
    targetingResult.data.resolutions.map((resolution) => resolution.actionId),
    RewriteProposalInputErrorCode.ActionResolutionMismatch,
  );

  const resolutionActionIds = sortedUnique(targetingResult.data.resolutions.map((resolution) => resolution.actionId));
  const actionIds = sortedUnique(planResult.data.actions.map((action) => action.actionId));
  for (const resolutionActionId of resolutionActionIds) {
    if (!actionIds.includes(resolutionActionId)) {
      throwInputError(RewriteProposalInputErrorCode.ActionNotFound);
    }
  }
  for (const actionId of actionIds) {
    if (!resolutionActionIds.includes(actionId)) {
      throwInputError(RewriteProposalInputErrorCode.ResolutionNotFound);
    }
  }

  return {
    tailoringPlan: planResult.data,
    targetingResult: targetingResult.data,
    resumeDocument: documentResult.data,
  };
}

function validateDefensiveDuplicates(input: BuildRewriteProposalsInput): void {
  assertUnique(
    arrayProperty(input.tailoringPlan, "actions")
      .map((action) => stringProperty(action, "actionId"))
      .filter((actionId): actionId is string => actionId !== undefined),
    RewriteProposalInputErrorCode.DuplicateActionId,
  );
  assertUnique(
    arrayProperty(input.targetingResult, "resolutions")
      .map((resolution) => stringProperty(resolution, "resolutionId"))
      .filter((resolutionId): resolutionId is string => resolutionId !== undefined),
    RewriteProposalInputErrorCode.DuplicateResolutionId,
  );
}

function validateActionResolutionCoherence(action: TailoringAction, resolution: TailoringTargetResolution): void {
  if (action.targetSection !== resolution.targetSection) {
    throwInputError(RewriteProposalInputErrorCode.ActionResolutionMismatch);
  }
  if (!sameStringSet(sortedUnique(action.requirementIds), sortedUnique(resolution.requirementIds))) {
    throwInputError(RewriteProposalInputErrorCode.RequirementSetMismatch);
  }
  if (!sameStringSet(sortedUnique(action.evidenceIds), sortedUnique(resolution.evidenceIds))) {
    throwInputError(RewriteProposalInputErrorCode.EvidenceSetMismatch);
  }
}

function buildSkippedItem(
  input: ValidatedRewriteInput,
  resolution: TailoringTargetResolution,
  reason: RewriteSkippedReason,
): RewriteProposalResult["skippedItems"][number] {
  return {
    skippedItemId: skippedItemId(input, resolution, reason),
    actionId: resolution.actionId,
    resolutionId: resolution.resolutionId,
    reason,
    candidateBlockIds: sortedUnique(resolution.candidateBlockIds),
  };
}

function sharedEvidenceIds(action: TailoringAction, resolution: TailoringTargetResolution, block: LocatedBlock): string[] {
  const actionEvidenceIds = new Set(sortedUnique(action.evidenceIds));
  const resolutionEvidenceIds = new Set(sortedUnique(resolution.evidenceIds));
  return sortedUnique(block.evidenceIds).filter(
    (evidenceId) => evidenceId.length > 0 && actionEvidenceIds.has(evidenceId) && resolutionEvidenceIds.has(evidenceId),
  );
}

function mapActionsById(actions: TailoringAction[]): Map<string, TailoringAction> {
  return new Map(actions.map((action) => [action.actionId, action]));
}

function mapBlocksById(resumeDocument: ResumeDocument): Map<string, LocatedBlock> {
  const blocks = resumeDocument.sections.flatMap((section) =>
    section.blocks.map((block) => ({
      sectionId: section.sectionId,
      blockId: block.blockId,
      originalText: block.originalText,
      evidenceIds: [...block.evidenceIds],
    })),
  );
  return new Map(blocks.map((block) => [block.blockId, block]));
}

function proposalId(input: ValidatedRewriteInput, action: TailoringAction, resolution: TailoringTargetResolution, blockId: string): string {
  return canonicalId("proposal", [
    ["offer", input.tailoringPlan.offerId],
    ["profile", input.tailoringPlan.profileId],
    ["document", input.resumeDocument.documentId],
    ["action", action.actionId],
    ["resolution", resolution.resolutionId],
    ["block", blockId],
  ]);
}

function skippedItemId(input: ValidatedRewriteInput, resolution: TailoringTargetResolution, reason: RewriteSkippedReason): string {
  return canonicalId("skip", [
    ["offer", input.tailoringPlan.offerId],
    ["profile", input.tailoringPlan.profileId],
    ["document", input.resumeDocument.documentId],
    ["action", resolution.actionId],
    ["resolution", resolution.resolutionId],
    ["reason", reason],
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

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function assertUnique<T extends string | number>(values: T[], errorCode: RewriteProposalInputErrorCode): void {
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

function throwInputError(code: RewriteProposalInputErrorCode): never {
  throw new Error(code);
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
