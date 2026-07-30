import type { ResumeBlock, ResumeDocument } from "../../schemas/resume";
import { ResumeDocumentSchema } from "../../schemas/resume";
import type { ApprovedRewriteSelection, RewriteReviewDecisionBatch } from "../../schemas/review";
import { RewriteReviewDecisionBatchSchema } from "../../schemas/review";
import type {
  AdaptedResumeBlock,
  AdaptedResumeDocument,
  AppliedRewriteChange,
  ApprovedRewriteApplicationResult,
} from "../../schemas/application";
import {
  ApprovedRewriteApplicationResultSchema,
  buildAdaptedResumeDocumentId,
  buildAppliedRewriteChangeId,
  buildRewriteApplicationId,
} from "../../schemas/application";

export const RewriteApplicationInputErrorCode = {
  InvalidResumeDocument: "REWRITE_APPLICATION_INPUT_INVALID_RESUME_DOCUMENT",
  InvalidReviewBatch: "REWRITE_APPLICATION_INPUT_INVALID_REVIEW_BATCH",
  ProfileIdMismatch: "REWRITE_APPLICATION_PROFILE_ID_MISMATCH",
  DocumentIdMismatch: "REWRITE_APPLICATION_DOCUMENT_ID_MISMATCH",
  BlockNotFound: "REWRITE_APPLICATION_BLOCK_NOT_FOUND",
  SourceTextMismatch: "REWRITE_APPLICATION_SOURCE_TEXT_MISMATCH",
} as const;

export type RewriteApplicationInputErrorCode =
  (typeof RewriteApplicationInputErrorCode)[keyof typeof RewriteApplicationInputErrorCode];

export type ApplyApprovedRewritesInput = {
  resumeDocument: ResumeDocument;
  reviewDecisionBatch: RewriteReviewDecisionBatch;
};

type ValidatedApplicationInput = {
  resumeDocument: ResumeDocument;
  reviewDecisionBatch: RewriteReviewDecisionBatch;
};

type BlockLocation = {
  sectionId: string;
  block: ResumeBlock;
};

export function applyApprovedRewrites(
  input: ApplyApprovedRewritesInput,
): ApprovedRewriteApplicationResult {
  const validatedInput = validateInput(input);
  const blockLocations = indexBlocksById(validatedInput.resumeDocument);
  const selectionsByBlockId = mapSelectionsByBlockId(validatedInput.reviewDecisionBatch.approvedSelections);
  assertSelectionsMatchBlocks(validatedInput.reviewDecisionBatch.approvedSelections, blockLocations);

  const applicationId = buildRewriteApplicationId({
    offerId: validatedInput.reviewDecisionBatch.offerId,
    profileId: validatedInput.resumeDocument.profileId,
    sourceDocumentId: validatedInput.resumeDocument.documentId,
    selectionIds: validatedInput.reviewDecisionBatch.approvedSelections.map((selection) => selection.selectionId),
  });
  const adaptedDocumentId = buildAdaptedResumeDocumentId(applicationId);

  const adaptedDocument: AdaptedResumeDocument = {
    documentId: adaptedDocumentId,
    sourceDocumentId: validatedInput.resumeDocument.documentId,
    profileId: validatedInput.resumeDocument.profileId,
    source: copySource(validatedInput.resumeDocument.source),
    sections: validatedInput.resumeDocument.sections.map((section) => ({
      sectionId: section.sectionId,
      kind: section.kind,
      label: section.label,
      order: section.order,
      blocks: section.blocks.map((block) => adaptBlock(block, selectionsByBlockId.get(block.blockId))),
    })),
  };

  const changes = validatedInput.reviewDecisionBatch.approvedSelections
    .map((selection) => {
      const location = blockLocations.get(selection.blockId);
      if (location === undefined) {
        throwInputError(RewriteApplicationInputErrorCode.BlockNotFound);
      }
      return buildChange(applicationId, selection, location);
    })
    .sort((left, right) => compareStable(left.changeId, right.changeId));

  const blocks = adaptedDocument.sections.flatMap((section) => section.blocks);
  const summary = {
    totalSections: adaptedDocument.sections.length,
    totalBlocks: blocks.length,
    totalApprovedSelections: changes.length,
    rewrittenBlocks: blocks.filter((block) => block.applicationStatus === "rewritten").length,
    approvedUnchangedBlocks: blocks.filter((block) => block.applicationStatus === "approved_unchanged").length,
    untouchedBlocks: blocks.filter((block) => block.applicationStatus === "unchanged").length,
    totalChanges: changes.length,
  };

  const result = ApprovedRewriteApplicationResultSchema.parse({
    applicationId,
    offerId: validatedInput.reviewDecisionBatch.offerId,
    profileId: validatedInput.resumeDocument.profileId,
    sourceDocumentId: validatedInput.resumeDocument.documentId,
    applicationScope: "approved_rewrites_only",
    adaptedDocument,
    changes,
    summary,
  });

  return deepFreeze(result);
}

