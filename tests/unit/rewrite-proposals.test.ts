import { describe, expect, it, vi } from "vitest";
import {
  RewriteProposalInputErrorCode,
  buildRewriteProposals,
  type BuildRewriteProposalsInput,
} from "../../src/core/tailoring";
import {
  CANONICAL_REWRITE_CONSTRAINTS,
  RewriteProposalResultSchema,
  RewriteProposalSchema,
  RewriteProposalSummarySchema,
  RewriteSkippedItemSchema,
  type ResumeBlock,
  type ResumeDocument,
  type ResumeSection,
  type TailoringAction,
  type TailoringPlan,
  type TailoringTargetResolution,
  type TailoringTargetingResult,
} from "../../src/schemas";

const originalText = "  Built  AI\tpipelines\nSIN cambiar caf\u00e9, r\u00e9sum\u00e9, \u00d1and\u00fa, punctuation?!  ";

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

const makeResolution = (overrides: Partial<TailoringTargetResolution> = {}): TailoringTargetResolution => ({
  resolutionId: overrides.resolutionId ?? "resolution-a",
  actionId: overrides.actionId ?? "action-a",
  status: overrides.status ?? "resolved",
  targetSection: overrides.targetSection ?? "experience",
  requirementIds: overrides.requirementIds ?? ["req-a"],
  evidenceIds: overrides.evidenceIds ?? ["evidence-a"],
  candidateBlockIds: overrides.candidateBlockIds ?? ["block-a"],
  selectedBlockIds: overrides.selectedBlockIds ?? ["block-a"],
  reason: overrides.reason ?? "Resolved by shared evidence.",
});

const makeTargetingResult = (overrides: Partial<TailoringTargetingResult> = {}): TailoringTargetingResult => {
  const resolutions = overrides.resolutions ?? [makeResolution()];
  return {
    offerId: overrides.offerId ?? "offer-1",
    profileId: overrides.profileId ?? "profile-1",
    documentId: overrides.documentId ?? "resume-doc",
    resolutions,
    summary: overrides.summary ?? {
      totalActions: resolutions.length,
      resolvedCount: resolutions.filter((resolution) => resolution.status === "resolved").length,
      ambiguousCount: resolutions.filter((resolution) => resolution.status === "ambiguous").length,
      unresolvedCount: resolutions.filter((resolution) => resolution.status === "unresolved").length,
    },
  };
};

