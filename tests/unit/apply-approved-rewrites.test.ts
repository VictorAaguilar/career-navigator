import { describe, expect, it, vi } from "vitest";
import {
  applyApprovedRewrites,
  RewriteApplicationInputErrorCode,
  type ApplyApprovedRewritesInput,
} from "../../src/core/tailoring";
import {
  AdaptedResumeBlockSchema,
  AdaptedResumeDocumentIdSchema,
  AdaptedResumeDocumentSchema,
  AppliedRewriteChangeSchema,
  ApprovedRewriteApplicationResultSchema,
  ApprovedRewriteApplicationSummarySchema,
  RewriteReviewDecisionBatchSchema,
  type ApprovedRewriteApplicationResult,
  type ApprovedRewriteSelection,
  type ResumeBlock,
  type ResumeDocument,
  type ResumeSection,
  type RewriteReviewerDecisionResult,
  type RewriteReviewDecisionBatch,
  buildAdaptedResumeDocumentId,
  buildAppliedRewriteChangeId,
  buildRewriteApplicationId,
} from "../../src/schemas";

const compareStable = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const canonicalId = (kind: string, parts: Array<[string, string]>): string =>
  [kind, ...parts.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)].join("|");

const makeBlock = (overrides: Partial<ResumeBlock> = {}): ResumeBlock => ({
  blockId: overrides.blockId ?? "block-a",
  kind: overrides.kind ?? "bullet",
  order: overrides.order ?? 0,
  originalText: overrides.originalText ?? "Built deterministic automation.",
  evidenceIds: overrides.evidenceIds ?? ["evidence-a"],
  ...(overrides.sourceLocator === undefined ? {} : { sourceLocator: overrides.sourceLocator }),
});

const makeSection = (overrides: Partial<ResumeSection> = {}): ResumeSection => ({
  sectionId: overrides.sectionId ?? "section-a",
  kind: overrides.kind ?? "experience",
  label: overrides.label ?? "Experience",
  order: overrides.order ?? 0,
  blocks: overrides.blocks ?? [makeBlock()],
});

const makeResumeDocument = (overrides: Partial<ResumeDocument> = {}): ResumeDocument => ({
  documentId: overrides.documentId ?? "resume-doc",
  profileId: overrides.profileId ?? "profile-1",
  source: overrides.source ?? { format: "markdown", fileName: "cv.md" },
  sections: overrides.sections ?? [makeSection()],
});

const decisionIdFor = (selection: Pick<ApprovedRewriteSelection, "validationId">, decision = "approved"): string =>
  canonicalId("review-decision", [
    ["offer", "offer-1"],
    ["profile", "profile-1"],
    ["document", "resume-doc"],
    ["validation", selection.validationId],
    ["decision", decision],
  ]);

const makeSelection = (overrides: Partial<ApprovedRewriteSelection> = {}): ApprovedRewriteSelection => {
  const validationId = overrides.validationId ?? "validation-a";
  const blockId = overrides.blockId ?? "block-a";
  const decisionId = overrides.decisionId ?? decisionIdFor({ validationId });
  return {
    selectionId: overrides.selectionId ?? canonicalId("approved-rewrite", [
      ["offer", "offer-1"],
      ["profile", "profile-1"],
      ["document", "resume-doc"],
      ["decision", decisionId],
      ["block", blockId],
    ]),
    decisionId,
    validationId,
    candidateId: overrides.candidateId ?? "candidate-a",
    requestId: overrides.requestId ?? "request-a",
    proposalId: overrides.proposalId ?? "proposal-a",
    actionId: overrides.actionId ?? "action-a",
    resolutionId: overrides.resolutionId ?? "resolution-a",
    blockId,
    originalText: overrides.originalText ?? "Built deterministic automation.",
    approvedText: overrides.approvedText ?? "Built deterministic automation for review workflows.",
    sourceValidationStatus: overrides.sourceValidationStatus ?? "accepted",
    sourceFindingCodes: overrides.sourceFindingCodes ?? [],
    approvalRationale: overrides.approvalRationale ?? "explicit reviewer approval",
    approvalScope: "approved_for_future_application_only",
  };
};

const makeDecisionResult = (
  selection: ApprovedRewriteSelection,
  decision: "approved" | "rejected" | "changes_requested" = "approved",
): RewriteReviewerDecisionResult => ({
  decisionId: decision === "approved" ? selection.decisionId : decisionIdFor(selection, decision),
  validationId: selection.validationId,
  candidateId: selection.candidateId,
  requestId: selection.requestId,
  proposalId: selection.proposalId,
  actionId: selection.actionId,
  resolutionId: selection.resolutionId,
  blockId: selection.blockId,
  originalText: selection.originalText,
  candidateText: selection.approvedText,
  sourceValidationStatus: decision === "approved" ? selection.sourceValidationStatus : "accepted",
  sourceFindingCodes: decision === "approved" ? [...selection.sourceFindingCodes] : [],
  decision,
  rationale: selection.approvalRationale,
});

const makeReviewBatch = (
  approvedSelections: ApprovedRewriteSelection[] = [makeSelection()],
  extraDecisions: RewriteReviewerDecisionResult[] = [],
  overrides: Partial<RewriteReviewDecisionBatch> = {},
): RewriteReviewDecisionBatch => {
  const decisions = [...approvedSelections.map((selection) => makeDecisionResult(selection)), ...extraDecisions]
    .sort((left, right) => compareStable(left.decisionId, right.decisionId));
  const selections = [...approvedSelections].sort((left, right) => compareStable(left.selectionId, right.selectionId));
  const batch = {
    offerId: overrides.offerId ?? "offer-1",
    profileId: overrides.profileId ?? "profile-1",
    documentId: overrides.documentId ?? "resume-doc",
    reviewScope: "explicit_reviewer_decisions_only",
    decisions,
    approvedSelections: selections,
    summary: overrides.summary ?? {
      totalValidationResults: decisions.length,
      totalDecisions: decisions.length,
      approved: decisions.filter((decision) => decision.decision === "approved").length,
      rejected: decisions.filter((decision) => decision.decision === "rejected").length,
      changesRequested: decisions.filter((decision) => decision.decision === "changes_requested").length,
      approvedSelections: selections.length,
      approvalsFromAccepted: decisions.filter(
        (decision) => decision.decision === "approved" && decision.sourceValidationStatus === "accepted",
      ).length,
      approvalsFromHumanReview: decisions.filter(
        (decision) => decision.decision === "approved" && decision.sourceValidationStatus === "human_review",
      ).length,
    },
  };
  return RewriteReviewDecisionBatchSchema.parse(batch);
};

