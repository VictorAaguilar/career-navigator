import { describe, expect, it, vi } from "vitest";
import {
  TailoringTargetingInputErrorCode,
  resolveTailoringTargets,
  type ResolveTailoringTargetsInput,
} from "../../src/core/tailoring";
import {
  TailoringTargetResolutionSchema,
  TailoringTargetingResultSchema,
  type ResumeBlock,
  type ResumeDocument,
  type ResumeSection,
  type TailoringAction,
  type TailoringPlan,
} from "../../src/schemas";

const makeAction = (overrides: Partial<TailoringAction> = {}): TailoringAction => ({
  actionId: overrides.actionId ?? "action-a",
  type: overrides.type ?? "highlight_evidence",
  targetSection: overrides.targetSection ?? "experience",
  requirementIds: overrides.requirementIds ?? ["req-a"],
  evidenceIds: overrides.evidenceIds ?? ["evidence-a"],
  reason: overrides.reason ?? "Evidence-backed action.",
  supportStatus: overrides.supportStatus ?? "supported",
  priority: overrides.priority ?? "high",
});

const makePlan = (overrides: Partial<TailoringPlan> = {}): TailoringPlan => {
  const actions = overrides.actions ?? [makeAction()];
  const gaps = overrides.gaps ?? [];
  const reviewItems = overrides.reviewItems ?? [];

  return {
    offerId: overrides.offerId ?? "offer-1",
    profileId: overrides.profileId ?? "profile-1",
    summary: overrides.summary ?? {
      totalRequirements: actions.length + gaps.length + reviewItems.length,
      supportedRequirements: actions.length,
      partiallySupportedRequirements: 0,
      unsupportedRequirements: gaps.length,
      unknownRequirements: reviewItems.length,
      actionCount: actions.length,
      gapCount: gaps.length,
      reviewItemCount: reviewItems.length,
      score: actions.length === 0 ? 0 : 80,
      confidence: actions.length === 0 ? 0.2 : 0.9,
      classification: actions.length === 0 ? "insufficient_information" : "strong_match",
    },
    actions,
    gaps,
    reviewItems,
    warnings: overrides.warnings ?? [],
  };
};

