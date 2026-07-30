import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ResumeExportModelInputErrorCode,
  applyApprovedRewrites,
  buildResumeExportModel,
  type ApplyApprovedRewritesInput,
} from "../../src/core/tailoring";
import {
  ApprovedRewriteApplicationResultSchema,
  RewriteReviewDecisionBatchSchema,
  ResumeExportBlockIdSchema,
  ResumeExportBlockSchema,
  ResumeExportModelIdSchema,
  ResumeExportModelSchema,
  ResumeExportScopeSchema,
  ResumeExportSectionIdSchema,
  ResumeExportSectionSchema,
  ResumeExportSummarySchema,
  ResumeExportTextSourceSchema,
  type ApprovedRewriteApplicationResult,
  type ApprovedRewriteSelection,
  type ResumeBlock,
  type ResumeDocument,
  type ResumeExportBlock,
  type ResumeExportModel,
  type ResumeExportSection,
  type ResumeSection,
  type RewriteReviewerDecisionResult,
  type RewriteReviewDecisionBatch,
  buildAdaptedResumeDocumentId,
  buildAppliedRewriteChangeId,
  buildResumeExportBlockId,
  buildResumeExportModelId,
  buildResumeExportSectionId,
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

const makeSelection = (overrides: Partial<ApprovedRewriteSelection> = {}): ApprovedRewriteSelection => {
  const validationId = overrides.validationId ?? "validation-a";
  const blockId = overrides.blockId ?? "block-a";
  const decisionId = overrides.decisionId ?? canonicalId("review-decision", [
    ["offer", "offer-1"],
    ["profile", "profile-1"],
    ["document", "resume-doc"],
    ["validation", validationId],
    ["decision", "approved"],
  ]);
  return {
    selectionId: overrides.selectionId ?? `selection-${validationId}`,
    decisionId,
    validationId,
    candidateId: overrides.candidateId ?? `candidate-${validationId}`,
    requestId: overrides.requestId ?? `request-${validationId}`,
    proposalId: overrides.proposalId ?? `proposal-${validationId}`,
    actionId: overrides.actionId ?? `action-${validationId}`,
    resolutionId: overrides.resolutionId ?? `resolution-${validationId}`,
    blockId,
    originalText: overrides.originalText ?? "Built deterministic automation.",
    approvedText: overrides.approvedText ?? "Built deterministic automation for review workflows.",
    sourceValidationStatus: overrides.sourceValidationStatus ?? "accepted",
    sourceFindingCodes: overrides.sourceFindingCodes ?? [],
    approvalRationale: overrides.approvalRationale ?? "explicit reviewer approval",
    approvalScope: "approved_for_future_application_only",
  };
};

const makeDecisionResult = (selection: ApprovedRewriteSelection): RewriteReviewerDecisionResult => ({
  decisionId: selection.decisionId,
  validationId: selection.validationId,
  candidateId: selection.candidateId,
  requestId: selection.requestId,
  proposalId: selection.proposalId,
  actionId: selection.actionId,
  resolutionId: selection.resolutionId,
  blockId: selection.blockId,
  originalText: selection.originalText,
  candidateText: selection.approvedText,
  sourceValidationStatus: selection.sourceValidationStatus,
  sourceFindingCodes: [...selection.sourceFindingCodes],
  decision: "approved",
  rationale: selection.approvalRationale,
});

const makeReviewBatch = (approvedSelections: ApprovedRewriteSelection[] = [makeSelection()]): RewriteReviewDecisionBatch => {
  const decisions = approvedSelections.map((selection) => makeDecisionResult(selection))
    .sort((left, right) => compareStable(left.decisionId, right.decisionId));
  const selections = [...approvedSelections].sort((left, right) => compareStable(left.selectionId, right.selectionId));
  return RewriteReviewDecisionBatchSchema.parse({
    offerId: "offer-1",
    profileId: "profile-1",
    documentId: "resume-doc",
    reviewScope: "explicit_reviewer_decisions_only",
    decisions,
    approvedSelections: selections,
    summary: {
      totalValidationResults: decisions.length,
      totalDecisions: decisions.length,
      approved: decisions.length,
      rejected: 0,
      changesRequested: 0,
      approvedSelections: selections.length,
      approvalsFromAccepted: decisions.filter((decision) => decision.sourceValidationStatus === "accepted").length,
      approvalsFromHumanReview: decisions.filter((decision) => decision.sourceValidationStatus === "human_review").length,
    },
  });
};

const makeInput = (overrides: Partial<ApplyApprovedRewritesInput> = {}): ApplyApprovedRewritesInput => ({
  resumeDocument: overrides.resumeDocument ?? makeResumeDocument(),
  reviewDecisionBatch: overrides.reviewDecisionBatch ?? makeReviewBatch(),
});

const makeApplicationResult = (overrides: Partial<ApplyApprovedRewritesInput> = {}): ApprovedRewriteApplicationResult =>
  applyApprovedRewrites(makeInput(overrides));

const makeExportModel = (applicationResult = makeApplicationResult()): ResumeExportModel =>
  buildResumeExportModel({ applicationResult });

const modelWithBlock = (
  model: ResumeExportModel,
  update: Partial<ResumeExportBlock>,
  sectionIndex = 0,
  blockIndex = 0,
): ResumeExportModel => ({
  ...model,
  sections: model.sections.map((section, currentSectionIndex) =>
    currentSectionIndex === sectionIndex
      ? {
          ...section,
          blocks: section.blocks.map((block, currentBlockIndex) =>
            currentBlockIndex === blockIndex ? { ...block, ...update } : block,
          ),
        }
      : section,
  ),
});

const modelWithSection = (
  model: ResumeExportModel,
  update: Partial<ResumeExportSection>,
  sectionIndex = 0,
): ResumeExportModel => ({
  ...model,
  sections: model.sections.map((section, currentIndex) =>
    currentIndex === sectionIndex ? { ...section, ...update } : section,
  ),
});

const mutableClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
};

const twoBlockResume = (): ResumeDocument => makeResumeDocument({
  sections: [makeSection({
    blocks: [
      makeBlock({ blockId: "block-b", order: 2, originalText: "Second original.", evidenceIds: ["evidence-b"] }),
      makeBlock({ blockId: "block-a", order: 1, originalText: "First original.", evidenceIds: ["evidence-a"] }),
    ],
  })],
});