function validateInput(input: ApplyApprovedRewritesInput): ValidatedApplicationInput {
  const resumeResult = ResumeDocumentSchema.safeParse(input.resumeDocument);
  if (!resumeResult.success) {
    throwInputError(RewriteApplicationInputErrorCode.InvalidResumeDocument);
  }

  const reviewResult = RewriteReviewDecisionBatchSchema.safeParse(input.reviewDecisionBatch);
  if (!reviewResult.success) {
    throwInputError(RewriteApplicationInputErrorCode.InvalidReviewBatch);
  }

  if (resumeResult.data.profileId !== reviewResult.data.profileId) {
    throwInputError(RewriteApplicationInputErrorCode.ProfileIdMismatch);
  }
  if (resumeResult.data.documentId !== reviewResult.data.documentId) {
    throwInputError(RewriteApplicationInputErrorCode.DocumentIdMismatch);
  }

  return {
    resumeDocument: resumeResult.data,
    reviewDecisionBatch: reviewResult.data,
  };
}

function indexBlocksById(resumeDocument: ResumeDocument): Map<string, BlockLocation> {
  const blockLocations = new Map<string, BlockLocation>();
  for (const section of resumeDocument.sections) {
    for (const block of section.blocks) {
      blockLocations.set(block.blockId, {
        sectionId: section.sectionId,
        block,
      });
    }
  }
  return blockLocations;
}

function mapSelectionsByBlockId(selections: ApprovedRewriteSelection[]): Map<string, ApprovedRewriteSelection> {
  return new Map(selections.map((selection) => [selection.blockId, selection]));
}

function assertSelectionsMatchBlocks(
  selections: ApprovedRewriteSelection[],
  blockLocations: Map<string, BlockLocation>,
): void {
  for (const selection of selections) {
    const location = blockLocations.get(selection.blockId);
    if (location === undefined) {
      throwInputError(RewriteApplicationInputErrorCode.BlockNotFound);
    }
    if (location.block.originalText !== selection.originalText) {
      throwInputError(RewriteApplicationInputErrorCode.SourceTextMismatch);
    }
  }
}

function adaptBlock(block: ResumeBlock, selection: ApprovedRewriteSelection | undefined): AdaptedResumeBlock {
  if (selection === undefined) {
    return {
      ...copyBlockBase(block),
      effectiveText: block.originalText,
      applicationStatus: "unchanged",
    };
  }

  const applicationStatus = selection.approvedText === block.originalText ? "approved_unchanged" : "rewritten";
  return {
    ...copyBlockBase(block),
    effectiveText: selection.approvedText,
    applicationStatus,
    appliedSelectionId: selection.selectionId,
  };
}

function buildChange(
  applicationId: string,
  selection: ApprovedRewriteSelection,
  location: BlockLocation,
): AppliedRewriteChange {
  const applicationStatus = selection.approvedText === location.block.originalText ? "approved_unchanged" : "rewritten";
  return {
    changeId: buildAppliedRewriteChangeId(applicationId, selection.selectionId, selection.blockId),
    applicationId,
    selectionId: selection.selectionId,
    decisionId: selection.decisionId,
    validationId: selection.validationId,
    candidateId: selection.candidateId,
    requestId: selection.requestId,
    proposalId: selection.proposalId,
    actionId: selection.actionId,
    resolutionId: selection.resolutionId,
    sectionId: location.sectionId,
    blockId: selection.blockId,
    beforeText: location.block.originalText,
    afterText: selection.approvedText,
    applicationStatus,
    sourceValidationStatus: selection.sourceValidationStatus,
    sourceFindingCodes: [...selection.sourceFindingCodes],
    approvalRationale: selection.approvalRationale,
  };
}

function copyBlockBase(block: ResumeBlock): ResumeBlock {
  return {
    blockId: block.blockId,
    kind: block.kind,
    order: block.order,
    originalText: block.originalText,
    evidenceIds: [...block.evidenceIds],
    ...(block.sourceLocator === undefined
      ? {}
      : {
          sourceLocator: {
            kind: block.sourceLocator.kind,
            value: block.sourceLocator.value,
          },
        }),
  };
}

function copySource(source: ResumeDocument["source"]): ResumeDocument["source"] {
  return {
    format: source.format,
    ...(source.fileName === undefined ? {} : { fileName: source.fileName }),
  };
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwInputError(code: RewriteApplicationInputErrorCode): never {
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