const makeBlock = (overrides: Partial<ResumeBlock> = {}): ResumeBlock => ({
  blockId: overrides.blockId ?? "block-a",
  kind: overrides.kind ?? "bullet",
  order: overrides.order ?? 0,
  originalText: overrides.originalText ?? "Original CV text.",
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

const makeInput = (overrides: Partial<ResolveTailoringTargetsInput> = {}): ResolveTailoringTargetsInput => ({
  tailoringPlan: overrides.tailoringPlan ?? makePlan(),
  resumeDocument: overrides.resumeDocument ?? makeResumeDocument(),
});

const makeResolution = (overrides: Record<string, unknown> = {}) => ({
  resolutionId: "resolution-a",
  actionId: "action-a",
  status: "resolved",
  targetSection: "experience",
  requirementIds: ["req-a"],
  evidenceIds: ["evidence-a"],
  candidateBlockIds: ["block-a"],
  selectedBlockIds: ["block-a"],
  reason: "Resolved by shared evidence.",
  ...overrides,
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

describe("Tailoring block targeting resolver", () => {
  it("validates the resolved state contract directly", () => {
    expect(TailoringTargetResolutionSchema.parse(makeResolution())).toEqual(makeResolution());
  });

  it("rejects resolved when selectedBlockIds differs from candidateBlockIds", () => {
    const result = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ selectedBlockIds: ["block-b"] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects ambiguous with fewer than two candidates or with selected blocks", () => {
    const tooFewCandidates = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ status: "ambiguous", candidateBlockIds: ["block-a"], selectedBlockIds: [] }),
    );
    const selectedBlocks = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ status: "ambiguous", candidateBlockIds: ["block-a", "block-b"], selectedBlockIds: ["block-a"] }),
    );

    expect(tooFewCandidates.success).toBe(false);
    expect(selectedBlocks.success).toBe(false);
  });

  it("rejects unresolved with candidate or selected blocks", () => {
    const withCandidates = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ status: "unresolved", candidateBlockIds: ["block-a"], selectedBlockIds: [] }),
    );
    const withSelected = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ status: "unresolved", candidateBlockIds: [], selectedBlockIds: ["block-a"] }),
    );

    expect(withCandidates.success).toBe(false);
    expect(withSelected.success).toBe(false);
  });

  it("rejects duplicate IDs in every targeting resolution ID array", () => {
    const duplicateRequirements = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ requirementIds: ["req-a", "req-a"] }),
    );
    const duplicateEvidence = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ evidenceIds: ["evidence-a", "evidence-a"] }),
    );
    const duplicateCandidates = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ status: "ambiguous", candidateBlockIds: ["block-a", "block-a"], selectedBlockIds: [] }),
    );
    const duplicateSelected = TailoringTargetResolutionSchema.safeParse(
      makeResolution({ candidateBlockIds: ["block-a"], selectedBlockIds: ["block-a", "block-a"] }),
    );

    expect(duplicateRequirements.success).toBe(false);
    expect(duplicateEvidence.success).toBe(false);
    expect(duplicateCandidates.success).toBe(false);
    expect(duplicateSelected.success).toBe(false);
  });

  it("validates a resolved targeting result schema", () => {
    const result = resolveTailoringTargets(makeInput());

    expect(TailoringTargetingResultSchema.parse(result)).toEqual(result);
    expect(result.summary).toEqual({
      totalActions: 1,
      resolvedCount: 1,
      ambiguousCount: 0,
      unresolvedCount: 0,
    });
  });

  it("rejects unknown fields in targeting schemas", () => {
    const result = resolveTailoringTargets(makeInput());
    const invalid = TailoringTargetingResultSchema.safeParse({
      ...result,
      generatedAt: "2026-07-29T00:00:00.000Z",
      warnings: [],
      resolutions: [
        {
          ...result.resolutions[0],
          beforeText: "before",
        },
      ],
    });

    expect(invalid.success).toBe(false);
  });

  it("does not expose warnings in the targeting result", () => {
    const result = resolveTailoringTargets(makeInput());

    expect("warnings" in result).toBe(false);
    expect(
      TailoringTargetingResultSchema.safeParse({
        ...result,
        warnings: [],
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent targeting summaries directly", () => {
    const result = resolveTailoringTargets(makeInput());
    const wrongTotal = TailoringTargetingResultSchema.safeParse({
      ...result,
      summary: { ...result.summary, totalActions: 2 },
    });
    const wrongResolved = TailoringTargetingResultSchema.safeParse({
      ...result,
      summary: { ...result.summary, resolvedCount: 0 },
    });

    expect(wrongTotal.success).toBe(false);
    expect(wrongResolved.success).toBe(false);
  });

  it("throws a stable error when plan and resume profileId differ", () => {
    expect(() =>
      resolveTailoringTargets(
        makeInput({
          resumeDocument: makeResumeDocument({ profileId: "other-profile" }),
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.ProfileIdMismatch);
  });

  it("throws stable errors for invalid TailoringPlan and ResumeDocument runtime input", () => {
    expect(() =>
      resolveTailoringTargets(
        makeInput({
          tailoringPlan: { ...makePlan(), offerId: "" } as TailoringPlan,
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidTailoringPlan);

    expect(() =>
      resolveTailoringTargets(
        makeInput({
          resumeDocument: { ...makeResumeDocument(), documentId: "" } as ResumeDocument,
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidResumeDocument);
  });

  it("throws a stable invalid plan error for invalid targetSection instead of TypeError", () => {
    expect(() =>
      resolveTailoringTargets(
        makeInput({
          tailoringPlan: makePlan({
            actions: [makeAction({ targetSection: "invalid-section" as TailoringAction["targetSection"] })],
          }),
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidTailoringPlan);
  });

  it("rejects empty top-level IDs through stable invalid input errors", () => {
    expect(() =>
      resolveTailoringTargets(
        makeInput({
          tailoringPlan: { ...makePlan(), profileId: "" } as TailoringPlan,
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidTailoringPlan);

    expect(() =>
      resolveTailoringTargets(
        makeInput({
          resumeDocument: { ...makeResumeDocument(), profileId: "" } as ResumeDocument,
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidResumeDocument);

    expect(() =>
      resolveTailoringTargets(
        makeInput({
          tailoringPlan: makePlan({ actions: [makeAction({ actionId: "" })] }),
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidTailoringPlan);

    expect(() =>
      resolveTailoringTargets(
        makeInput({
          resumeDocument: makeResumeDocument({
            sections: [makeSection({ blocks: [makeBlock({ blockId: "" })] })],
          }),
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.InvalidResumeDocument);
  });

  it("resolves an action with one compatible evidence-backed block", () => {
    const result = resolveTailoringTargets(makeInput());

    expect(result.resolutions).toHaveLength(1);
    expect(result.resolutions[0]).toMatchObject({
      status: "resolved",
      candidateBlockIds: ["block-a"],
      selectedBlockIds: ["block-a"],
    });
  });

  it("returns unresolved when no block shares action evidence", () => {
    const result = resolveTailoringTargets(
      makeInput({
        resumeDocument: makeResumeDocument({
          sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["evidence-b"] })] })],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "unresolved",
      candidateBlockIds: [],
      selectedBlockIds: [],
    });
  });

  it("returns ambiguous when two blocks tie for the best score", () => {
    const result = resolveTailoringTargets(
      makeInput({
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-a"] }),
                makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] }),
              ],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "ambiguous",
      candidateBlockIds: ["block-a", "block-b"],
      selectedBlockIds: [],
    });
  });

  it("selects the candidate with more shared evidenceIds", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ evidenceIds: ["evidence-a", "evidence-b"] })] }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-single", order: 0, evidenceIds: ["evidence-a"] }),
                makeBlock({ blockId: "block-double", order: 1, evidenceIds: ["evidence-a", "evidence-b"] }),
              ],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "resolved",
      candidateBlockIds: ["block-double"],
      selectedBlockIds: ["block-double"],
    });
  });

  it("deduplicates block evidenceIds before scoring so duplicates do not inflate overlap", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ evidenceIds: ["evidence-a", "evidence-b"] })] }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-duplicated", order: 0, evidenceIds: ["evidence-a", "evidence-a"] }),
                makeBlock({ blockId: "block-real-double", order: 1, evidenceIds: ["evidence-a", "evidence-b"] }),
              ],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "resolved",
      candidateBlockIds: ["block-real-double"],
      selectedBlockIds: ["block-real-double"],
    });
  });

  it("lets greater evidence overlap beat opposite section compatibility", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ targetSection: "skills", evidenceIds: ["evidence-a", "evidence-b"] })] }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              sectionId: "section-experience",
              kind: "experience",
              order: 0,
              blocks: [makeBlock({ blockId: "block-experience-double", evidenceIds: ["evidence-a", "evidence-b"] })],
            }),
            makeSection({
              sectionId: "section-skills",
              kind: "skills",
              order: 1,
              blocks: [makeBlock({ blockId: "block-skills-single", evidenceIds: ["evidence-a"] })],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "resolved",
      candidateBlockIds: ["block-experience-double"],
      selectedBlockIds: ["block-experience-double"],
    });
  });

  it("uses section compatibility as a secondary deterministic criterion", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ targetSection: "skills" })] }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              sectionId: "section-experience",
              kind: "experience",
              order: 0,
              blocks: [makeBlock({ blockId: "block-experience", evidenceIds: ["evidence-a"] })],
            }),
            makeSection({
              sectionId: "section-skills",
              kind: "skills",
              order: 1,
              blocks: [makeBlock({ blockId: "block-skills", evidenceIds: ["evidence-a"] })],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "resolved",
      candidateBlockIds: ["block-skills"],
      selectedBlockIds: ["block-skills"],
    });
  });

  it("resolves by evidence when no section has explicit compatibility", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ targetSection: "other" })] }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              kind: "summary",
              blocks: [makeBlock({ blockId: "block-summary", evidenceIds: ["evidence-a"] })],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "resolved",
      candidateBlockIds: ["block-summary"],
      selectedBlockIds: ["block-summary"],
    });
  });

  it("excludes lower-ranked candidates from candidateBlockIds", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ evidenceIds: ["evidence-a", "evidence-b"] })] }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-top-b", order: 0, evidenceIds: ["evidence-a", "evidence-b"] }),
                makeBlock({ blockId: "block-lower", order: 1, evidenceIds: ["evidence-a"] }),
                makeBlock({ blockId: "block-top-a", order: 2, evidenceIds: ["evidence-b", "evidence-a"] }),
              ],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "ambiguous",
      candidateBlockIds: ["block-top-a", "block-top-b"],
      selectedBlockIds: [],
    });
  });

  it("does not break a tie with order or blockId", () => {
    const result = resolveTailoringTargets(
      makeInput({
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-z", order: 0, evidenceIds: ["evidence-a"] }),
                makeBlock({ blockId: "block-a", order: 99, evidenceIds: ["evidence-a"] }),
              ],
            }),
          ],
        }),
      }),
    );

    expect(result.resolutions[0]).toMatchObject({
      status: "ambiguous",
      candidateBlockIds: ["block-a", "block-z"],
      selectedBlockIds: [],
    });
  });

  it("only emits candidateBlockIds and selectedBlockIds that exist in the resume document", () => {
    const resumeDocument = makeResumeDocument({
      sections: [
        makeSection({
          blocks: [
            makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] }),
            makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-b"] }),
          ],
        }),
      ],
    });
    const result = resolveTailoringTargets(makeInput({ resumeDocument }));
    const existingBlockIds = new Set(resumeDocument.sections.flatMap((section) => section.blocks.map((block) => block.blockId)));
    const emittedBlockIds = result.resolutions.flatMap((resolution) => [
      ...resolution.candidateBlockIds,
      ...resolution.selectedBlockIds,
    ]);

    expect(emittedBlockIds.every((blockId) => existingBlockIds.has(blockId))).toBe(true);
  });

  it("generates deterministic resolution IDs with canonical encoding", () => {
    const actionId = "action / ñ:value|x & y=z";
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ actionId })] }),
      }),
    );

    expect(result.resolutions[0].resolutionId).toBe(
      `resolution|offer=offer-1|profile=profile-1|document=resume-doc|action=${encodeURIComponent(actionId)}`,
    );
  });

  it("generates distinct resolution IDs for distinct actions", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({
          actions: [
            makeAction({ actionId: "action-a", evidenceIds: ["evidence-a"], requirementIds: ["req-a"] }),
            makeAction({ actionId: "action-b", evidenceIds: ["evidence-b"], requirementIds: ["req-b"] }),
          ],
        }),
        resumeDocument: makeResumeDocument({
          sections: [
            makeSection({
              blocks: [
                makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] }),
                makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-b"] }),
              ],
            }),
          ],
        }),
      }),
    );

    const resolutionIds = result.resolutions.map((resolution) => resolution.resolutionId);
    expect(new Set(resolutionIds).size).toBe(2);
  });

  it("returns deepEqual for semantically equivalent inputs with arrays in different order", () => {
    const actionA = makeAction({ actionId: "action-a", evidenceIds: ["evidence-a"] });
    const actionB = makeAction({ actionId: "action-b", evidenceIds: ["evidence-b"], requirementIds: ["req-b"] });
    const first = makeInput({
      tailoringPlan: makePlan({ actions: [actionB, actionA] }),
      resumeDocument: makeResumeDocument({
        sections: [
          makeSection({
            sectionId: "section-b",
            order: 1,
            blocks: [makeBlock({ blockId: "block-b", evidenceIds: ["evidence-b"] })],
          }),
          makeSection({
            sectionId: "section-a",
            order: 0,
            blocks: [makeBlock({ blockId: "block-a", evidenceIds: ["evidence-a"] })],
          }),
        ],
      }),
    });
    const second = makeInput({
      tailoringPlan: makePlan({ actions: [actionA, actionB] }),
      resumeDocument: makeResumeDocument({
        sections: [
          makeSection({
            sectionId: "section-a",
            order: 0,
            blocks: [makeBlock({ blockId: "block-a", evidenceIds: ["evidence-a"] })],
          }),
          makeSection({
            sectionId: "section-b",
            order: 1,
            blocks: [makeBlock({ blockId: "block-b", evidenceIds: ["evidence-b"] })],
          }),
        ],
      }),
    });

    expect(resolveTailoringTargets(first)).toEqual(resolveTailoringTargets(second));
  });

  it("does not mutate TailoringPlan", () => {
    const input = makeInput({
      tailoringPlan: makePlan({
        actions: [makeAction({ evidenceIds: ["evidence-b", "evidence-a", "evidence-b"] })],
      }),
    });
    const before = JSON.stringify(input.tailoringPlan);

    resolveTailoringTargets(input);

    expect(JSON.stringify(input.tailoringPlan)).toBe(before);
    expect(input.tailoringPlan.actions[0].evidenceIds).toEqual(["evidence-b", "evidence-a", "evidence-b"]);
    expect(Object.isFrozen(input.tailoringPlan)).toBe(false);
  });

  it("does not mutate ResumeDocument", () => {
    const input = makeInput({
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["evidence-b", "evidence-a"] })] })],
      }),
    });
    const before = JSON.stringify(input.resumeDocument);

    resolveTailoringTargets(input);

    expect(JSON.stringify(input.resumeDocument)).toBe(before);
    expect(input.resumeDocument.sections[0].blocks[0].evidenceIds).toEqual(["evidence-b", "evidence-a"]);
  });

  it("accepts a deeply frozen ResumeDocument input", () => {
    const resumeDocument = deepFreeze(makeResumeDocument());
    const result = resolveTailoringTargets(makeInput({ resumeDocument }));

    expect(result.resolutions[0].status).toBe("resolved");
    expect(Object.isFrozen(resumeDocument)).toBe(true);
  });

  it("throws a stable error for duplicate actionId", () => {
    expect(() =>
      resolveTailoringTargets(
        makeInput({
          tailoringPlan: makePlan({
            actions: [
              makeAction({ actionId: "action-a" }),
              makeAction({ actionId: "action-a", requirementIds: ["req-b"] }),
            ],
          }),
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.DuplicateActionId);
  });

  it("throws a stable error for duplicate blockId when the input is not schema-validated", () => {
    const resumeDocument = makeResumeDocument({
      sections: [
        makeSection({
          sectionId: "section-a",
          order: 0,
          blocks: [makeBlock({ blockId: "block-a" })],
        }),
        makeSection({
          sectionId: "section-b",
          order: 1,
          blocks: [makeBlock({ blockId: "block-a" })],
        }),
      ],
    });

    expect(() => resolveTailoringTargets(makeInput({ resumeDocument }))).toThrow(
      TailoringTargetingInputErrorCode.DuplicateBlockId,
    );
  });

  it("returns a valid result for input without actions", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({ actions: [] }),
      }),
    );

    expect(result).toMatchObject({
      offerId: "offer-1",
      profileId: "profile-1",
      documentId: "resume-doc",
      resolutions: [],
      summary: {
        totalActions: 0,
        resolvedCount: 0,
        ambiguousCount: 0,
        unresolvedCount: 0,
      },
    });
    expect(TailoringTargetingResultSchema.parse(result)).toEqual(result);
  });

  it("does not create resolutions for gaps or reviewItems", () => {
    const result = resolveTailoringTargets(
      makeInput({
        tailoringPlan: makePlan({
          actions: [],
          gaps: [
            {
              gapId: "gap-a",
              requirementId: "req-gap",
              reason: "Missing evidence.",
              priority: "high",
              supportStatus: "unsupported",
              missingInformation: ["No evidence."],
            },
          ],
          reviewItems: [
            {
              reviewItemId: "review-a",
              requirementId: "req-review",
              reason: "Needs confirmation.",
              priority: "medium",
              supportStatus: "needs_confirmation",
              requestedInformation: ["Confirm this requirement."],
            },
          ],
        }),
      }),
    );

    expect(result.resolutions).toEqual([]);
    expect(result.summary.totalActions).toBe(0);
  });

  it("does not include timestamps or depend on Date.now", () => {
    const dateNowSpy = vi.spyOn(Date, "now");

    const result = resolveTailoringTargets(makeInput());
    const serialized = JSON.stringify(result);

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain("generatedAt");
    expect(serialized).not.toContain("2026-");

    dateNowSpy.mockRestore();
  });

  it("does not include rewritten CV text fields", () => {
    const result = resolveTailoringTargets(makeInput());
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("beforeText");
    expect(serialized).not.toContain("afterText");
    expect(serialized).not.toContain("rewrittenText");
    expect(serialized).not.toContain("suggestedText");
    expect(serialized).not.toContain("Original CV text.");
  });

  it("throws a stable error when an action carries an empty evidenceId in unvalidated input", () => {
    expect(() =>
      resolveTailoringTargets(
        makeInput({
          tailoringPlan: makePlan({
            actions: [makeAction({ evidenceIds: [""] })],
          }),
        }),
      ),
    ).toThrow(TailoringTargetingInputErrorCode.EmptyActionEvidenceId);
  });

  it("returns a deeply frozen targeting result", () => {
    const result = resolveTailoringTargets(makeInput());
    const before = JSON.stringify(result);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.resolutions)).toBe(true);
    expect(Object.isFrozen(result.resolutions[0])).toBe(true);
    expect(Object.isFrozen(result.resolutions[0].requirementIds)).toBe(true);
    expect(Object.isFrozen(result.resolutions[0].evidenceIds)).toBe(true);
    expect(Object.isFrozen(result.resolutions[0].candidateBlockIds)).toBe(true);
    expect(Object.isFrozen(result.resolutions[0].selectedBlockIds)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);

    expect(() => {
      result.resolutions.push(makeResolution() as (typeof result.resolutions)[number]);
    }).toThrow();
    expect(() => {
      result.resolutions[0].requirementIds.push("req-b");
    }).toThrow();
    expect(() => {
      result.resolutions[0].evidenceIds.push("evidence-b");
    }).toThrow();
    expect(() => {
      result.resolutions[0].candidateBlockIds.push("block-b");
    }).toThrow();
    expect(() => {
      result.resolutions[0].selectedBlockIds.push("block-b");
    }).toThrow();
    expect(() => {
      Object.assign(result.summary, { resolvedCount: 99 });
    }).toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });
});