const twoSectionResume = (): ResumeDocument => makeResumeDocument({
  source: { format: "markdown", fileName: "  CV\tÑ.md  " },
  sections: [
    makeSection({
      sectionId: "section-z",
      kind: "summary",
      label: "  Summary\tÑ  ",
      order: 2,
      blocks: [makeBlock({ blockId: "block-z", originalText: "Summary text.", sourceLocator: { kind: "line", value: "1" } })],
    }),
    makeSection({
      sectionId: "section-a",
      kind: "experience",
      label: "Experience",
      order: 1,
      blocks: [makeBlock({ blockId: "block-a", originalText: "Experience text.", order: 1 })],
    }),
  ],
});

const mixedApplicationResult = (): ApprovedRewriteApplicationResult => {
  const resumeDocument = makeResumeDocument({
    sections: [makeSection({
      blocks: [
        makeBlock({ blockId: "block-a", originalText: "Rewrite original.", evidenceIds: ["evidence-a"] }),
        makeBlock({ blockId: "block-b", order: 1, originalText: "Approved unchanged.", evidenceIds: ["evidence-b"] }),
        makeBlock({ blockId: "block-c", order: 2, originalText: "Unchanged original.", evidenceIds: [] }),
      ],
    })],
  });
  return makeApplicationResult({
    resumeDocument,
    reviewDecisionBatch: makeReviewBatch([
      makeSelection({
        selectionId: "selection-rewrite",
        validationId: "validation-rewrite",
        blockId: "block-a",
        originalText: "Rewrite original.",
        approvedText: "Rewrite approved.",
      }),
      makeSelection({
        selectionId: "selection-same",
        validationId: "validation-same",
        blockId: "block-b",
        originalText: "Approved unchanged.",
        approvedText: "Approved unchanged.",
      }),
    ]),
  });
};