const makeInput = (overrides: Partial<ApplyApprovedRewritesInput> = {}): ApplyApprovedRewritesInput => ({
  resumeDocument: overrides.resumeDocument ?? makeResumeDocument(),
  reviewDecisionBatch: overrides.reviewDecisionBatch ?? makeReviewBatch(),
});

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
};

const allBlocks = (result: ApprovedRewriteApplicationResult) =>
  result.adaptedDocument.sections.flatMap((section) => section.blocks);

describe("Apply approved rewrites", () => {
  it("applies one approved selection to an adapted resume document", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.parse(result)).toEqual(result);
    expect(result.applicationScope).toBe("approved_rewrites_only");
    expect(result.adaptedDocument.sections[0].blocks[0]).toMatchObject({
      blockId: "block-a",
      effectiveText: "Built deterministic automation for review workflows.",
      applicationStatus: "rewritten",
      appliedSelectionId: result.changes[0].selectionId,
    });
    expect(result.changes).toHaveLength(1);
  });

  it("does not modify the original ResumeDocument", () => {
    const resumeDocument = makeResumeDocument();
    const before = JSON.stringify(resumeDocument);

    applyApprovedRewrites(makeInput({ resumeDocument }));

    expect(JSON.stringify(resumeDocument)).toBe(before);
    expect(resumeDocument.sections[0].blocks[0]).not.toHaveProperty("effectiveText");
  });

  it("does not modify the RewriteReviewDecisionBatch", () => {
    const reviewDecisionBatch = makeReviewBatch();
    const before = JSON.stringify(reviewDecisionBatch);

    applyApprovedRewrites(makeInput({ reviewDecisionBatch }));

    expect(JSON.stringify(reviewDecisionBatch)).toBe(before);
  });

  it("uses only approvedSelections as rewrite source", () => {
    const rejectedSelection = makeSelection({ validationId: "validation-rejected", blockId: "block-a" });
    const rejectedDecision = makeDecisionResult(rejectedSelection, "rejected");
    const reviewDecisionBatch = makeReviewBatch([], [rejectedDecision]);
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch }));

    expect(result.changes).toEqual([]);
    expect(result.adaptedDocument.sections[0].blocks[0].effectiveText).toBe("Built deterministic automation.");
  });

  it("cannot receive an approved decision without approvedSelection because review schema rejects it", () => {
    const selection = makeSelection();
    const approvedDecision = makeDecisionResult(selection);

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...makeReviewBatch(),
      decisions: [approvedDecision],
      approvedSelections: [],
      summary: {
        totalValidationResults: 1,
        totalDecisions: 1,
        approved: 1,
        rejected: 0,
        changesRequested: 0,
        approvedSelections: 0,
        approvalsFromAccepted: 1,
        approvalsFromHumanReview: 0,
      },
    }).success).toBe(false);
  });

  it("does not modify blocks for rejected decisions", () => {
    const selection = makeSelection({ validationId: "validation-rejected" });
    const result = applyApprovedRewrites(makeInput({
      reviewDecisionBatch: makeReviewBatch([], [makeDecisionResult(selection, "rejected")]),
    }));

    expect(result.adaptedDocument.sections[0].blocks[0].applicationStatus).toBe("unchanged");
    expect(result.changes).toEqual([]);
  });

  it("does not modify blocks for changes_requested decisions", () => {
    const selection = makeSelection({ validationId: "validation-changes" });
    const result = applyApprovedRewrites(makeInput({
      reviewDecisionBatch: makeReviewBatch([], [makeDecisionResult(selection, "changes_requested")]),
    }));

    expect(result.adaptedDocument.sections[0].blocks[0].applicationStatus).toBe("unchanged");
    expect(result.changes).toEqual([]);
  });

  it("does not modify an accepted source status without approvedSelection", () => {
    const selection = makeSelection({ validationId: "validation-accepted" });
    const result = applyApprovedRewrites(makeInput({
      reviewDecisionBatch: makeReviewBatch([], [makeDecisionResult(selection, "rejected")]),
    }));

    expect(result.adaptedDocument.sections[0].blocks[0].effectiveText).toBe("Built deterministic automation.");
  });

  it("throws a stable error for profileId mismatch", () => {
    expect(() => applyApprovedRewrites(makeInput({
      resumeDocument: makeResumeDocument({ profileId: "other-profile" }),
    }))).toThrow(RewriteApplicationInputErrorCode.ProfileIdMismatch);
  });

  it("throws a stable error for documentId mismatch", () => {
    expect(() => applyApprovedRewrites(makeInput({
      resumeDocument: makeResumeDocument({ documentId: "other-document" }),
    }))).toThrow(RewriteApplicationInputErrorCode.DocumentIdMismatch);
  });

  it("throws a stable error for missing blockId", () => {
    expect(() => applyApprovedRewrites(makeInput({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ blockId: "missing-block" })]),
    }))).toThrow(RewriteApplicationInputErrorCode.BlockNotFound);
  });

  it("throws a stable error for source originalText mismatch", () => {
    expect(() => applyApprovedRewrites(makeInput({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ originalText: "Different original text" })]),
    }))).toThrow(RewriteApplicationInputErrorCode.SourceTextMismatch);
  });

  it("locates blocks exclusively by blockId", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({
        blocks: [
          makeBlock({ blockId: "block-a", originalText: "same text" }),
          makeBlock({ blockId: "block-b", order: 1, originalText: "same text" }),
        ],
      })],
    });
    const selection = makeSelection({ blockId: "block-b", originalText: "same text", approvedText: "rewritten block b" });
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch([selection]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].effectiveText).toBe("same text");
    expect(result.adaptedDocument.sections[0].blocks[1].effectiveText).toBe("rewritten block b");
  });

  it("does not apply to the wrong block when two blocks share the same text", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({
        blocks: [
          makeBlock({ blockId: "block-a", originalText: "duplicate text" }),
          makeBlock({ blockId: "block-b", order: 1, originalText: "duplicate text" }),
        ],
      })],
    });
    const selection = makeSelection({ blockId: "block-a", originalText: "duplicate text", approvedText: "rewritten block a" });
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch([selection]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].effectiveText).toBe("rewritten block a");
    expect(result.adaptedDocument.sections[0].blocks[1].effectiveText).toBe("duplicate text");
  });

  it("preserves all source ResumeBlock fields", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({
        blocks: [makeBlock({
          kind: "entry",
          evidenceIds: ["evidence-b", "evidence-a"],
          sourceLocator: { kind: "line", value: "42" },
        })],
      })],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));
    const block = result.adaptedDocument.sections[0].blocks[0];

    expect(block.kind).toBe("entry");
    expect(block.order).toBe(0);
    expect(block.evidenceIds).toEqual(["evidence-b", "evidence-a"]);
    expect(block.sourceLocator).toEqual({ kind: "line", value: "42" });
  });

  it("copies metadata and evidenceIds without sharing mutable references", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({
        blocks: [makeBlock({ evidenceIds: ["evidence-a"], sourceLocator: { kind: "line", value: "1" } })],
      })],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));
    const outputBlock = result.adaptedDocument.sections[0].blocks[0];

    expect(outputBlock.evidenceIds).toEqual(resumeDocument.sections[0].blocks[0].evidenceIds);
    expect(outputBlock.evidenceIds).not.toBe(resumeDocument.sections[0].blocks[0].evidenceIds);
    expect(outputBlock.sourceLocator).toEqual(resumeDocument.sections[0].blocks[0].sourceLocator);
    expect(outputBlock.sourceLocator).not.toBe(resumeDocument.sections[0].blocks[0].sourceLocator);
  });

  it("preserves section order exactly", () => {
    const resumeDocument = makeResumeDocument({
      sections: [
        makeSection({ sectionId: "section-b", order: 2, blocks: [makeBlock({ blockId: "block-b" })] }),
        makeSection({ sectionId: "section-a", order: 1, blocks: [makeBlock({ blockId: "block-a", order: 1 })] }),
      ],
    });
    const result = applyApprovedRewrites(makeInput({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([makeSelection({ blockId: "block-b" })]),
    }));

    expect(result.adaptedDocument.sections.map((section) => section.sectionId)).toEqual(["section-b", "section-a"]);
  });

  it("preserves block order exactly", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({
        blocks: [
          makeBlock({ blockId: "block-b", order: 2 }),
          makeBlock({ blockId: "block-a", order: 1 }),
        ],
      })],
    });
    const result = applyApprovedRewrites(makeInput({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([makeSelection({ blockId: "block-b" })]),
    }));

    expect(result.adaptedDocument.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-b", "block-a"]);
  });

  it("does not add sections", () => {
    expect(applyApprovedRewrites(makeInput()).adaptedDocument.sections).toHaveLength(1);
  });

  it("does not remove sections", () => {
    const resumeDocument = makeResumeDocument({
      sections: [
        makeSection({ sectionId: "section-a", blocks: [makeBlock({ blockId: "block-a" })] }),
        makeSection({ sectionId: "section-b", order: 1, blocks: [makeBlock({ blockId: "block-b" })] }),
      ],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));

    expect(result.adaptedDocument.sections).toHaveLength(2);
  });

  it("does not add blocks", () => {
    expect(allBlocks(applyApprovedRewrites(makeInput()))).toHaveLength(1);
  });

  it("does not remove blocks", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a" }), makeBlock({ blockId: "block-b", order: 1 })] })],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));

    expect(allBlocks(result)).toHaveLength(2);
  });

  it("leaves unselected blocks unchanged", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a" }), makeBlock({ blockId: "block-b", order: 1 })] })],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));

    expect(result.adaptedDocument.sections[0].blocks[1].applicationStatus).toBe("unchanged");
  });

  it("sets unchanged effectiveText exactly to originalText", () => {
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].effectiveText).toBe(result.adaptedDocument.sections[0].blocks[0].originalText);
  });

  it("marks selected blocks with different text as rewritten", () => {
    expect(applyApprovedRewrites(makeInput()).adaptedDocument.sections[0].blocks[0].applicationStatus).toBe("rewritten");
  });

  it("marks selected blocks with identical text as approved_unchanged", () => {
    const selection = makeSelection({ approvedText: "Built deterministic automation." });
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([selection]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].applicationStatus).toBe("approved_unchanged");
  });

  it("does not convert approved_unchanged into unchanged", () => {
    const selection = makeSelection({ approvedText: "Built deterministic automation." });
    const block = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([selection]) })).adaptedDocument.sections[0].blocks[0];

    expect(block.applicationStatus).toBe("approved_unchanged");
    expect(block.appliedSelectionId).toBe(selection.selectionId);
  });

  it("creates exactly one change per approved selection", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a" }), makeBlock({ blockId: "block-b", order: 1, originalText: "Second original" })] })],
    });
    const selections = [
      makeSelection(),
      makeSelection({ validationId: "validation-b", blockId: "block-b", originalText: "Second original", approvedText: "Second approved" }),
    ];
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch(selections) }));

    expect(result.changes).toHaveLength(2);
  });

  it("each change references the correct block", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.changes[0].blockId).toBe("block-a");
  });

  it("uses the real containing sectionId in each change", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.changes[0].sectionId).toBe("section-a");
  });

  it("sets beforeText to block originalText", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.changes[0].beforeText).toBe("Built deterministic automation.");
  });

  it("sets afterText to approvedText and effectiveText", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.changes[0].afterText).toBe("Built deterministic automation for review workflows.");
    expect(result.changes[0].afterText).toBe(result.adaptedDocument.sections[0].blocks[0].effectiveText);
  });

  it("rewritten changes have different beforeText and afterText", () => {
    const change = applyApprovedRewrites(makeInput()).changes[0];

    expect(change.applicationStatus).toBe("rewritten");
    expect(change.beforeText).not.toBe(change.afterText);
  });

  it("approved_unchanged changes have identical beforeText and afterText", () => {
    const selection = makeSelection({ approvedText: "Built deterministic automation." });
    const change = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([selection]) })).changes[0];

    expect(change.applicationStatus).toBe("approved_unchanged");
    expect(change.beforeText).toBe(change.afterText);
  });

  it("unchanged blocks have no change", () => {
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].applicationStatus).toBe("unchanged");
    expect(result.changes).toEqual([]);
  });

  it("rejects an extra change in the public result schema", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [...result.changes, { ...result.changes[0], changeId: "extra-change", blockId: "extra-block", selectionId: "extra-selection" }],
    }).success).toBe(false);
  });

  it("rejects a missing change in the public result schema", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({ ...result, changes: [] }).success).toBe(false);
  });

  it("rejects an arbitrary applicationId in the public result schema", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: "arbitrary-application",
    }).success).toBe(false);
  });

  it("rejects an applicationId with a different offerId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: buildRewriteApplicationId({
        offerId: "other-offer",
        profileId: result.profileId,
        sourceDocumentId: result.sourceDocumentId,
        selectionIds: result.changes.map((change) => change.selectionId),
      }),
    }).success).toBe(false);
  });

  it("rejects an applicationId with a different profileId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: buildRewriteApplicationId({
        offerId: result.offerId,
        profileId: "other-profile",
        sourceDocumentId: result.sourceDocumentId,
        selectionIds: result.changes.map((change) => change.selectionId),
      }),
    }).success).toBe(false);
  });

  it("rejects an applicationId with a different sourceDocumentId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: buildRewriteApplicationId({
        offerId: result.offerId,
        profileId: result.profileId,
        sourceDocumentId: "other-document",
        selectionIds: result.changes.map((change) => change.selectionId),
      }),
    }).success).toBe(false);
  });

  it("rejects an applicationId with an omitted selectionId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: buildRewriteApplicationId({
        offerId: result.offerId,
        profileId: result.profileId,
        sourceDocumentId: result.sourceDocumentId,
        selectionIds: [],
      }),
    }).success).toBe(false);
  });

  it("rejects an applicationId with an additional selectionId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: buildRewriteApplicationId({
        offerId: result.offerId,
        profileId: result.profileId,
        sourceDocumentId: result.sourceDocumentId,
        selectionIds: [...result.changes.map((change) => change.selectionId), "extra-selection"],
      }),
    }).success).toBe(false);
  });

  it("rejects an applicationId that depends on a different selection order", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [
        makeBlock({ blockId: "block-a" }),
        makeBlock({ blockId: "block-b", order: 1, originalText: "Second original" }),
      ] })],
    });
    const result = applyApprovedRewrites(makeInput({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([
        makeSelection({ validationId: "validation-a", blockId: "block-a" }),
        makeSelection({ validationId: "validation-b", blockId: "block-b", originalText: "Second original", approvedText: "Second approved" }),
      ]),
    }));
    const reversedSelectionIds = [...result.changes.map((change) => change.selectionId)].sort(compareStable).reverse();
    const orderDependentApplicationId = canonicalId("rewrite-application", [
      ["offer", result.offerId],
      ["profile", result.profileId],
      ["source-document", result.sourceDocumentId],
      ["selections", JSON.stringify(reversedSelectionIds)],
    ]);

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: orderDependentApplicationId,
    }).success).toBe(false);
  });

  it("validates the empty-selection applicationId in the public result schema", () => {
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([]) }));

    expect(result.applicationId).toBe(buildRewriteApplicationId({
      offerId: result.offerId,
      profileId: result.profileId,
      sourceDocumentId: result.sourceDocumentId,
      selectionIds: [],
    }));
    expect(ApprovedRewriteApplicationResultSchema.safeParse(result).success).toBe(true);
    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      applicationId: "rewrite-application|offer=offer-1|profile=profile-1|source-document=resume-doc|selections=not-json-array",
    }).success).toBe(false);
  });

  it("rejects change.applicationId that differs from result.applicationId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{ ...result.changes[0], applicationId: "other-application" }],
    }).success).toBe(false);
  });

  it("rejects changeId with a different applicationId", () => {
    const result = applyApprovedRewrites(makeInput());
    const change = result.changes[0];

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{
        ...change,
        changeId: buildAppliedRewriteChangeId("other-application", change.selectionId, change.blockId),
      }],
    }).success).toBe(false);
  });

  it("rejects changeId with a different selectionId", () => {
    const result = applyApprovedRewrites(makeInput());
    const change = result.changes[0];

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{
        ...change,
        changeId: buildAppliedRewriteChangeId(result.applicationId, "other-selection", change.blockId),
      }],
    }).success).toBe(false);
  });

  it("rejects changeId with a different blockId", () => {
    const result = applyApprovedRewrites(makeInput());
    const change = result.changes[0];

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{
        ...change,
        changeId: buildAppliedRewriteChangeId(result.applicationId, change.selectionId, "other-block"),
      }],
    }).success).toBe(false);
  });

  it("rejects adaptedDocument.documentId from another applicationId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      adaptedDocument: {
        ...result.adaptedDocument,
        documentId: buildAdaptedResumeDocumentId("other-application"),
      },
    }).success).toBe(false);
  });

  it("rejects arbitrary adaptedDocument.documentId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      adaptedDocument: {
        ...result.adaptedDocument,
        documentId: "arbitrary-document",
      },
    }).success).toBe(false);
  });

  it("rejects adaptedDocument.sourceDocumentId that differs from the result", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      adaptedDocument: {
        ...result.adaptedDocument,
        sourceDocumentId: "other-document",
      },
    }).success).toBe(false);
  });

  it("rejects selectionId mismatch between block and change", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{ ...result.changes[0], selectionId: "different-selection" }],
    }).success).toBe(false);
  });

  it("rejects sectionId mismatch in a change", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{ ...result.changes[0], sectionId: "different-section" }],
    }).success).toBe(false);
  });

  it("rejects beforeText mismatch in a change", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{ ...result.changes[0], beforeText: "different before" }],
    }).success).toBe(false);
  });

  it("rejects afterText mismatch in a change", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{ ...result.changes[0], afterText: "different after" }],
    }).success).toBe(false);
  });

  it("rejects applicationStatus mismatch in a change", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [{ ...result.changes[0], applicationStatus: "approved_unchanged" }],
    }).success).toBe(false);
  });

  it("rejects changes with duplicate blockId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [
        result.changes[0],
        { ...result.changes[0], changeId: "other-change", selectionId: "other-selection" },
      ],
    }).success).toBe(false);
  });

  it("rejects changes with duplicate selectionId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [
        result.changes[0],
        { ...result.changes[0], changeId: "other-change", blockId: "other-block" },
      ],
    }).success).toBe(false);
  });

  it("rejects changes in non-canonical order", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a" }), makeBlock({ blockId: "block-b", order: 1, originalText: "Second original" })] })],
    });
    const selections = [
      makeSelection(),
      makeSelection({ validationId: "validation-b", blockId: "block-b", originalText: "Second original", approvedText: "Second approved" }),
    ];
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch(selections) }));

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      changes: [...result.changes].reverse(),
    }).success).toBe(false);
  });

  it("rejects incoherent AdaptedResumeBlockSchema combinations", () => {
    const block = applyApprovedRewrites(makeInput()).adaptedDocument.sections[0].blocks[0];

    expect(AdaptedResumeBlockSchema.safeParse({ ...block, applicationStatus: "unchanged" }).success).toBe(false);
    expect(AdaptedResumeBlockSchema.safeParse({ ...block, applicationStatus: "rewritten", effectiveText: block.originalText }).success).toBe(false);
    expect(AdaptedResumeBlockSchema.safeParse({ ...block, applicationStatus: "approved_unchanged" }).success).toBe(false);
  });

  it("accepts a valid adapted documentId even though lineage IDs use encoded separators", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.adaptedDocument.documentId).toContain("|");
    expect(result.adaptedDocument.documentId).toContain("=");
    expect(AdaptedResumeDocumentIdSchema.safeParse(result.adaptedDocument.documentId).success).toBe(true);
    expect(ApprovedRewriteApplicationResultSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["wrong prefix", "resume|application=abc"],
    ["missing application component", "adapted-resume|application="],
  ] as const)("rejects invalid adapted documentId: %s", (_label, documentId) => {
    expect(AdaptedResumeDocumentIdSchema.safeParse(documentId).success).toBe(false);
  });

  it("rejects sourceDocumentId values that IdSchema would reject", () => {
    const document = applyApprovedRewrites(makeInput()).adaptedDocument;

    expect(AdaptedResumeDocumentSchema.safeParse({
      ...document,
      sourceDocumentId: "bad id",
    }).success).toBe(false);
  });

  it("rejects profileId values that IdSchema would reject", () => {
    const document = applyApprovedRewrites(makeInput()).adaptedDocument;

    expect(AdaptedResumeDocumentSchema.safeParse({
      ...document,
      profileId: "bad/profile",
    }).success).toBe(false);
  });

  it("rejects sectionId values that IdSchema would reject", () => {
    const document = applyApprovedRewrites(makeInput()).adaptedDocument;

    expect(AdaptedResumeDocumentSchema.safeParse({
      ...document,
      sections: [{ ...document.sections[0], sectionId: "bad section" }],
    }).success).toBe(false);
  });

  it("rejects blockId values that IdSchema would reject", () => {
    const block = applyApprovedRewrites(makeInput()).adaptedDocument.sections[0].blocks[0];

    expect(AdaptedResumeBlockSchema.safeParse({
      ...block,
      blockId: "bad:block",
    }).success).toBe(false);
  });

  it("keeps AdaptedResumeDocumentSchema strict", () => {
    const document = applyApprovedRewrites(makeInput()).adaptedDocument;

    expect(AdaptedResumeDocumentSchema.safeParse({ ...document, generatedAt: "2026-07-30" }).success).toBe(false);
  });

  it("keeps AppliedRewriteChangeSchema strict", () => {
    const change = applyApprovedRewrites(makeInput()).changes[0];

    expect(AppliedRewriteChangeSchema.safeParse({ ...change, appliedAt: "2026-07-30" }).success).toBe(false);
  });

  it("keeps ApprovedRewriteApplicationResultSchema strict", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({ ...result, generatedAt: "2026-07-30" }).success).toBe(false);
  });

  it.each([
    ["generatedAt", "2026-07-30"],
    ["appliedAt", "2026-07-30"],
    ["exportedAt", "2026-07-30"],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["styles", {}],
    ["applicationStatus", "applied"],
    ["resumeDocument", {}],
  ] as const)("rejects external application/export field %s", (field, value) => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({ ...result, [field]: value }).success).toBe(false);
    expect(AdaptedResumeDocumentSchema.safeParse({ ...result.adaptedDocument, [field]: value }).success).toBe(false);
  });

  it.each([
    ["provider", "openai"],
    ["model", "model-x"],
    ["html", "<p>cv</p>"],
    ["resumeFile", "cv.md"],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["styles", {}],
    ["generatedAt", "2026-07-30"],
    ["appliedAt", "2026-07-30"],
    ["exportedAt", "2026-07-30"],
  ] as const)("AdaptedResumeDocumentSchema rejects forbidden field %s", (field, value) => {
    const document = applyApprovedRewrites(makeInput()).adaptedDocument;

    expect(AdaptedResumeDocumentSchema.safeParse({ ...document, [field]: value }).success).toBe(false);
  });

  it.each([
    ["beforeText", "Before"],
    ["afterText", "After"],
    ["approvedText", "Approved"],
    ["provider", "openai"],
    ["model", "model-x"],
    ["styles", {}],
  ] as const)("AdaptedResumeBlockSchema rejects forbidden field %s", (field, value) => {
    const block = applyApprovedRewrites(makeInput()).adaptedDocument.sections[0].blocks[0];

    expect(AdaptedResumeBlockSchema.safeParse({ ...block, [field]: value }).success).toBe(false);
  });

  it.each([
    ["provider", "openai"],
    ["model", "model-x"],
    ["html", "<p>cv</p>"],
    ["resumeDocument", {}],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["styles", {}],
    ["generatedAt", "2026-07-30"],
    ["appliedAt", "2026-07-30"],
    ["exportedAt", "2026-07-30"],
  ] as const)("AppliedRewriteChangeSchema rejects forbidden field %s", (field, value) => {
    const change = applyApprovedRewrites(makeInput()).changes[0];

    expect(AppliedRewriteChangeSchema.safeParse({ ...change, [field]: value }).success).toBe(false);
  });

  it.each([
    ["appliedResumeDocument", {}],
    ["applicationStatus", "applied"],
    ["exportStatus", "ready"],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["html", "<p>cv</p>"],
    ["generatedAt", "2026-07-30"],
    ["appliedAt", "2026-07-30"],
  ] as const)("ApprovedRewriteApplicationResultSchema rejects forbidden field %s", (field, value) => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({ ...result, [field]: value }).success).toBe(false);
  });

  it("preserves originalText literally", () => {
    const originalText = "  Original\ttext\ncaf\u00e9, \u00d1and\u00fa!  ";
    const resumeDocument = makeResumeDocument({ sections: [makeSection({ blocks: [makeBlock({ originalText })] })] });
    const selection = makeSelection({ originalText, approvedText: "Approved" });
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch([selection]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].originalText).toBe(originalText);
    expect(result.changes[0].beforeText).toBe(originalText);
  });

  it("preserves approvedText and effectiveText literally", () => {
    const approvedText = "  Approved\ttext\ncaf\u00e9, \u00d1and\u00fa!  ";
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText })]) }));

    expect(result.adaptedDocument.sections[0].blocks[0].effectiveText).toBe(approvedText);
    expect(result.changes[0].afterText).toBe(approvedText);
  });

  it("preserves spaces, tabs, line breaks, Unicode, accents, case, and punctuation", () => {
    const originalText = "  BEFORE\tline\nR\u00e9sum\u00e9 \u00d1!  ";
    const approvedText = "  AFTER\tline\nR\u00e9sum\u00e9 \u00d1!  ";
    const approvalRationale = "  Raz\u00f3n\tliteral\nOK!  ";
    const resumeDocument = makeResumeDocument({ sections: [makeSection({ blocks: [makeBlock({ originalText })] })] });
    const selection = makeSelection({ originalText, approvedText, approvalRationale });
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch([selection]) }));

    expect(result.changes[0].beforeText).toBe(originalText);
    expect(result.changes[0].afterText).toBe(approvedText);
    expect(result.changes[0].approvalRationale).toBe(approvalRationale);
  });

  it("generates deterministic applicationId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.applicationId).toBe(buildRewriteApplicationId({
      offerId: "offer-1",
      profileId: "profile-1",
      sourceDocumentId: "resume-doc",
      selectionIds: [makeSelection().selectionId],
    }));
  });

  it("generates deterministic adapted documentId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.adaptedDocument.documentId).toBe(buildAdaptedResumeDocumentId(result.applicationId));
  });

  it("generates deterministic changeId", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.changes[0].changeId).toBe(buildAppliedRewriteChangeId(
      result.applicationId,
      result.changes[0].selectionId,
      result.changes[0].blockId,
    ));
  });

  it("encodes special IDs without collisions", () => {
    const validationA = "validation / \u00d1:value|x & y=z?#%";
    const validationB = "validation / \u00d1:value|x & y=other?#%";
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [
        makeBlock({ blockId: "block-a" }),
        makeBlock({ blockId: "block-b", order: 1, originalText: "Second original" }),
      ] })],
    });
    const selections = [
      makeSelection({ validationId: validationA, blockId: "block-a" }),
      makeSelection({ validationId: validationB, blockId: "block-b", originalText: "Second original", approvedText: "Second approved" }),
    ];
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch(selections) }));

    expect(result.changes[0].changeId).not.toBe(result.changes[1].changeId);
    expect(JSON.stringify(result.changes)).toContain(encodeURIComponent(validationA));
    expect(JSON.stringify(result.changes)).toContain(encodeURIComponent(validationB));
  });

  it("does not include text or rationale in IDs", () => {
    const first = applyApprovedRewrites(makeInput());
    const second = applyApprovedRewrites(makeInput({
      reviewDecisionBatch: makeReviewBatch([makeSelection({
        approvedText: "A different approved text",
        approvalRationale: "A different rationale",
      })]),
    }));

    expect(first.applicationId).toBe(second.applicationId);
    expect(first.adaptedDocument.documentId).toBe(second.adaptedDocument.documentId);
    expect(first.changes[0].changeId).toBe(second.changes[0].changeId);
  });

  it("changes applicationId when the selectionId set changes", () => {
    const first = applyApprovedRewrites(makeInput()).applicationId;
    const second = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([]) })).applicationId;

    expect(first).not.toBe(second);
  });

  it("builds the same applicationId from reordered selectionIds without mutating them", () => {
    const originalSelectionIds = ["selection-b", "selection-a"];
    const before = [...originalSelectionIds];
    const first = buildRewriteApplicationId({
      offerId: "offer-1",
      profileId: "profile-1",
      sourceDocumentId: "resume-doc",
      selectionIds: originalSelectionIds,
    });
    const second = buildRewriteApplicationId({
      offerId: "offer-1",
      profileId: "profile-1",
      sourceDocumentId: "resume-doc",
      selectionIds: [...originalSelectionIds].reverse(),
    });

    expect(first).toBe(second);
    expect(originalSelectionIds).toEqual(before);
  });

  it("sorts changes canonically", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-b" }), makeBlock({ blockId: "block-a", order: 1, originalText: "Second original" })] })],
    });
    const result = applyApprovedRewrites(makeInput({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([
        makeSelection({ validationId: "validation-b", blockId: "block-b" }),
        makeSelection({ validationId: "validation-a", blockId: "block-a", originalText: "Second original", approvedText: "Second approved" }),
      ]),
    }));

    expect(result.changes.map((change) => change.changeId)).toEqual([...result.changes.map((change) => change.changeId)].sort(compareStable));
  });

  it("does not sort sections by ID", () => {
    const resumeDocument = makeResumeDocument({
      sections: [
        makeSection({ sectionId: "section-z", blocks: [makeBlock({ blockId: "block-a" })] }),
        makeSection({ sectionId: "section-a", order: 1, blocks: [makeBlock({ blockId: "block-b" })] }),
      ],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));

    expect(result.adaptedDocument.sections.map((section) => section.sectionId)).toEqual(["section-z", "section-a"]);
  });

  it("does not sort blocks by ID", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-z" }), makeBlock({ blockId: "block-a", order: 1 })] })],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch([makeSelection({ blockId: "block-z" })]) }));

    expect(result.adaptedDocument.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-z", "block-a"]);
  });

  it("handles a valid input with no approvedSelections", () => {
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch: makeReviewBatch([]) }));

    expect(result.changes).toEqual([]);
    expect(result.summary.totalApprovedSelections).toBe(0);
    expect(result.summary.rewrittenBlocks).toBe(0);
    expect(result.summary.approvedUnchangedBlocks).toBe(0);
    expect(result.summary.untouchedBlocks).toBe(result.summary.totalBlocks);
  });

  it("creates new adapted objects even without approvals", () => {
    const resumeDocument = makeResumeDocument();
    const result = applyApprovedRewrites(makeInput({ resumeDocument, reviewDecisionBatch: makeReviewBatch([]) }));

    expect(result.adaptedDocument).not.toBe(resumeDocument);
    expect(result.adaptedDocument.sections).not.toBe(resumeDocument.sections);
    expect(result.adaptedDocument.sections[0]).not.toBe(resumeDocument.sections[0]);
    expect(result.adaptedDocument.sections[0].blocks[0]).not.toBe(resumeDocument.sections[0].blocks[0]);
  });

  it("accepts deeply frozen inputs", () => {
    const input = deepFreeze(makeInput());

    expect(applyApprovedRewrites(input).summary.totalBlocks).toBe(1);
  });

  it("returns a deeply frozen output", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument)).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument.source)).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument.sections)).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument.sections[0])).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument.sections[0].blocks)).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument.sections[0].blocks[0])).toBe(true);
    expect(Object.isFrozen(result.adaptedDocument.sections[0].blocks[0].evidenceIds)).toBe(true);
    expect(Object.isFrozen(result.changes)).toBe(true);
    expect(Object.isFrozen(result.changes[0])).toBe(true);
    expect(Object.isFrozen(result.changes[0].sourceFindingCodes)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
  });

  it("deeply freezes and copies source metadata, sourceLocator, and evidenceIds", () => {
    const resumeDocument = makeResumeDocument({
      source: { format: "markdown", fileName: "cv.md" },
      sections: [makeSection({
        blocks: [makeBlock({
          evidenceIds: ["evidence-a"],
          sourceLocator: { kind: "line", value: "1" },
        })],
      })],
    });
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));
    const outputBlock = result.adaptedDocument.sections[0].blocks[0];
    const inputBlock = resumeDocument.sections[0].blocks[0];
    const before = JSON.stringify(result);

    expect(Object.isFrozen(result.adaptedDocument.source)).toBe(true);
    expect(Object.isFrozen(outputBlock.sourceLocator)).toBe(true);
    expect(Object.isFrozen(outputBlock.evidenceIds)).toBe(true);
    expect(result.adaptedDocument.source).not.toBe(resumeDocument.source);
    expect(outputBlock.sourceLocator).not.toBe(inputBlock.sourceLocator);
    expect(outputBlock.evidenceIds).not.toBe(inputBlock.evidenceIds);

    expect(() => Object.assign(result.adaptedDocument.source, { fileName: "mutated.md" })).toThrow();
    expect(() => Object.assign(outputBlock.sourceLocator ?? {}, { value: "99" })).toThrow();
    expect(() => outputBlock.evidenceIds.push("evidence-b")).toThrow();
    expect(JSON.stringify(result)).toBe(before);

    resumeDocument.source.fileName = "changed-input.md";
    inputBlock.sourceLocator!.value = "42";
    inputBlock.evidenceIds.push("evidence-c");
    expect(result.adaptedDocument.source.fileName).toBe("cv.md");
    expect(outputBlock.sourceLocator).toEqual({ kind: "line", value: "1" });
    expect(outputBlock.evidenceIds).toEqual(["evidence-a"]);
    expect(Object.isFrozen(resumeDocument.source)).toBe(false);
    expect(Object.isFrozen(inputBlock.sourceLocator)).toBe(false);
    expect(Object.isFrozen(inputBlock.evidenceIds)).toBe(false);
  });

  it("mutation attempts do not alter the output", () => {
    const result = applyApprovedRewrites(makeInput());
    const before = JSON.stringify(result);

    expect(() => result.adaptedDocument.sections.push(result.adaptedDocument.sections[0])).toThrow();
    expect(() => result.adaptedDocument.sections[0].blocks.push(result.adaptedDocument.sections[0].blocks[0])).toThrow();
    expect(() => Object.assign(result.adaptedDocument.sections[0].blocks[0], { effectiveText: "mutated" })).toThrow();
    expect(() => result.changes.push(result.changes[0])).toThrow();
    expect(() => result.changes[0].sourceFindingCodes.push("candidate_unchanged")).toThrow();
    expect(() => Object.assign(result.summary, { totalBlocks: 99 })).toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });

  it("does not freeze inputs accidentally", () => {
    const resumeDocument = makeResumeDocument();
    const reviewDecisionBatch = makeReviewBatch();

    applyApprovedRewrites({ resumeDocument, reviewDecisionBatch });

    expect(Object.isFrozen(resumeDocument)).toBe(false);
    expect(Object.isFrozen(resumeDocument.sections)).toBe(false);
    expect(Object.isFrozen(resumeDocument.sections[0].blocks)).toBe(false);
    expect(Object.isFrozen(reviewDecisionBatch)).toBe(false);
    expect(Object.isFrozen(reviewDecisionBatch.approvedSelections)).toBe(false);
  });

  it("does not share input arrays with output", () => {
    const resumeDocument = makeResumeDocument();
    const result = applyApprovedRewrites(makeInput({ resumeDocument }));

    expect(result.adaptedDocument.sections).not.toBe(resumeDocument.sections);
    expect(result.adaptedDocument.sections[0].blocks).not.toBe(resumeDocument.sections[0].blocks);
    expect(result.adaptedDocument.sections[0].blocks[0].evidenceIds).not.toBe(resumeDocument.sections[0].blocks[0].evidenceIds);
  });

  it("does not share selection sourceFindingCodes arrays with changes", () => {
    const selection = makeSelection({
      sourceValidationStatus: "human_review",
      sourceFindingCodes: ["candidate_unchanged"],
    });
    const reviewDecisionBatch = makeReviewBatch([selection]);
    const result = applyApprovedRewrites(makeInput({ reviewDecisionBatch }));

    expect(result.changes[0].sourceFindingCodes).toEqual(selection.sourceFindingCodes);
    expect(result.changes[0].sourceFindingCodes).not.toBe(selection.sourceFindingCodes);
  });

  it("builds a coherent summary", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.summary).toEqual({
      totalSections: 1,
      totalBlocks: 1,
      totalApprovedSelections: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      untouchedBlocks: 0,
      totalChanges: 1,
    });
  });

  it("rejects incoherent summaries", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(ApprovedRewriteApplicationResultSchema.safeParse({
      ...result,
      summary: { ...result.summary, totalBlocks: 99 },
    }).success).toBe(false);
  });

  it("rejects negative or non-integer summary counts", () => {
    expect(ApprovedRewriteApplicationSummarySchema.safeParse({
      totalSections: -1,
      totalBlocks: 1,
      totalApprovedSelections: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      untouchedBlocks: 0,
      totalChanges: 1,
    }).success).toBe(false);
    expect(ApprovedRewriteApplicationSummarySchema.safeParse({
      totalSections: 1.5,
      totalBlocks: 1,
      totalApprovedSelections: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      untouchedBlocks: 0,
      totalChanges: 1,
    }).success).toBe(false);
  });

  it("throws a stable error for invalid runtime ResumeDocument", () => {
    expect(() => applyApprovedRewrites(makeInput({
      resumeDocument: { ...makeResumeDocument(), sections: [] } as ResumeDocument,
    }))).toThrow(RewriteApplicationInputErrorCode.InvalidResumeDocument);
  });

  it("throws a stable error for invalid runtime ReviewDecisionBatch", () => {
    expect(() => applyApprovedRewrites(makeInput({
      reviewDecisionBatch: { ...makeReviewBatch(), reviewScope: "wrong" } as unknown as RewriteReviewDecisionBatch,
    }))).toThrow(RewriteApplicationInputErrorCode.InvalidReviewBatch);
  });

  it("invalid duplicate blockId runtime document produces invalid resume document error", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a" }), makeBlock({ blockId: "block-a", order: 1 })] })],
    });

    expect(() => applyApprovedRewrites(makeInput({ resumeDocument }))).toThrow(
      RewriteApplicationInputErrorCode.InvalidResumeDocument,
    );
  });

  it("does not use Date, random, UUID, network calls, provider, or LLM adapters", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUUIDSpy =
      typeof globalThis.crypto?.randomUUID === "function"
        ? vi.spyOn(globalThis.crypto, "randomUUID")
        : undefined;
    const fetchSpy =
      typeof globalThis.fetch === "function"
        ? vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network unavailable"))
        : undefined;

    const serialized = JSON.stringify(applyApprovedRewrites(makeInput()));

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUUIDSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("model");
    expect(serialized).not.toContain("prompt");

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUUIDSpy?.mockRestore();
    fetchSpy?.mockRestore();
  });

  it("does not write DOCX or PDF fields", () => {
    const serialized = JSON.stringify(applyApprovedRewrites(makeInput()));

    expect(serialized).not.toContain("docx");
    expect(serialized).not.toContain("pdf");
  });

  it("does not persist application state", () => {
    const serialized = JSON.stringify(applyApprovedRewrites(makeInput()));

    expect(serialized).not.toContain("persisted");
    expect(serialized).not.toContain("storedAt");
  });

  it("does not modify UI state", () => {
    const serialized = JSON.stringify(applyApprovedRewrites(makeInput()));

    expect(serialized).not.toContain("uiState");
    expect(serialized).not.toContain("dashboard");
  });

  it("uses only synthetic test data", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.offerId).toBe("offer-1");
    expect(result.profileId).toBe("profile-1");
    expect(result.sourceDocumentId).toBe("resume-doc");
  });

  it("represents a domain adapted resume, not a final exported file", () => {
    const result = applyApprovedRewrites(makeInput());

    expect(result.adaptedDocument).toHaveProperty("sections");
    expect(result.adaptedDocument).not.toHaveProperty("docx");
    expect(result.adaptedDocument).not.toHaveProperty("pdf");
    expect(result.adaptedDocument.sections[0].blocks[0]).toHaveProperty("effectiveText");
  });
});