const makeBlock = (overrides: Partial<ResumeBlock> = {}): ResumeBlock => ({
  blockId: overrides.blockId ?? "block-a",
  kind: overrides.kind ?? "bullet",
  order: overrides.order ?? 0,
  originalText: overrides.originalText ?? originalText,
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

const makeInput = (overrides: Partial<BuildRewriteProposalsInput> = {}): BuildRewriteProposalsInput => ({
  tailoringPlan: overrides.tailoringPlan ?? makePlan(),
  targetingResult: overrides.targetingResult ?? makeTargetingResult(),
  resumeDocument: overrides.resumeDocument ?? makeResumeDocument(),
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

describe("Rewrite proposal builder", () => {
  it("validates a correct RewriteProposalResultSchema output", () => {
    const result = buildRewriteProposals(makeInput());

    expect(RewriteProposalResultSchema.parse(result)).toEqual(result);
    expect(result.summary).toEqual({
      totalResolutions: 1,
      readyProposals: 1,
      ambiguousTargets: 0,
      unresolvedTargets: 0,
      noRewriteRequired: 0,
    });
  });

  it("rejects unknown fields in all rewrite schemas", () => {
    const result = buildRewriteProposals(makeInput());

    expect(RewriteProposalResultSchema.safeParse({ ...result, extra: true }).success).toBe(false);
    expect(RewriteProposalSchema.safeParse({ ...result.proposals[0], extra: true }).success).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        skippedItemId: "skip-a",
        actionId: "action-a",
        resolutionId: "resolution-a",
        reason: "unresolved_target",
        candidateBlockIds: [],
        extra: true,
      }).success,
    ).toBe(false);
    expect(RewriteProposalSummarySchema.safeParse({ ...result.summary, extra: true }).success).toBe(false);
  });

  it("rejects generated, rewritten, warning, and confidence fields", () => {
    const result = buildRewriteProposals(makeInput());

    const forbiddenFields: Record<string, unknown> = {
      generatedAt: "2026-07-29T00:00:00.000Z",
      beforeText: "before",
      afterText: "after",
      rewrittenText: "rewrite",
      suggestedText: "suggestion",
      finalText: "final",
      warnings: ["warning"],
      confidence: 0.9,
    };

    for (const [field, value] of Object.entries(forbiddenFields)) {
      expect(RewriteProposalSchema.safeParse({ ...result.proposals[0], [field]: value }).success).toBe(false);
    }
  });

  it("allows only highlight_evidence as a RewriteProposal actionType", () => {
    const proposal = buildRewriteProposals(makeInput()).proposals[0];

    expect(RewriteProposalSchema.safeParse({ ...proposal, actionType: "highlight_evidence" }).success).toBe(true);
    expect(RewriteProposalSchema.safeParse({ ...proposal, actionType: "prioritize_section" }).success).toBe(false);
    expect(RewriteProposalSchema.safeParse({ ...proposal, actionType: "retain_content" }).success).toBe(false);
    expect(RewriteProposalSchema.safeParse({ ...proposal, actionType: "unknown_action" }).success).toBe(false);
  });

  it("requires the exact canonical rewrite constraints in order", () => {
    const proposal = buildRewriteProposals(makeInput()).proposals[0];

    expect(Object.isFrozen(CANONICAL_REWRITE_CONSTRAINTS)).toBe(true);
    expect(proposal.constraints).toEqual([...CANONICAL_REWRITE_CONSTRAINTS]);
    expect(RewriteProposalSchema.safeParse({ ...proposal, constraints: [...CANONICAL_REWRITE_CONSTRAINTS] }).success).toBe(true);
    expect(
      RewriteProposalSchema.safeParse({ ...proposal, constraints: CANONICAL_REWRITE_CONSTRAINTS.slice(0, -1) }).success,
    ).toBe(false);
    expect(
      RewriteProposalSchema.safeParse({
        ...proposal,
        constraints: [...CANONICAL_REWRITE_CONSTRAINTS, "preserve_dates"],
      }).success,
    ).toBe(false);
    expect(
      RewriteProposalSchema.safeParse({ ...proposal, constraints: [...CANONICAL_REWRITE_CONSTRAINTS].reverse() }).success,
    ).toBe(false);
    expect(RewriteProposalSchema.safeParse({ ...proposal, constraints: [] }).success).toBe(false);
    expect(
      RewriteProposalSchema.safeParse({ ...proposal, constraints: ["preserve_factual_meaning"] }).success,
    ).toBe(false);
  });

  it("rejects invalid skipped item shapes directly", () => {
    const baseSkippedItem = {
      skippedItemId: "skip-a",
      actionId: "action-a",
      resolutionId: "resolution-a",
    };

    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "ambiguous_target",
        candidateBlockIds: ["block-a"],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "ambiguous_target",
        candidateBlockIds: ["block-a", "block-b"],
        selectedBlockIds: ["block-a"],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "ambiguous_target",
        candidateBlockIds: ["block-a", "block-b"],
        originalText: "must not be a proposal",
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "unresolved_target",
        candidateBlockIds: ["block-a"],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "no_rewrite_required",
        candidateBlockIds: [],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "no_rewrite_required",
        candidateBlockIds: ["block-a", "block-b"],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "structural_change_required",
        candidateBlockIds: [],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "structural_change_required",
        candidateBlockIds: ["block-a", "block-b"],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "ambiguous_target",
        candidateBlockIds: ["block-a", "block-a"],
      }).success,
    ).toBe(false);
    expect(
      RewriteSkippedItemSchema.safeParse({
        ...baseSkippedItem,
        reason: "unresolved_target",
        candidateBlockIds: [],
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("builds a proposal for a resolved highlight_evidence action", () => {
    const result = buildRewriteProposals(makeInput());

    expect(result.proposals).toHaveLength(1);
    expect(result.skippedItems).toHaveLength(0);
    expect(result.proposals[0]).toMatchObject({
      actionId: "action-a",
      resolutionId: "resolution-a",
      sectionId: "section-a",
      blockId: "block-a",
      actionType: "highlight_evidence",
      targetSection: "experience",
      rewriteGoal: "emphasize_supported_evidence",
    });
  });

  it("skips a resolved retain_content action as no_rewrite_required", () => {
    const action = makeAction({ type: "retain_content" });
    const result = buildRewriteProposals(makeInput({ tailoringPlan: makePlan({ actions: [action] }) }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems[0]).toMatchObject({
      reason: "no_rewrite_required",
      candidateBlockIds: ["block-a"],
    });
  });

  it("skips a resolved prioritize_section action as structural_change_required", () => {
    const action = makeAction({ type: "prioritize_section" });
    const result = buildRewriteProposals(makeInput({ tailoringPlan: makePlan({ actions: [action] }) }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems[0]).toMatchObject({
      reason: "structural_change_required",
      candidateBlockIds: ["block-a"],
    });
  });

  it("skips an ambiguous resolution", () => {
    const resolution = makeResolution({
      status: "ambiguous",
      candidateBlockIds: ["block-a", "block-b"],
      selectedBlockIds: [],
    });
    const result = buildRewriteProposals(makeInput({ targetingResult: makeTargetingResult({ resolutions: [resolution] }) }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems[0]).toMatchObject({
      reason: "ambiguous_target",
      candidateBlockIds: ["block-a", "block-b"],
    });
  });

  it("skips an unresolved resolution", () => {
    const resolution = makeResolution({
      status: "unresolved",
      candidateBlockIds: [],
      selectedBlockIds: [],
    });
    const result = buildRewriteProposals(makeInput({ targetingResult: makeTargetingResult({ resolutions: [resolution] }) }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems[0]).toMatchObject({
      reason: "unresolved_target",
      candidateBlockIds: [],
    });
  });

  it("does not create proposals for ambiguous or unresolved resolutions", () => {
    const resolutions = [
      makeResolution({ actionId: "action-a", resolutionId: "resolution-a", status: "unresolved", candidateBlockIds: [], selectedBlockIds: [] }),
      makeResolution({ actionId: "action-b", resolutionId: "resolution-b", status: "ambiguous", requirementIds: ["req-b"], candidateBlockIds: ["block-a", "block-b"], selectedBlockIds: [] }),
    ];
    const actions = [
      makeAction({ actionId: "action-a", requirementIds: ["req-a"] }),
      makeAction({ actionId: "action-b", requirementIds: ["req-b"] }),
    ];
    const result = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions }),
      targetingResult: makeTargetingResult({ resolutions }),
    }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems.map((item) => item.reason).sort()).toEqual(["ambiguous_target", "unresolved_target"]);
  });

  it("prioritizes ambiguous and unresolved status over non-rewrite action types", () => {
    const prioritizeAction = makeAction({ type: "prioritize_section" });
    const ambiguousResolution = makeResolution({
      status: "ambiguous",
      candidateBlockIds: ["block-a", "block-b"],
      selectedBlockIds: [],
    });
    const ambiguousResult = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [prioritizeAction] }),
      targetingResult: makeTargetingResult({ resolutions: [ambiguousResolution] }),
    }));

    const retainAction = makeAction({ type: "retain_content" });
    const unresolvedResolution = makeResolution({
      status: "unresolved",
      candidateBlockIds: [],
      selectedBlockIds: [],
    });
    const unresolvedResult = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [retainAction] }),
      targetingResult: makeTargetingResult({ resolutions: [unresolvedResolution] }),
    }));

    expect(ambiguousResult.proposals).toEqual([]);
    expect(ambiguousResult.skippedItems[0].reason).toBe("ambiguous_target");
    expect(unresolvedResult.proposals).toEqual([]);
    expect(unresolvedResult.skippedItems[0].reason).toBe("unresolved_target");
  });

  it("does not use gaps or reviewItems to create proposals", () => {
    const result = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({
        actions: [],
        gaps: [{
          gapId: "gap-a",
          requirementId: "req-gap",
          reason: "Missing evidence.",
          priority: "high",
          supportStatus: "unsupported",
          missingInformation: ["No evidence."],
        }],
        reviewItems: [{
          reviewItemId: "review-a",
          requirementId: "req-review",
          reason: "Needs confirmation.",
          priority: "medium",
          supportStatus: "needs_confirmation",
          requestedInformation: ["Confirm."],
        }],
      }),
      targetingResult: makeTargetingResult({ resolutions: [] }),
    }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems).toEqual([]);
    expect(result.summary.totalResolutions).toBe(0);
  });

  it("throws stable errors for profile, offer, and document mismatches", () => {
    expect(() => buildRewriteProposals(makeInput({ resumeDocument: makeResumeDocument({ profileId: "other-profile" }) }))).toThrow(
      RewriteProposalInputErrorCode.ProfileIdMismatch,
    );
    expect(() => buildRewriteProposals(makeInput({ targetingResult: makeTargetingResult({ offerId: "offer-2" }) }))).toThrow(
      RewriteProposalInputErrorCode.OfferIdMismatch,
    );
    expect(() => buildRewriteProposals(makeInput({ targetingResult: makeTargetingResult({ documentId: "other-doc" }) }))).toThrow(
      RewriteProposalInputErrorCode.DocumentIdMismatch,
    );
  });

  it("throws stable errors for invalid runtime inputs", () => {
    expect(() => buildRewriteProposals(makeInput({ tailoringPlan: { ...makePlan(), offerId: "" } as TailoringPlan }))).toThrow(
      RewriteProposalInputErrorCode.InvalidTailoringPlan,
    );
    expect(() => buildRewriteProposals(makeInput({ targetingResult: { ...makeTargetingResult(), offerId: "" } as TailoringTargetingResult }))).toThrow(
      RewriteProposalInputErrorCode.InvalidTargetingResult,
    );
    expect(() => buildRewriteProposals(makeInput({ resumeDocument: { ...makeResumeDocument(), documentId: "" } as ResumeDocument }))).toThrow(
      RewriteProposalInputErrorCode.InvalidResumeDocument,
    );
  });

  it("throws stable errors for duplicate actionId and duplicate resolutionId", () => {
    expect(() =>
      buildRewriteProposals(makeInput({
        tailoringPlan: makePlan({ actions: [makeAction({ actionId: "action-a" }), makeAction({ actionId: "action-a", requirementIds: ["req-b"] })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.DuplicateActionId);

    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({ resolutions: [makeResolution({ resolutionId: "resolution-a" }), makeResolution({ resolutionId: "resolution-a", actionId: "action-b" })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.DuplicateResolutionId);
  });

  it("throws when a resolution references no action or an action has no resolution", () => {
    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({ resolutions: [makeResolution({ actionId: "missing-action" })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.ActionNotFound);

    expect(() =>
      buildRewriteProposals(makeInput({
        tailoringPlan: makePlan({ actions: [makeAction(), makeAction({ actionId: "action-b", requirementIds: ["req-b"] })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.ResolutionNotFound);
  });

  it("throws when one action has more than one resolution", () => {
    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({
          resolutions: [
            makeResolution({ resolutionId: "resolution-a", actionId: "action-a" }),
            makeResolution({ resolutionId: "resolution-b", actionId: "action-a" }),
          ],
        }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.ActionResolutionMismatch);
  });

  it("throws for action and resolution mismatches", () => {
    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({ resolutions: [makeResolution({ targetSection: "skills" })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.ActionResolutionMismatch);

    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({ resolutions: [makeResolution({ requirementIds: ["req-b"] })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.RequirementSetMismatch);

    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({ resolutions: [makeResolution({ evidenceIds: ["evidence-b"] })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.EvidenceSetMismatch);
  });

  it("throws when the selected block does not exist", () => {
    expect(() =>
      buildRewriteProposals(makeInput({
        targetingResult: makeTargetingResult({ resolutions: [makeResolution({ candidateBlockIds: ["missing-block"], selectedBlockIds: ["missing-block"] })] }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.BlockNotFound);
  });

  it("throws when a resolved proposal has no shared evidence with the selected block", () => {
    expect(() =>
      buildRewriteProposals(makeInput({
        resumeDocument: makeResumeDocument({
          sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["evidence-b"] })] })],
        }),
      })),
    ).toThrow(RewriteProposalInputErrorCode.NoSharedEvidence);
  });

  it("includes only evidenceIds present in action, resolution, and selected block", () => {
    const action = makeAction({ evidenceIds: ["evidence-a", "evidence-b"] });
    const resolution = makeResolution({ evidenceIds: ["evidence-a", "evidence-b"] });
    const result = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [action] }),
      targetingResult: makeTargetingResult({ resolutions: [resolution] }),
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["evidence-a", "evidence-c"] })] })],
      }),
    }));

    expect(result.proposals[0].evidenceIds).toEqual(["evidence-a"]);
  });

  it("canonicalizes duplicate evidenceIds without changing the result", () => {
    const first = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [makeAction({ evidenceIds: ["evidence-b", "evidence-a", "evidence-a"] })] }),
      targetingResult: makeTargetingResult({ resolutions: [makeResolution({ evidenceIds: ["evidence-a", "evidence-b"] })] }),
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["evidence-b", "evidence-a", "evidence-b"] })] })],
      }),
    }));
    const second = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [makeAction({ evidenceIds: ["evidence-a", "evidence-b"] })] }),
      targetingResult: makeTargetingResult({ resolutions: [makeResolution({ evidenceIds: ["evidence-a", "evidence-b"] })] }),
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ evidenceIds: ["evidence-a", "evidence-b"] })] })],
      }),
    }));

    expect(first).toEqual(second);
    expect(first.proposals[0].evidenceIds).toEqual(["evidence-a", "evidence-b"]);
  });

  it("preserves originalText exactly with spaces, tabs, newlines, Unicode, accents, case, and punctuation", () => {
    const exactText = "  Senior\tAI\nEngineer -- caf\u00e9 r\u00e9sum\u00e9 \u00d1and\u00fa!  ";
    const result = buildRewriteProposals(makeInput({
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ originalText: exactText })] })],
      }),
    }));

    expect(result.proposals[0].originalText).toBe(exactText);
  });

  it("generates deterministic proposalId and skippedItemId", () => {
    const proposalResult = buildRewriteProposals(makeInput());
    const skippedResult = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [makeAction({ type: "retain_content" })] }),
    }));

    expect(proposalResult.proposals[0].proposalId).toBe(
      "proposal|offer=offer-1|profile=profile-1|document=resume-doc|action=action-a|resolution=resolution-a|block=block-a",
    );
    expect(skippedResult.skippedItems[0].skippedItemId).toBe(
      "skip|offer=offer-1|profile=profile-1|document=resume-doc|action=action-a|resolution=resolution-a|reason=no_rewrite_required",
    );
  });

  it("encodes special IDs and keeps proposal IDs unique", () => {
    const actionA = "action / \u00f1:value|x & y=z";
    const actionB = "action / \u00f1:value|x & y=other";
    const resolutionA = "resolution / \u00f1:value|x & y=z";
    const resolutionB = "resolution / \u00f1:value|x & y=other";
    const actions = [
      makeAction({ actionId: actionA, requirementIds: ["req-a"], evidenceIds: ["evidence-a"] }),
      makeAction({ actionId: actionB, requirementIds: ["req-b"], evidenceIds: ["evidence-b"] }),
    ];
    const resolutions = [
      makeResolution({ actionId: actionA, resolutionId: resolutionA, requirementIds: ["req-a"], evidenceIds: ["evidence-a"], candidateBlockIds: ["block-a"], selectedBlockIds: ["block-a"] }),
      makeResolution({ actionId: actionB, resolutionId: resolutionB, requirementIds: ["req-b"], evidenceIds: ["evidence-b"], candidateBlockIds: ["block-b"], selectedBlockIds: ["block-b"] }),
    ];
    const result = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions }),
      targetingResult: makeTargetingResult({ resolutions }),
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] }), makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-b"] })] })],
      }),
    }));

    expect(result.proposals.some((proposal) => proposal.proposalId.includes(encodeURIComponent(actionA)))).toBe(true);
    expect(result.proposals.some((proposal) => proposal.proposalId.includes(encodeURIComponent(resolutionA)))).toBe(true);
    expect(new Set(result.proposals.map((proposal) => proposal.proposalId)).size).toBe(2);
  });

  it("encodes special IDs and keeps skipped item IDs unique", () => {
    const actionA = "skip action / \u00f1:value|x & y=z";
    const actionB = "skip action / \u00f1:value|x & y=other";
    const resolutionA = "skip resolution / \u00f1:value|x & y=z";
    const resolutionB = "skip resolution / \u00f1:value|x & y=other";
    const actions = [
      makeAction({ actionId: actionA, type: "retain_content", requirementIds: ["req-a"], evidenceIds: ["evidence-a"] }),
      makeAction({ actionId: actionB, type: "retain_content", requirementIds: ["req-b"], evidenceIds: ["evidence-b"] }),
    ];
    const resolutions = [
      makeResolution({ actionId: actionA, resolutionId: resolutionA, requirementIds: ["req-a"], evidenceIds: ["evidence-a"], candidateBlockIds: ["block-a"], selectedBlockIds: ["block-a"] }),
      makeResolution({ actionId: actionB, resolutionId: resolutionB, requirementIds: ["req-b"], evidenceIds: ["evidence-b"], candidateBlockIds: ["block-b"], selectedBlockIds: ["block-b"] }),
    ];
    const result = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions }),
      targetingResult: makeTargetingResult({ resolutions }),
      resumeDocument: makeResumeDocument({
        sections: [makeSection({ blocks: [makeBlock({ blockId: "block-a", order: 0, evidenceIds: ["evidence-a"] }), makeBlock({ blockId: "block-b", order: 1, evidenceIds: ["evidence-b"] })] })],
      }),
    }));

    expect(result.proposals).toEqual([]);
    expect(result.skippedItems.some((item) => item.skippedItemId.includes(encodeURIComponent(actionA)))).toBe(true);
    expect(result.skippedItems.some((item) => item.skippedItemId.includes(encodeURIComponent(resolutionA)))).toBe(true);
    expect(new Set(result.skippedItems.map((item) => item.skippedItemId)).size).toBe(2);
  });

  it("returns deepEqual for semantically equivalent inputs in different orders", () => {
    const actionA = makeAction({ actionId: "action-a", requirementIds: ["req-a"], evidenceIds: ["evidence-b", "evidence-a"] });
    const actionB = makeAction({ actionId: "action-b", requirementIds: ["req-b"], evidenceIds: ["evidence-c"] });
    const resolutionA = makeResolution({ actionId: "action-a", resolutionId: "resolution-a", requirementIds: ["req-a"], evidenceIds: ["evidence-a", "evidence-b"], candidateBlockIds: ["block-a"], selectedBlockIds: ["block-a"] });
    const resolutionB = makeResolution({ actionId: "action-b", resolutionId: "resolution-b", requirementIds: ["req-b"], evidenceIds: ["evidence-c"], candidateBlockIds: ["block-b"], selectedBlockIds: ["block-b"] });
    const first = makeInput({
      tailoringPlan: makePlan({ actions: [actionB, actionA] }),
      targetingResult: makeTargetingResult({ resolutions: [resolutionB, resolutionA] }),
      resumeDocument: makeResumeDocument({
        sections: [
          makeSection({ sectionId: "section-b", order: 1, blocks: [makeBlock({ blockId: "block-b", evidenceIds: ["evidence-c"] })] }),
          makeSection({ sectionId: "section-a", order: 0, blocks: [makeBlock({ blockId: "block-a", evidenceIds: ["evidence-b", "evidence-a"] })] }),
        ],
      }),
    });
    const second = makeInput({
      tailoringPlan: makePlan({ actions: [actionA, actionB] }),
      targetingResult: makeTargetingResult({ resolutions: [resolutionA, resolutionB] }),
      resumeDocument: makeResumeDocument({
        sections: [
          makeSection({ sectionId: "section-a", order: 0, blocks: [makeBlock({ blockId: "block-a", evidenceIds: ["evidence-a", "evidence-b"] })] }),
          makeSection({ sectionId: "section-b", order: 1, blocks: [makeBlock({ blockId: "block-b", evidenceIds: ["evidence-c"] })] }),
        ],
      }),
    });

    expect(buildRewriteProposals(first)).toEqual(buildRewriteProposals(second));
  });

  it("does not mutate TailoringPlan, TargetingResult, or ResumeDocument", () => {
    const input = makeInput();
    const before = JSON.stringify(input);

    buildRewriteProposals(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input.tailoringPlan)).toBe(false);
    expect(Object.isFrozen(input.targetingResult)).toBe(false);
    expect(Object.isFrozen(input.resumeDocument)).toBe(false);
  });

  it("accepts a deeply frozen ResumeDocument input", () => {
    const resumeDocument = deepFreeze(makeResumeDocument());
    const result = buildRewriteProposals(makeInput({ resumeDocument }));

    expect(result.proposals).toHaveLength(1);
    expect(Object.isFrozen(resumeDocument)).toBe(true);
  });

  it("returns a deeply frozen output and mutation attempts do not change it", () => {
    const result = buildRewriteProposals(makeInput());
    const before = JSON.stringify(result);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.proposals)).toBe(true);
    expect(Object.isFrozen(result.proposals[0])).toBe(true);
    expect(Object.isFrozen(result.proposals[0].requirementIds)).toBe(true);
    expect(Object.isFrozen(result.proposals[0].evidenceIds)).toBe(true);
    expect(Object.isFrozen(result.proposals[0].constraints)).toBe(true);
    expect(Object.isFrozen(result.skippedItems)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);

    expect(() => result.proposals.push(result.proposals[0])).toThrow();
    expect(() => result.proposals[0].requirementIds.push("req-b")).toThrow();
    expect(() => result.proposals[0].evidenceIds.push("evidence-b")).toThrow();
    expect(() => result.proposals[0].constraints.push("do_not_add_claims")).toThrow();
    expect(() => Object.assign(result.summary, { readyProposals: 99 })).toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });

  it("builds a coherent summary and rejects inconsistent summaries", () => {
    const result = buildRewriteProposals(makeInput());
    expect(result.summary.totalResolutions).toBe(result.proposals.length + result.skippedItems.length);
    expect(result.summary.readyProposals).toBe(result.proposals.length);

    expect(
      RewriteProposalResultSchema.safeParse({
        ...result,
        summary: { ...result.summary, totalResolutions: 99 },
      }).success,
    ).toBe(false);
  });

  it("returns a valid empty result for input without actions or resolutions", () => {
    const result = buildRewriteProposals(makeInput({
      tailoringPlan: makePlan({ actions: [] }),
      targetingResult: makeTargetingResult({ resolutions: [] }),
    }));

    expect(result).toEqual({
      offerId: "offer-1",
      profileId: "profile-1",
      documentId: "resume-doc",
      proposals: [],
      skippedItems: [],
      summary: {
        totalResolutions: 0,
        readyProposals: 0,
        ambiguousTargets: 0,
        unresolvedTargets: 0,
        noRewriteRequired: 0,
      },
    });
    expect(RewriteProposalResultSchema.parse(result)).toEqual(result);
  });

  it("does not include timestamps, random values, or generated CV text fields", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");

    const result = buildRewriteProposals(makeInput());
    const serialized = JSON.stringify(result);

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain("generatedAt");
    expect(serialized).not.toContain("beforeText");
    expect(serialized).not.toContain("afterText");
    expect(serialized).not.toContain("rewrittenText");
    expect(serialized).not.toContain("suggestedText");
    expect(serialized).not.toContain("finalText");

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
  });
});