describe("Resume export model", () => {
  it("builds a schema-valid ResumeExportModel", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(model).success).toBe(true);
    expect(model.exportScope).toBe("structured_content_for_future_docx_rendering");
  });

  it("throws a stable error for invalid input instead of exposing ZodError", () => {
    const applicationResult = mutableClone(makeApplicationResult());

    expect(() =>
      buildResumeExportModel({
        applicationResult: { ...applicationResult, applicationId: "invalid-application" },
      }),
    ).toThrow(ResumeExportModelInputErrorCode.InvalidApplicationResult);
  });

  it("uses applicationResult as its only source", () => {
    const applicationResult = makeApplicationResult();
    const model = makeExportModel(applicationResult);

    expect(model.sections[0].blocks[0].renderText).toBe(applicationResult.adaptedDocument.sections[0].blocks[0].effectiveText);
    expect(model.adaptedDocumentId).toBe(applicationResult.adaptedDocument.documentId);
  });

  it("preserves every section", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections).toHaveLength(2);
  });

  it("preserves every block", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections[0].blocks).toHaveLength(2);
  });

  it("preserves section order exactly", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections.map((section) => section.sectionId)).toEqual(["section-z", "section-a"]);
  });

  it("preserves block order exactly", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-b", "block-a"]);
  });

  it("does not sort sections by sectionId", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections.map((section) => section.sectionId)).not.toEqual(["section-a", "section-z"]);
  });

  it("does not sort blocks by blockId", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections[0].blocks.map((block) => block.blockId)).not.toEqual(["block-a", "block-b"]);
  });

  it("preserves source literally", () => {
    const applicationResult = makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) });
    const model = makeExportModel(applicationResult);

    expect(model.source).toEqual(applicationResult.adaptedDocument.source);
  });

  it("preserves section label literally", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections[0].label).toBe("  Summary\tÑ  ");
  });

  it("preserves evidenceIds", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections[0].blocks[0].evidenceIds).toEqual(["evidence-b"]);
  });

  it("preserves duplicate evidenceIds accepted by ApprovedRewriteApplicationResultSchema", () => {
    const applicationResult = mutableClone(makeApplicationResult({
      resumeDocument: makeResumeDocument({
        sections: [makeSection({
          blocks: [makeBlock({ evidenceIds: ["evidence-1", "evidence-1", "evidence-2"] })],
        })],
      }),
    }));
    const before = JSON.stringify(applicationResult);

    expect(ApprovedRewriteApplicationResultSchema.safeParse(applicationResult).success).toBe(true);
    expect(() => buildResumeExportModel({ applicationResult })).not.toThrow();

    const model = buildResumeExportModel({ applicationResult });
    const outputEvidenceIds = model.sections[0].blocks[0].evidenceIds;
    const inputEvidenceIds = applicationResult.adaptedDocument.sections[0].blocks[0].evidenceIds;

    expect(ResumeExportModelSchema.safeParse(model).success).toBe(true);
    expect(outputEvidenceIds).toEqual(["evidence-1", "evidence-1", "evidence-2"]);
    expect(outputEvidenceIds).not.toBe(inputEvidenceIds);
    expect(JSON.stringify(applicationResult)).toBe(before);

    inputEvidenceIds.push("evidence-3");
    expect(outputEvidenceIds).toEqual(["evidence-1", "evidence-1", "evidence-2"]);
    expect(Object.isFrozen(inputEvidenceIds)).toBe(false);
  });

  it("preserves empty evidenceIds when accepted by the source block contract", () => {
    const applicationResult = makeApplicationResult({
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ evidenceIds: [] })] })],
      }),
    });

    expect(ApprovedRewriteApplicationResultSchema.safeParse(applicationResult).success).toBe(true);
    expect(makeExportModel(applicationResult).sections[0].blocks[0].evidenceIds).toEqual([]);
  });

  it("preserves sourceLocator", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections[0].blocks[0].sourceLocator).toEqual({ kind: "line", value: "1" });
  });

  it("preserves originalText literally", () => {
    const originalText = "  BEFORE\tline\nRésumé Ñ!  ";
    const applicationResult = makeApplicationResult({
      resumeDocument: makeResumeDocument({ sections: [makeSection({ blocks: [makeBlock({ originalText })] })] }),
      reviewDecisionBatch: makeReviewBatch([makeSelection({ originalText, approvedText: "Approved text" })]),
    });

    expect(makeExportModel(applicationResult).sections[0].blocks[0].originalText).toBe(originalText);
  });

  it("preserves effectiveText literally", () => {
    const approvedText = "  AFTER\tline\nRésumé Ñ!  ";
    const model = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText })]),
    }));

    expect(model.sections[0].blocks[0].effectiveText).toBe(approvedText);
  });

  it("sets renderText exactly to effectiveText", () => {
    const block = makeExportModel().sections[0].blocks[0];

    expect(block.renderText).toBe(block.effectiveText);
  });

  it("preserves spaces, tabs, line breaks, Unicode, accents, case, and punctuation", () => {
    const originalText = "  BEFORE  A\tB\ncafé Résumé Ñ?!  ";
    const approvedText = "  AFTER  A\tB\ncafé Résumé Ñ?!  ";
    const applicationResult = makeApplicationResult({
      resumeDocument: makeResumeDocument({ sections: [makeSection({ blocks: [makeBlock({ originalText })] })] }),
      reviewDecisionBatch: makeReviewBatch([makeSelection({ originalText, approvedText })]),
    });
    const block = makeExportModel(applicationResult).sections[0].blocks[0];

    expect(block.originalText).toBe(originalText);
    expect(block.effectiveText).toBe(approvedText);
    expect(block.renderText).toBe(approvedText);
  });

  it("marks unchanged blocks as source_original", () => {
    const block = makeExportModel(makeApplicationResult({ reviewDecisionBatch: makeReviewBatch([]) })).sections[0].blocks[0];

    expect(block.applicationStatus).toBe("unchanged");
    expect(block.textSource).toBe("source_original");
  });

  it("omits appliedSelectionId for unchanged blocks", () => {
    const block = makeExportModel(makeApplicationResult({ reviewDecisionBatch: makeReviewBatch([]) })).sections[0].blocks[0];

    expect(block).not.toHaveProperty("appliedSelectionId");
  });

  it("omits appliedChangeId for unchanged blocks", () => {
    const block = makeExportModel(makeApplicationResult({ reviewDecisionBatch: makeReviewBatch([]) })).sections[0].blocks[0];

    expect(block).not.toHaveProperty("appliedChangeId");
  });

  it("marks rewritten blocks as approved_selection", () => {
    expect(makeExportModel().sections[0].blocks[0].textSource).toBe("approved_selection");
  });

  it("keeps appliedSelectionId for rewritten blocks", () => {
    const applicationResult = makeApplicationResult();
    const model = makeExportModel(applicationResult);
    const exportedBlock = model.sections[0].blocks[0];
    const adaptedBlock = applicationResult.adaptedDocument.sections[0].blocks[0];

    expect(exportedBlock.appliedSelectionId).toBe(adaptedBlock.appliedSelectionId);
    expect(exportedBlock.appliedSelectionId).not.toBe("other-selection");
    expect(exportedBlock.appliedChangeId).toBe(buildAppliedRewriteChangeId(
      model.applicationId,
      exportedBlock.appliedSelectionId as string,
      exportedBlock.blockId,
    ));
  });

  it("keeps applied changeId as appliedChangeId for rewritten blocks", () => {
    const applicationResult = makeApplicationResult();
    const model = makeExportModel(applicationResult);

    expect(model.sections[0].blocks[0].appliedChangeId).toBe(applicationResult.changes[0].changeId);
  });

  it("marks approved_unchanged blocks as approved_selection", () => {
    const model = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Built deterministic automation." })]),
    }));

    expect(model.sections[0].blocks[0].applicationStatus).toBe("approved_unchanged");
    expect(model.sections[0].blocks[0].textSource).toBe("approved_selection");
  });

  it("keeps approved_unchanged texts identical", () => {
    const block = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Built deterministic automation." })]),
    })).sections[0].blocks[0];

    expect(block.originalText).toBe(block.effectiveText);
    expect(block.renderText).toBe(block.effectiveText);
  });

  it("keeps approved_unchanged selection and change traceability", () => {
    const applicationResult = makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Built deterministic automation." })]),
    });
    const block = makeExportModel(applicationResult).sections[0].blocks[0];

    expect(block.appliedSelectionId).toBe(applicationResult.changes[0].selectionId);
    expect(block.appliedChangeId).toBe(applicationResult.changes[0].changeId);
  });

  it("does not convert approved_unchanged to source_original", () => {
    const block = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Built deterministic automation." })]),
    })).sections[0].blocks[0];

    expect(block.textSource).toBe("approved_selection");
  });

  it("rejects renderText that differs from effectiveText", () => {
    const block = makeExportModel().sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({ ...block, renderText: "different" }).success).toBe(false);
  });

  it.each([
    ["extra leading space", " Built deterministic automation for review workflows."],
    ["extra trailing space", "Built deterministic automation for review workflows. "],
    ["different tab", "Built deterministic\tautomation for review workflows."],
    ["different line break", "Built deterministic automation\nfor review workflows."],
    ["different Unicode", "Built deterministic automation for review workflows. Ñ"],
    ["different uppercase", "built deterministic automation for review workflows."],
    ["different punctuation", "Built deterministic automation for review workflows!"],
  ] as const)("rejects renderText with %s", (_label, renderText) => {
    const block = makeExportModel().sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({ ...block, renderText }).success).toBe(false);
  });

  it("accepts renderText with literal spaces, tabs, line breaks, Unicode, accents, and punctuation when equal to effectiveText", () => {
    const effectiveText = "  Approved  text\twith\ncafé, Résumé, Ñ?!  ";
    const block = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: effectiveText })]),
    })).sections[0].blocks[0];

    expect(block.effectiveText).toBe(effectiveText);
    expect(block.renderText).toBe(effectiveText);
    expect(ResumeExportBlockSchema.safeParse(block).success).toBe(true);
  });

  it("rejects unchanged blocks with applied IDs", () => {
    const block = makeExportModel(makeApplicationResult({ reviewDecisionBatch: makeReviewBatch([]) })).sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({
      ...block,
      appliedSelectionId: "selection-a",
      appliedChangeId: "change-a",
    }).success).toBe(false);
  });

  it("rejects rewritten blocks without applied IDs", () => {
    const block = makeExportModel().sections[0].blocks[0];

    const { appliedSelectionId: _selectionId, appliedChangeId: _changeId, ...withoutIds } = block;
    expect(ResumeExportBlockSchema.safeParse(withoutIds).success).toBe(false);
  });

  it("rejects rewritten blocks with identical texts", () => {
    const block = makeExportModel().sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({
      ...block,
      effectiveText: block.originalText,
      renderText: block.originalText,
    }).success).toBe(false);
  });

  it("rejects approved_unchanged blocks without applied IDs", () => {
    const block = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Built deterministic automation." })]),
    })).sections[0].blocks[0];

    const { appliedSelectionId: _selectionId, appliedChangeId: _changeId, ...withoutIds } = block;
    expect(ResumeExportBlockSchema.safeParse(withoutIds).success).toBe(false);
  });

  it("rejects approved_unchanged blocks with different texts", () => {
    const block = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Built deterministic automation." })]),
    })).sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({
      ...block,
      effectiveText: "different",
      renderText: "different",
    }).success).toBe(false);
  });

  it("rejects incoherent textSource", () => {
    const block = makeExportModel().sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({ ...block, textSource: "source_original" }).success).toBe(false);
  });

  it("rejects unknown applicationStatus", () => {
    const block = makeExportModel().sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({ ...block, applicationStatus: "draft" }).success).toBe(false);
  });

  it("recalculates applicationId from selected block selectionIds", () => {
    const model = makeExportModel();

    expect(model.applicationId).toBe(buildRewriteApplicationId({
      offerId: model.offerId,
      profileId: model.profileId,
      sourceDocumentId: model.sourceDocumentId,
      selectionIds: [model.sections[0].blocks[0].appliedSelectionId as string],
    }));
  });

  it("calculates applicationId from sorted selectionIds without changing structural block order", () => {
    const resumeDocument = makeResumeDocument({
      sections: [makeSection({ blocks: [
        makeBlock({ blockId: "block-z", originalText: "Z original." }),
        makeBlock({ blockId: "block-a", order: 1, originalText: "A original." }),
      ] })],
    });
    const selectionZ = makeSelection({
      selectionId: "selection-z",
      validationId: "validation-z",
      blockId: "block-z",
      originalText: "Z original.",
      approvedText: "Z approved.",
    });
    const selectionA = makeSelection({
      selectionId: "selection-a",
      validationId: "validation-a",
      blockId: "block-a",
      originalText: "A original.",
      approvedText: "A approved.",
    });
    const selections = [selectionZ, selectionA];
    const beforeSelectionOrder = selections.map((selection) => selection.selectionId);
    const first = makeExportModel(makeApplicationResult({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch(selections),
    }));
    const second = makeExportModel(makeApplicationResult({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([...selections].reverse()),
    }));

    expect(first.applicationId).toBe(buildRewriteApplicationId({
      offerId: first.offerId,
      profileId: first.profileId,
      sourceDocumentId: first.sourceDocumentId,
      selectionIds: ["selection-z", "selection-a"],
    }));
    expect(first.applicationId).toBe(second.applicationId);
    expect(first.sections[0].blocks.map((block) => block.blockId)).toEqual(["block-z", "block-a"]);
    expect(selections.map((selection) => selection.selectionId)).toEqual(beforeSelectionOrder);
  });

  it("rejects incorrect applicationId", () => {
    expect(ResumeExportModelSchema.safeParse({ ...makeExportModel(), applicationId: "wrong" }).success).toBe(false);
  });

  it("rejects applicationId that omits an appliedSelectionId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      applicationId: buildRewriteApplicationId({
        offerId: model.offerId,
        profileId: model.profileId,
        sourceDocumentId: model.sourceDocumentId,
        selectionIds: [],
      }),
    }).success).toBe(false);
  });

  it("rejects applicationId that adds an unknown selectionId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      applicationId: buildRewriteApplicationId({
        offerId: model.offerId,
        profileId: model.profileId,
        sourceDocumentId: model.sourceDocumentId,
        selectionIds: [
          model.sections[0].blocks[0].appliedSelectionId as string,
          "selection-extra",
        ],
      }),
    }).success).toBe(false);
  });

  it("rejects applicationId with a different offerId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      applicationId: buildRewriteApplicationId({
        offerId: "other-offer",
        profileId: model.profileId,
        sourceDocumentId: model.sourceDocumentId,
        selectionIds: [model.sections[0].blocks[0].appliedSelectionId as string],
      }),
    }).success).toBe(false);
  });

  it("rejects applicationId with a different profileId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      applicationId: buildRewriteApplicationId({
        offerId: model.offerId,
        profileId: "other-profile",
        sourceDocumentId: model.sourceDocumentId,
        selectionIds: [model.sections[0].blocks[0].appliedSelectionId as string],
      }),
    }).success).toBe(false);
  });

  it("rejects applicationId with a different sourceDocumentId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      applicationId: buildRewriteApplicationId({
        offerId: model.offerId,
        profileId: model.profileId,
        sourceDocumentId: "other-document",
        selectionIds: [model.sections[0].blocks[0].appliedSelectionId as string],
      }),
    }).success).toBe(false);
  });

  it("rejects incorrect adaptedDocumentId", () => {
    expect(ResumeExportModelSchema.safeParse({
      ...makeExportModel(),
      adaptedDocumentId: buildAdaptedResumeDocumentId("other-application"),
    }).success).toBe(false);
  });

  it("rejects incorrect exportModelId", () => {
    expect(ResumeExportModelSchema.safeParse({ ...makeExportModel(), exportModelId: "resume-export-model|application=x|adapted-document=y" }).success).toBe(false);
  });

  it("rejects exportModelId built with another applicationId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      exportModelId: buildResumeExportModelId("other-application", model.adaptedDocumentId),
    }).success).toBe(false);
  });

  it("rejects exportModelId built with another adaptedDocumentId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      exportModelId: buildResumeExportModelId(model.applicationId, buildAdaptedResumeDocumentId("other-application")),
    }).success).toBe(false);
  });

  it("rejects exportModelId with an incorrect prefix", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      exportModelId: model.exportModelId.replace("resume-export-model", "wrong-export-model"),
    }).success).toBe(false);
  });

  it("rejects incorrect exportSectionId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithSection(model, {
      exportSectionId: buildResumeExportSectionId(model.exportModelId, "other-section"),
    })).success).toBe(false);
  });

  it("rejects exportSectionId built with another exportModelId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithSection(model, {
      exportSectionId: buildResumeExportSectionId("other-export-model", model.sections[0].sectionId),
    })).success).toBe(false);
  });

  it("rejects arbitrary exportSectionId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithSection(model, {
      exportSectionId: "arbitrary-section-id",
    })).success).toBe(false);
  });

  it("rejects incorrect exportBlockId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      exportBlockId: buildResumeExportBlockId(model.exportModelId, "section-a", "other-block"),
    })).success).toBe(false);
  });

  it("rejects exportBlockId built with another exportModelId", () => {
    const model = makeExportModel();
    const block = model.sections[0].blocks[0];

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      exportBlockId: buildResumeExportBlockId("other-export-model", model.sections[0].sectionId, block.blockId),
    })).success).toBe(false);
  });

  it("rejects exportBlockId built with another sectionId", () => {
    const model = makeExportModel();
    const block = model.sections[0].blocks[0];

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      exportBlockId: buildResumeExportBlockId(model.exportModelId, "other-section", block.blockId),
    })).success).toBe(false);
  });

  it("rejects arbitrary exportBlockId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      exportBlockId: "arbitrary-block-id",
    })).success).toBe(false);
  });

  it("rejects incorrect appliedChangeId", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedChangeId: "arbitrary-change",
    })).success).toBe(false);
  });

  it("rejects appliedChangeId with another applicationId", () => {
    const model = makeExportModel();
    const block = model.sections[0].blocks[0];

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedChangeId: buildAppliedRewriteChangeId("other-application", block.appliedSelectionId as string, block.blockId),
    })).success).toBe(false);
  });

  it("rejects appliedChangeId with another selectionId", () => {
    const model = makeExportModel();
    const block = model.sections[0].blocks[0];

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedChangeId: buildAppliedRewriteChangeId(model.applicationId, "other-selection", block.blockId),
    })).success).toBe(false);
  });

  it("rejects appliedChangeId with another blockId", () => {
    const model = makeExportModel();
    const block = model.sections[0].blocks[0];

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedChangeId: buildAppliedRewriteChangeId(model.applicationId, block.appliedSelectionId as string, "other-block"),
    })).success).toBe(false);
  });

  it("rejects appliedChangeId with an incorrect prefix", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedChangeId: (model.sections[0].blocks[0].appliedChangeId as string).replace("applied-rewrite", "wrong-rewrite"),
    })).success).toBe(false);
  });

  it.each([
    ["profileId", { profileId: "bad profile" }],
    ["sourceDocumentId", { sourceDocumentId: "bad/source" }],
  ] as const)("uses IdSchema for model %s", (_field, update) => {
    expect(ResumeExportModelSchema.safeParse({ ...makeExportModel(), ...update }).success).toBe(false);
  });

  it.each([
    ["sectionId", { sectionId: "bad section" }],
  ] as const)("uses IdSchema for section %s", (_field, update) => {
    expect(ResumeExportSectionSchema.safeParse({ ...makeExportModel().sections[0], ...update }).success).toBe(false);
  });

  it.each([
    ["sectionId", { sectionId: "bad section" }],
    ["blockId", { blockId: "bad:block" }],
  ] as const)("uses IdSchema for block %s", (_field, update) => {
    expect(ResumeExportBlockSchema.safeParse({ ...makeExportModel().sections[0].blocks[0], ...update }).success).toBe(false);
  });

  it.each([
    ["model", ResumeExportModelIdSchema, "wrong|application=a|adapted-document=b"],
    ["section", ResumeExportSectionIdSchema, "wrong|export-model=a|section=b"],
    ["block", ResumeExportBlockIdSchema, "wrong|export-model=a|section=b|block=c"],
  ] as const)("requires the correct export ID prefix for %s IDs", (_label, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["model application", ResumeExportModelIdSchema, "resume-export-model|application=|adapted-document=a"],
    ["model adapted document", ResumeExportModelIdSchema, "resume-export-model|application=a|adapted-document="],
    ["section export model", ResumeExportSectionIdSchema, "resume-export-section|export-model=|section=a"],
    ["section section", ResumeExportSectionIdSchema, "resume-export-section|export-model=a|section="],
    ["block export model", ResumeExportBlockIdSchema, "resume-export-block|export-model=|section=a|block=b"],
    ["block section", ResumeExportBlockIdSchema, "resume-export-block|export-model=a|section=|block=b"],
    ["block block", ResumeExportBlockIdSchema, "resume-export-block|export-model=a|section=b|block="],
  ] as const)("rejects empty export ID component %s", (_label, schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("builds deterministic export IDs", () => {
    const model = makeExportModel();

    expect(makeExportModel().exportModelId).toBe(model.exportModelId);
    expect(model.sections[0].exportSectionId).toBe(buildResumeExportSectionId(model.exportModelId, "section-a"));
    expect(model.sections[0].blocks[0].exportBlockId).toBe(buildResumeExportBlockId(model.exportModelId, "section-a", "block-a"));
  });

  it("encodes special IDs without collisions", () => {
    const special = "id Ñ / : | & = ? # % space";
    const other = "id Ñ / : | & = ? # % other";

    expect(buildResumeExportModelId(special, other)).not.toBe(buildResumeExportModelId(other, special));
    expect(buildResumeExportSectionId(special, other)).toContain(encodeURIComponent(special));
    expect(buildResumeExportBlockId(special, other, "block Ñ / : | & = ? # %")).toContain(encodeURIComponent(other));
  });

  it("does not include texts in export IDs", () => {
    const first = makeExportModel();
    const second = makeExportModel(makeApplicationResult({
      reviewDecisionBatch: makeReviewBatch([makeSelection({ approvedText: "Different approved text" })]),
    }));

    expect(second.exportModelId).toBe(first.exportModelId);
    expect(second.sections[0].exportSectionId).toBe(first.sections[0].exportSectionId);
    expect(second.sections[0].blocks[0].exportBlockId).toBe(first.sections[0].blocks[0].exportBlockId);
  });

  it("does not include source in export IDs", () => {
    const first = makeExportModel(makeApplicationResult());
    const second = makeExportModel(makeApplicationResult({
      resumeDocument: makeResumeDocument({ source: { format: "plain_text", fileName: "other.txt" } }),
    }));

    expect(second.exportModelId).toBe(first.exportModelId);
  });

  it("changes exportModelId when applicationId changes", () => {
    const model = makeExportModel();

    expect(buildResumeExportModelId("other-application", model.adaptedDocumentId)).not.toBe(model.exportModelId);
  });

  it("changes exportModelId when adaptedDocumentId changes", () => {
    const model = makeExportModel();

    expect(buildResumeExportModelId(model.applicationId, buildAdaptedResumeDocumentId("other-application"))).not.toBe(model.exportModelId);
  });

  it("changes exportSectionId when sectionId changes", () => {
    const model = makeExportModel();

    expect(buildResumeExportSectionId(model.exportModelId, "other-section")).not.toBe(model.sections[0].exportSectionId);
  });

  it("changes exportBlockId when blockId changes", () => {
    const model = makeExportModel();

    expect(buildResumeExportBlockId(model.exportModelId, "section-a", "other-block")).not.toBe(model.sections[0].blocks[0].exportBlockId);
  });

  it("rejects duplicate sectionId", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(ResumeExportModelSchema.safeParse(modelWithSection(model, { sectionId: model.sections[0].sectionId }, 1)).success).toBe(false);
  });

  it("rejects global duplicate blockId", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, { blockId: model.sections[0].blocks[0].blockId }, 0, 1)).success).toBe(false);
  });

  it("rejects duplicate exportSectionId", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(ResumeExportModelSchema.safeParse(modelWithSection(model, { exportSectionId: model.sections[0].exportSectionId }, 1)).success).toBe(false);
  });

  it("rejects duplicate exportBlockId", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, { exportBlockId: model.sections[0].blocks[0].exportBlockId }, 0, 1)).success).toBe(false);
  });

  it("rejects duplicate appliedSelectionId", () => {
    const resumeDocument = makeResumeDocument({ sections: [makeSection({ blocks: [
      makeBlock({ blockId: "block-a" }),
      makeBlock({ blockId: "block-b", order: 1, originalText: "Second original." }),
    ] })] });
    const model = makeExportModel(makeApplicationResult({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([
        makeSelection({ selectionId: "selection-a", blockId: "block-a" }),
        makeSelection({ selectionId: "selection-b", validationId: "validation-b", blockId: "block-b", originalText: "Second original.", approvedText: "Second approved." }),
      ]),
    }));

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedSelectionId: model.sections[0].blocks[0].appliedSelectionId,
    }, 0, 1)).success).toBe(false);
  });

  it("rejects duplicate appliedChangeId", () => {
    const resumeDocument = makeResumeDocument({ sections: [makeSection({ blocks: [
      makeBlock({ blockId: "block-a" }),
      makeBlock({ blockId: "block-b", order: 1, originalText: "Second original." }),
    ] })] });
    const model = makeExportModel(makeApplicationResult({
      resumeDocument,
      reviewDecisionBatch: makeReviewBatch([
        makeSelection({ selectionId: "selection-a", blockId: "block-a" }),
        makeSelection({ selectionId: "selection-b", validationId: "validation-b", blockId: "block-b", originalText: "Second original.", approvedText: "Second approved." }),
      ]),
    }));

    expect(ResumeExportModelSchema.safeParse(modelWithBlock(model, {
      appliedChangeId: model.sections[0].blocks[0].appliedChangeId,
    }, 0, 1)).success).toBe(false);
  });

  it("rejects block.sectionId different from section.sectionId", () => {
    expect(ResumeExportSectionSchema.safeParse({
      ...makeExportModel().sections[0],
      blocks: [{ ...makeExportModel().sections[0].blocks[0], sectionId: "other-section" }],
    }).success).toBe(false);
  });

  it("rejects an empty export section", () => {
    const section = makeExportModel().sections[0];

    expect(ResumeExportSectionSchema.safeParse({ ...section, blocks: [] }).success).toBe(false);
  });

  it("rejects duplicate block order inside a section", () => {
    const section = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }))
      .sections[0];

    expect(ResumeExportSectionSchema.safeParse({
      ...section,
      blocks: [
        section.blocks[0],
        { ...section.blocks[1], order: section.blocks[0].order },
      ],
    }).success).toBe(false);
  });

  it("rejects duplicate blockId inside a section", () => {
    const section = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }))
      .sections[0];

    expect(ResumeExportSectionSchema.safeParse({
      ...section,
      blocks: [
        section.blocks[0],
        { ...section.blocks[1], blockId: section.blocks[0].blockId },
      ],
    }).success).toBe(false);
  });

  it("rejects duplicate exportBlockId inside a section", () => {
    const section = makeExportModel(makeApplicationResult({ resumeDocument: twoBlockResume(), reviewDecisionBatch: makeReviewBatch([]) }))
      .sections[0];

    expect(ResumeExportSectionSchema.safeParse({
      ...section,
      blocks: [
        section.blocks[0],
        { ...section.blocks[1], exportBlockId: section.blocks[0].exportBlockId },
      ],
    }).success).toBe(false);
  });

  it.each([
    ["approvalRationale", "rationale"],
    ["rationale", "rationale"],
    ["candidateText", "candidate"],
    ["candidateId", "candidate-a"],
    ["validationId", "validation-a"],
    ["requestId", "request-a"],
    ["proposalId", "proposal-a"],
    ["actionId", "action-a"],
    ["resolutionId", "resolution-a"],
    ["approvedText", "approved"],
    ["beforeText", "before"],
    ["afterText", "after"],
    ["sourceFindingCodes", []],
    ["reviewerId", "reviewer-a"],
    ["reviewerName", "Reviewer"],
    ["provider", "openai"],
    ["model", "gpt"],
    ["prompt", "prompt"],
    ["systemPrompt", "system"],
    ["outputPath", "output/cv.docx"],
    ["filename", "cv.docx"],
    ["file", {}],
    ["buffer", []],
    ["blob", {}],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["html", "<p>cv</p>"],
    ["template", "default"],
    ["exportStatus", "ready"],
    ["styles", {}],
    ["generatedAt", "2026-07-30"],
    ["exportedAt", "2026-07-30"],
    ["timestamp", "2026-07-30"],
  ] as const)("ResumeExportBlockSchema is strict and rejects %s", (field, value) => {
    expect(ResumeExportBlockSchema.safeParse({ ...makeExportModel().sections[0].blocks[0], [field]: value }).success).toBe(false);
  });

  it("rejects unknown fields inside sourceLocator", () => {
    const block = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }))
      .sections[0].blocks[0];

    expect(ResumeExportBlockSchema.safeParse({
      ...block,
      sourceLocator: { ...block.sourceLocator, page: 1 },
    }).success).toBe(false);
  });

  it("ResumeExportSectionSchema is strict", () => {
    expect(ResumeExportSectionSchema.safeParse({ ...makeExportModel().sections[0], layout: "two-column" }).success).toBe(false);
  });

  it.each([
    ["generatedAt", "2026-07-30"],
    ["exportedAt", "2026-07-30"],
    ["outputPath", "output/cv.docx"],
    ["filename", "cv.docx"],
    ["file", {}],
    ["buffer", []],
    ["blob", {}],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["html", "<p>cv</p>"],
    ["styles", {}],
    ["template", "default"],
    ["provider", "openai"],
    ["model", "gpt"],
    ["exportStatus", "ready"],
  ] as const)("ResumeExportSectionSchema rejects forbidden field %s", (field, value) => {
    expect(ResumeExportSectionSchema.safeParse({ ...makeExportModel().sections[0], [field]: value }).success).toBe(false);
  });

  it.each([
    ["generatedAt", "2026-07-30"],
    ["exportedAt", "2026-07-30"],
    ["outputPath", "output/cv.docx"],
    ["filename", "cv.docx"],
    ["file", {}],
    ["buffer", []],
    ["blob", {}],
    ["docx", "cv.docx"],
    ["pdf", "cv.pdf"],
    ["html", "<p>cv</p>"],
    ["styles", {}],
    ["template", "default"],
    ["provider", "openai"],
    ["model", "gpt"],
    ["exportStatus", "ready"],
    ["prompt", "prompt"],
  ] as const)("ResumeExportModelSchema is strict and rejects %s", (field, value) => {
    expect(ResumeExportModelSchema.safeParse({ ...makeExportModel(), [field]: value }).success).toBe(false);
  });

  it("accepts the no-approval case", () => {
    expect(ResumeExportModelSchema.safeParse(makeExportModel(makeApplicationResult({ reviewDecisionBatch: makeReviewBatch([]) }))).success).toBe(true);
  });

  it("preserves the complete structure in the no-approval case", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(model.sections).toHaveLength(2);
    expect(model.sections[0].blocks).toHaveLength(1);
    expect(model.sections[1].blocks).toHaveLength(1);
  });

  it("creates new objects in the no-approval case", () => {
    const applicationResult = mutableClone(makeApplicationResult({ reviewDecisionBatch: makeReviewBatch([]) }));
    const model = makeExportModel(applicationResult);

    expect(model.source).not.toBe(applicationResult.adaptedDocument.source);
    expect(model.sections).not.toBe(applicationResult.adaptedDocument.sections);
    expect(model.sections[0].blocks).not.toBe(applicationResult.adaptedDocument.sections[0].blocks);
    expect(model.sections[0].blocks[0]).not.toBe(applicationResult.adaptedDocument.sections[0].blocks[0]);
  });

  it("builds a coherent summary", () => {
    expect(makeExportModel().summary).toEqual({
      totalSections: 1,
      totalBlocks: 1,
      renderedFromOriginal: 0,
      renderedFromApprovedSelection: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      totalAppliedChangeReferences: 1,
    });
  });

  it("builds a coherent mixed summary with unchanged, rewritten, and approved_unchanged blocks", () => {
    expect(makeExportModel(mixedApplicationResult()).summary).toEqual({
      totalSections: 1,
      totalBlocks: 3,
      renderedFromOriginal: 1,
      renderedFromApprovedSelection: 2,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 1,
      totalAppliedChangeReferences: 2,
    });
  });

  it.each([
    "totalSections",
    "totalBlocks",
    "renderedFromOriginal",
    "renderedFromApprovedSelection",
    "rewrittenBlocks",
    "approvedUnchangedBlocks",
    "totalAppliedChangeReferences",
  ] as const)("rejects incoherent summary counter %s", (field) => {
    const model = makeExportModel(mixedApplicationResult());

    expect(ResumeExportModelSchema.safeParse({
      ...model,
      summary: {
        ...model.summary,
        [field]: model.summary[field] + 1,
      },
    }).success).toBe(false);
  });

  it("rejects incoherent summaries", () => {
    expect(ResumeExportModelSchema.safeParse({
      ...makeExportModel(),
      summary: { ...makeExportModel().summary, totalBlocks: 99 },
    }).success).toBe(false);
  });

  it.each([
    "totalSections",
    "totalBlocks",
    "renderedFromOriginal",
    "renderedFromApprovedSelection",
    "rewrittenBlocks",
    "approvedUnchangedBlocks",
    "totalAppliedChangeReferences",
  ] as const)("rejects negative summary counter %s", (field) => {
    const model = makeExportModel(mixedApplicationResult());

    expect(ResumeExportSummarySchema.safeParse({
      ...model.summary,
      [field]: -1,
    }).success).toBe(false);
  });

  it.each([
    "totalSections",
    "totalBlocks",
    "renderedFromOriginal",
    "renderedFromApprovedSelection",
    "rewrittenBlocks",
    "approvedUnchangedBlocks",
    "totalAppliedChangeReferences",
  ] as const)("rejects decimal summary counter %s", (field) => {
    const model = makeExportModel(mixedApplicationResult());

    expect(ResumeExportSummarySchema.safeParse({
      ...model.summary,
      [field]: 1.5,
    }).success).toBe(false);
  });

  it("rejects negative summary counts", () => {
    expect(ResumeExportSummarySchema.safeParse({
      totalSections: -1,
      totalBlocks: 1,
      renderedFromOriginal: 0,
      renderedFromApprovedSelection: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      totalAppliedChangeReferences: 1,
    }).success).toBe(false);
  });

  it("rejects non-integer summary counts", () => {
    expect(ResumeExportSummarySchema.safeParse({
      totalSections: 1.5,
      totalBlocks: 1,
      renderedFromOriginal: 0,
      renderedFromApprovedSelection: 1,
      rewrittenBlocks: 1,
      approvedUnchangedBlocks: 0,
      totalAppliedChangeReferences: 1,
    }).success).toBe(false);
  });

  it("does not mutate input", () => {
    const applicationResult = mutableClone(makeApplicationResult());
    const before = JSON.stringify(applicationResult);

    buildResumeExportModel({ applicationResult });

    expect(JSON.stringify(applicationResult)).toBe(before);
  });

  it("does not freeze input accidentally", () => {
    const applicationResult = mutableClone(makeApplicationResult());

    buildResumeExportModel({ applicationResult });

    expect(Object.isFrozen(applicationResult)).toBe(false);
    expect(Object.isFrozen(applicationResult.adaptedDocument)).toBe(false);
    expect(Object.isFrozen(applicationResult.adaptedDocument.sections)).toBe(false);
    expect(Object.isFrozen(applicationResult.adaptedDocument.sections[0].blocks)).toBe(false);
  });

  it("accepts deeply frozen input", () => {
    const applicationResult = deepFreeze(mutableClone(makeApplicationResult()));

    expect(buildResumeExportModel({ applicationResult }).summary.totalBlocks).toBe(1);
  });

  it("returns a deeply frozen output", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.sections)).toBe(true);
    expect(Object.isFrozen(model.sections[0])).toBe(true);
    expect(Object.isFrozen(model.sections[0].blocks)).toBe(true);
    expect(Object.isFrozen(model.sections[0].blocks[0])).toBe(true);
    expect(Object.isFrozen(model.summary)).toBe(true);
  });

  it("freezes output source", () => {
    expect(Object.isFrozen(makeExportModel().source)).toBe(true);
  });

  it("freezes output evidenceIds", () => {
    expect(Object.isFrozen(makeExportModel().sections[0].blocks[0].evidenceIds)).toBe(true);
  });

  it("keeps duplicate evidenceIds frozen, independent, and stable after mutation attempts", () => {
    const applicationResult = mutableClone(makeApplicationResult({
      resumeDocument: makeResumeDocument({
        sections: [makeSection({
          blocks: [makeBlock({ evidenceIds: ["evidence-1", "evidence-1", "evidence-2"] })],
        })],
      }),
    }));
    const inputEvidenceIds = applicationResult.adaptedDocument.sections[0].blocks[0].evidenceIds;
    const model = buildResumeExportModel({ applicationResult });
    const outputEvidenceIds = model.sections[0].blocks[0].evidenceIds;
    const before = JSON.stringify(model);

    expect(outputEvidenceIds).toEqual(["evidence-1", "evidence-1", "evidence-2"]);
    expect(outputEvidenceIds).not.toBe(inputEvidenceIds);
    expect(Object.isFrozen(outputEvidenceIds)).toBe(true);
    expect(Object.isFrozen(inputEvidenceIds)).toBe(false);
    expect(() => outputEvidenceIds.push("evidence-3")).toThrow();
    expect(JSON.stringify(model)).toBe(before);

    inputEvidenceIds.push("evidence-3");
    expect(outputEvidenceIds).toEqual(["evidence-1", "evidence-1", "evidence-2"]);
  });

  it("freezes output sourceLocator", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));

    expect(Object.isFrozen(model.sections[0].blocks[0].sourceLocator)).toBe(true);
  });

  it("mutation attempts do not alter the output", () => {
    const model = makeExportModel(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));
    const before = JSON.stringify(model);

    expect(() => Object.assign(model.source, { fileName: "changed.md" })).toThrow();
    expect(() => model.sections.push(model.sections[0])).toThrow();
    expect(() => model.sections[0].blocks.push(model.sections[0].blocks[0])).toThrow();
    expect(() => model.sections[0].blocks[0].evidenceIds.push("new-evidence")).toThrow();
    expect(() => Object.assign(model.sections[0].blocks[0].sourceLocator ?? {}, { value: "99" })).toThrow();
    expect(() => Object.assign(model.summary, { totalBlocks: 99 })).toThrow();
    expect(JSON.stringify(model)).toBe(before);
  });

  it("does not share source with input", () => {
    const applicationResult = mutableClone(makeApplicationResult());
    const model = makeExportModel(applicationResult);

    expect(model.source).not.toBe(applicationResult.adaptedDocument.source);
  });

  it("does not share sections with input", () => {
    const applicationResult = mutableClone(makeApplicationResult());
    const model = makeExportModel(applicationResult);

    expect(model.sections).not.toBe(applicationResult.adaptedDocument.sections);
  });

  it("does not share blocks with input", () => {
    const applicationResult = mutableClone(makeApplicationResult());
    const model = makeExportModel(applicationResult);

    expect(model.sections[0].blocks[0]).not.toBe(applicationResult.adaptedDocument.sections[0].blocks[0]);
  });

  it("does not share evidenceIds with input", () => {
    const applicationResult = mutableClone(makeApplicationResult());
    const model = makeExportModel(applicationResult);

    expect(model.sections[0].blocks[0].evidenceIds).not.toBe(applicationResult.adaptedDocument.sections[0].blocks[0].evidenceIds);
  });

  it("does not share sourceLocator with input", () => {
    const applicationResult = mutableClone(makeApplicationResult({ resumeDocument: twoSectionResume(), reviewDecisionBatch: makeReviewBatch([]) }));
    const model = makeExportModel(applicationResult);

    expect(model.sections[0].blocks[0].sourceLocator).not.toBe(applicationResult.adaptedDocument.sections[0].blocks[0].sourceLocator);
  });

  it("does not use Date, random, UUID, network, provider, or LLM adapters", () => {
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

    const serialized = JSON.stringify(makeExportModel());

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUUIDSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("prompt");

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUUIDSpy?.mockRestore();
    fetchSpy?.mockRestore();
  });

  it("does not generate or correct text", () => {
    const applicationResult = makeApplicationResult();
    const model = makeExportModel(applicationResult);

    expect(model.sections[0].blocks[0].renderText).toBe(applicationResult.adaptedDocument.sections[0].blocks[0].effectiveText);
  });

  it("does not write DOCX, PDF, or HTML fields", () => {
    const model = makeExportModel();

    expect(model).not.toHaveProperty("docx");
    expect(model).not.toHaveProperty("pdf");
    expect(model).not.toHaveProperty("html");
  });

  it("does not use templates or styles", () => {
    const serialized = JSON.stringify(makeExportModel());

    expect(serialized).not.toContain("template");
    expect(serialized).not.toContain("styles");
  });

  it("does not persist", () => {
    const serialized = JSON.stringify(makeExportModel());

    expect(serialized).not.toContain("storedAt");
    expect(serialized).not.toContain("outputPath");
  });

  it("does not modify UI", () => {
    const serialized = JSON.stringify(makeExportModel());

    expect(serialized).not.toContain("uiState");
    expect(serialized).not.toContain("dashboard");
  });

  it("uses only synthetic test data", () => {
    const model = makeExportModel();

    expect(model.offerId).toBe("offer-1");
    expect(model.profileId).toBe("profile-1");
    expect(model.sourceDocumentId).toBe("resume-doc");
  });

  it("documents the export model as distinct from exported files", () => {
    const doc = readFileSync(
      "docs/redesign/IMPLEMENTATION_11_RESUME_EXPORT_MODEL.md",
      "utf8",
    );

    expect(doc).toContain("ResumeExportModel");
    expect(doc).toContain("does not create DOCX");
    expect(doc).toContain("renderText");
  });

  it("documents a JSON example that validates with ResumeExportModelSchema", () => {
    const doc = readFileSync(
      "docs/redesign/IMPLEMENTATION_11_RESUME_EXPORT_MODEL.md",
      "utf8",
    );
    const normalizedDoc = doc.replace(/\r\n/g, "\n");
    const match = normalizedDoc.match(/```json\n([\s\S]*?)\n```/);

    expect(match).not.toBeNull();
    expect(ResumeExportModelSchema.safeParse(JSON.parse(match?.[1] ?? "{}")).success).toBe(true);
  });

  it("exposes the exact export scope literal", () => {
    expect(ResumeExportScopeSchema.parse("structured_content_for_future_docx_rendering")).toBe(
      "structured_content_for_future_docx_rendering",
    );
  });

  it("exposes exact textSource literals", () => {
    expect(ResumeExportTextSourceSchema.options).toEqual(["source_original", "approved_selection"]);
  });

  it("output validates after JSON roundtrip", () => {
    const model = makeExportModel();

    expect(ResumeExportModelSchema.safeParse(JSON.parse(JSON.stringify(model))).success).toBe(true);
  });

  it("application result fixtures remain valid", () => {
    expect(ApprovedRewriteApplicationResultSchema.safeParse(makeApplicationResult()).success).toBe(true);
  });
});
