import { describe, expect, it, vi } from "vitest";
import {
  buildRewriteReviewDecisions,
  RewriteReviewDecisionInputErrorCode,
  type BuildRewriteReviewDecisionsInput,
} from "../../src/core/tailoring";
import {
  ApprovedRewriteSelectionSchema,
  RewriteReviewerDecisionResultSchema,
  RewriteReviewerDecisionSubmissionSchema,
  RewriteReviewDecisionBatchSchema,
  RewriteReviewDecisionSummarySchema,
  type RewriteCandidateFinding,
  type RewriteCandidateFindingCode,
  type RewriteCandidateValidationBatch,
  type RewriteCandidateValidationResult,
  type RewriteCandidateValidationStatus,
  type RewriteReviewerDecisionSubmission,
} from "../../src/schemas";

const reviewFindingCodes: RewriteCandidateFindingCode[] = [
  "candidate_added_unverified_proper_noun",
  "candidate_removed_original_proper_noun",
  "candidate_unchanged",
];

const errorFindingCodes: RewriteCandidateFindingCode[] = [
  "candidate_added_unsupported_date",
  "candidate_added_unsupported_metric",
  "candidate_contains_markdown",
  "candidate_removed_original_date",
  "candidate_removed_original_metric",
];

const finding = (code: RewriteCandidateFindingCode): RewriteCandidateFinding => ({
  findingId: `finding-${code}`,
  code,
  severity: errorFindingCodes.includes(code) ? "error" : "review",
  values: code === "candidate_unchanged" ? [] : [code],
});

const defaultFindingsForStatus = (status: RewriteCandidateValidationStatus): RewriteCandidateFinding[] => {
  if (status === "accepted") {
    return [];
  }
  if (status === "human_review") {
    return [finding("candidate_unchanged")];
  }
  return [finding("candidate_contains_markdown"), finding("candidate_unchanged")];
};

const makeValidationResult = (
  suffix: string,
  overrides: Partial<RewriteCandidateValidationResult> = {},
): RewriteCandidateValidationResult => {
  const status = overrides.status ?? "accepted";
  const findings = overrides.findings ?? defaultFindingsForStatus(status);
  return {
    validationId: overrides.validationId ?? `validation-${suffix}`,
    candidateId: overrides.candidateId ?? `candidate-${suffix}`,
    requestId: overrides.requestId ?? `request-${suffix}`,
    proposalId: overrides.proposalId ?? `proposal-${suffix}`,
    actionId: overrides.actionId ?? `action-${suffix}`,
    resolutionId: overrides.resolutionId ?? `resolution-${suffix}`,
    blockId: overrides.blockId ?? `block-${suffix}`,
    originalText: overrides.originalText ?? `original text ${suffix}`,
    candidateText: overrides.candidateText ?? `candidate text ${suffix}`,
    status,
    findings,
  };
};

const makeValidationBatch = (
  results: RewriteCandidateValidationResult[] = [makeValidationResult("a")],
  overrides: Partial<RewriteCandidateValidationBatch> = {},
): RewriteCandidateValidationBatch => {
  const sortedResults = [...results].sort((left, right) =>
    left.validationId < right.validationId ? -1 : left.validationId > right.validationId ? 1 : 0,
  );
  return {
    offerId: overrides.offerId ?? "offer-1",
    profileId: overrides.profileId ?? "profile-1",
    documentId: overrides.documentId ?? "resume-doc",
    validationScope: "deterministic_surface_checks_only",
    results: sortedResults,
    summary: overrides.summary ?? {
      totalRequests: sortedResults.length,
      totalCandidates: sortedResults.length,
      accepted: sortedResults.filter((result) => result.status === "accepted").length,
      rejected: sortedResults.filter((result) => result.status === "rejected").length,
      humanReview: sortedResults.filter((result) => result.status === "human_review").length,
      totalFindings: sortedResults.reduce((total, result) => total + result.findings.length, 0),
    },
  };
};

const makeDecision = (
  validationId = "validation-a",
  overrides: Partial<RewriteReviewerDecisionSubmission> = {},
): RewriteReviewerDecisionSubmission => ({
  validationId: overrides.validationId ?? validationId,
  decision: overrides.decision ?? "approved",
  rationale: overrides.rationale ?? "explicit reviewer rationale",
});

const makeInput = (overrides: Partial<BuildRewriteReviewDecisionsInput> = {}): BuildRewriteReviewDecisionsInput => ({
  validationBatch: overrides.validationBatch ?? makeValidationBatch(),
  decisions: overrides.decisions ?? [makeDecision()],
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

describe("Rewrite review decisions", () => {
  it("builds a valid batch with an approved decision over accepted source status", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.parse(result)).toEqual(result);
    expect(result.reviewScope).toBe("explicit_reviewer_decisions_only");
    expect(result.decisions[0]).toMatchObject({
      validationId: "validation-a",
      sourceValidationStatus: "accepted",
      sourceFindingCodes: [],
      decision: "approved",
    });
    expect(result.approvedSelections).toHaveLength(1);
    expect(result.summary.approvalsFromAccepted).toBe(1);
  });

  it("builds a valid batch with an approved decision over human_review source status", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);
    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    expect(result.decisions[0].sourceValidationStatus).toBe("human_review");
    expect(result.decisions[0].sourceFindingCodes).toEqual(["candidate_unchanged"]);
    expect(result.approvedSelections).toHaveLength(1);
    expect(result.summary.approvalsFromHumanReview).toBe(1);
  });

  it("builds a valid batch with a rejected review decision", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "rejected" })],
    }));

    expect(result.decisions[0].decision).toBe("rejected");
    expect(result.approvedSelections).toEqual([]);
    expect(result.summary.rejected).toBe(1);
  });

  it("builds a valid batch with a changes_requested review decision", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "changes_requested" })],
    }));

    expect(result.decisions[0].decision).toBe("changes_requested");
    expect(result.approvedSelections).toEqual([]);
    expect(result.summary.changesRequested).toBe(1);
  });

  it("keeps RewriteReviewerDecisionSubmissionSchema strict", () => {
    expect(RewriteReviewerDecisionSubmissionSchema.safeParse(makeDecision()).success).toBe(true);
    expect(RewriteReviewerDecisionSubmissionSchema.safeParse({ ...makeDecision(), reviewerId: "reviewer-a" }).success).toBe(false);
  });

  it("allows only validationId, decision, and rationale in submissions", () => {
    const forbiddenFields: Record<string, unknown> = {
      candidateId: "candidate-a",
      requestId: "request-a",
      proposalId: "proposal-a",
      actionId: "action-a",
      resolutionId: "resolution-a",
      blockId: "block-a",
      originalText: "original",
      candidateText: "candidate",
      validationStatus: "accepted",
      findings: [],
      findingCodes: [],
      offerId: "offer-1",
      profileId: "profile-1",
      documentId: "resume-doc",
      reviewerId: "reviewer-a",
      reviewerName: "Reviewer",
      reviewerEmail: "reviewer@example.com",
      provider: "provider",
      model: "model",
      confidence: 1,
      score: 1,
      generatedAt: "2026-07-30T00:00:00.000Z",
      reviewedAt: "2026-07-30T00:00:00.000Z",
      timestamp: "2026-07-30T00:00:00.000Z",
      prompt: "prompt",
      systemPrompt: "system",
      metadata: {},
    };

    for (const [field, value] of Object.entries(forbiddenFields)) {
      expect(RewriteReviewerDecisionSubmissionSchema.safeParse({ ...makeDecision(), [field]: value }).success).toBe(false);
    }
  });

  it("rejects empty validationId", () => {
    expect(RewriteReviewerDecisionSubmissionSchema.safeParse(makeDecision("", { validationId: "" })).success).toBe(false);
  });

  it("rejects empty rationale", () => {
    expect(RewriteReviewerDecisionSubmissionSchema.safeParse(makeDecision("validation-a", { rationale: "" })).success).toBe(false);
  });

  it("rejects whitespace-only rationale", () => {
    expect(RewriteReviewerDecisionSubmissionSchema.safeParse(makeDecision("validation-a", { rationale: " \t\n " })).success).toBe(false);
  });

  it("preserves rationale literally", () => {
    const rationale = "  Aprobado\tcon contexto\ncaf\u00e9, \u00d1and\u00fa!  ";
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { rationale })],
    }));

    expect(result.decisions[0].rationale).toBe(rationale);
    expect(result.approvedSelections[0].approvalRationale).toBe(rationale);
  });

  it("preserves spaces, tabs, line breaks, Unicode, accents, case, and punctuation", () => {
    const originalText = "  Original\ttext\ncon caf\u00e9, \u00d1and\u00fa, CAPS!  ";
    const candidateText = "  Candidate\ttext\ncon caf\u00e9, \u00d1and\u00fa, CAPS!  ";
    const rationale = "  Raz\u00f3n\tliteral\nOK!  ";
    const validationBatch = makeValidationBatch([makeValidationResult("a", { originalText, candidateText })]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a", { rationale })],
    }));

    expect(result.decisions[0].originalText).toBe(originalText);
    expect(result.decisions[0].candidateText).toBe(candidateText);
    expect(result.approvedSelections[0].originalText).toBe(originalText);
    expect(result.approvedSelections[0].approvedText).toBe(candidateText);
    expect(result.approvedSelections[0].approvalRationale).toBe(rationale);
  });

  it("requires exactly one decision per validation result", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a"), makeValidationResult("b")]);

    expect(() => buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a")],
    }))).toThrow(RewriteReviewDecisionInputErrorCode.MissingDecision);
  });

  it("throws a stable error for duplicate validationId submissions", () => {
    expect(() => buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a"), makeDecision("validation-a", { decision: "rejected" })],
    }))).toThrow(RewriteReviewDecisionInputErrorCode.DuplicateValidationId);
  });

  it("throws a stable error for unknown validationId submissions", () => {
    expect(() => buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("unknown-validation")],
    }))).toThrow(RewriteReviewDecisionInputErrorCode.UnknownValidationId);
  });

  it("throws a stable error when a validation result has no decision", () => {
    expect(() => buildRewriteReviewDecisions(makeInput({ decisions: [] }))).toThrow(
      RewriteReviewDecisionInputErrorCode.MissingDecision,
    );
  });

  it("throws a stable invalid decision error for invalid runtime submissions before eligibility checks", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "rejected" })]);
    const invalidDecision = {
      validationId: "validation-a",
      decision: "unknown_decision",
      rationale: "explicit reviewer rationale",
      reviewerId: "reviewer-a",
    } as unknown as RewriteReviewerDecisionSubmission;

    expect(() => buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [invalidDecision],
    }))).toThrow(RewriteReviewDecisionInputErrorCode.InvalidDecision);
  });

  it("does not approve accepted source status when its submission is missing", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "accepted" })]);

    expect(() => buildRewriteReviewDecisions(makeInput({ validationBatch, decisions: [] }))).toThrow(
      RewriteReviewDecisionInputErrorCode.MissingDecision,
    );
  });

  it("does not decide human_review source status when its submission is missing", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);

    expect(() => buildRewriteReviewDecisions(makeInput({ validationBatch, decisions: [] }))).toThrow(
      RewriteReviewDecisionInputErrorCode.MissingDecision,
    );
  });

  it("does not reject rejected source status automatically when its submission is missing", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "rejected" })]);

    expect(() => buildRewriteReviewDecisions(makeInput({ validationBatch, decisions: [] }))).toThrow(
      RewriteReviewDecisionInputErrorCode.MissingDecision,
    );
  });

  it("accepts an empty validation batch with empty decisions", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch: makeValidationBatch([]),
      decisions: [],
    }));

    expect(result.decisions).toEqual([]);
    expect(result.approvedSelections).toEqual([]);
    expect(result.summary).toEqual({
      totalValidationResults: 0,
      totalDecisions: 0,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
      approvedSelections: 0,
      approvalsFromAccepted: 0,
      approvalsFromHumanReview: 0,
    });
  });

  it("does not automatically approve accepted source status", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "rejected" })],
    }));

    expect(result.decisions[0].sourceValidationStatus).toBe("accepted");
    expect(result.decisions[0].decision).toBe("rejected");
    expect(result.approvedSelections).toEqual([]);
  });

  it("does not automatically convert human_review to changes_requested", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a")],
    }));

    expect(result.decisions[0].sourceValidationStatus).toBe("human_review");
    expect(result.decisions[0].decision).toBe("approved");
  });

  it("does not automatically convert rejected source status to rejected decision", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "rejected" })]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a", { decision: "changes_requested" })],
    }));

    expect(result.decisions[0].sourceValidationStatus).toBe("rejected");
    expect(result.decisions[0].decision).toBe("changes_requested");
  });

  it("allows approved decisions from accepted source status", () => {
    expect(buildRewriteReviewDecisions(makeInput()).decisions[0].decision).toBe("approved");
  });

  it("allows approved decisions from human_review source status", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);
    expect(buildRewriteReviewDecisions(makeInput({ validationBatch })).decisions[0].decision).toBe("approved");
  });

  it("rejects approved decisions from rejected source status", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "rejected" })]);

    expect(() => buildRewriteReviewDecisions(makeInput({ validationBatch }))).toThrow(
      RewriteReviewDecisionInputErrorCode.ApprovalNotAllowedForRejected,
    );
  });

  it("allows rejected decisions from any source status", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { status: "accepted" }),
      makeValidationResult("b", { status: "human_review" }),
      makeValidationResult("c", { status: "rejected" }),
    ]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [
        makeDecision("validation-a", { decision: "rejected" }),
        makeDecision("validation-b", { decision: "rejected" }),
        makeDecision("validation-c", { decision: "rejected" }),
      ],
    }));

    expect(result.summary.rejected).toBe(3);
    expect(result.approvedSelections).toEqual([]);
  });

  it("allows changes_requested decisions from any source status", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { status: "accepted" }),
      makeValidationResult("b", { status: "human_review" }),
      makeValidationResult("c", { status: "rejected" }),
    ]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [
        makeDecision("validation-a", { decision: "changes_requested" }),
        makeDecision("validation-b", { decision: "changes_requested" }),
        makeDecision("validation-c", { decision: "changes_requested" }),
      ],
    }));

    expect(result.summary.changesRequested).toBe(3);
    expect(result.approvedSelections).toEqual([]);
  });

  it("generates selections only for approved decisions", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(result.approvedSelections).toHaveLength(1);
    expect(result.approvedSelections[0].approvalScope).toBe("approved_for_future_application_only");
  });

  it("does not generate a selection for rejected decisions", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "rejected" })],
    }));

    expect(result.approvedSelections).toEqual([]);
  });

  it("does not generate a selection for changes_requested decisions", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "changes_requested" })],
    }));

    expect(result.approvedSelections).toEqual([]);
  });

  it("generates one selection for each approved decision", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a"), makeValidationResult("b")]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-b"), makeDecision("validation-a")],
    }));

    expect(result.summary.approved).toBe(2);
    expect(result.approvedSelections).toHaveLength(2);
  });

  it("rejects an additional selection without a matching decision", () => {
    const result = buildRewriteReviewDecisions(makeInput());
    const extraSelection = { ...result.approvedSelections[0], decisionId: "missing-decision", selectionId: "extra-selection", blockId: "extra-block" };

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [...result.approvedSelections, extraSelection],
    }).success).toBe(false);
  });

  it("rejects an approved decision without its selection", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({ ...result, approvedSelections: [] }).success).toBe(false);
  });

  it("rejects a selection for a rejected decision", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "rejected" })],
    }));
    const approved = buildRewriteReviewDecisions(makeInput()).approvedSelections[0];

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...approved, decisionId: result.decisions[0].decisionId }],
    }).success).toBe(false);
  });

  it("rejects a selection for a changes_requested decision", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "changes_requested" })],
    }));
    const approved = buildRewriteReviewDecisions(makeInput()).approvedSelections[0];

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...approved, decisionId: result.decisions[0].decisionId }],
    }).success).toBe(false);
  });

  it("requires IDs to match between decision and selection", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...result.approvedSelections[0], validationId: "different-validation" }],
    }).success).toBe(false);
  });

  it.each([
    ["candidateId", "different-candidate"],
    ["requestId", "different-request"],
    ["proposalId", "different-proposal"],
    ["actionId", "different-action"],
    ["resolutionId", "different-resolution"],
    ["blockId", "different-block"],
    ["originalText", "different original text"],
  ] as const)("rejects approved selection when %s differs from the approved decision", (field, value) => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...result.approvedSelections[0], [field]: value }],
    }).success).toBe(false);
  });

  it("requires texts to match between decision and selection", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...result.approvedSelections[0], approvedText: "different text" }],
    }).success).toBe(false);
  });

  it("requires approvalRationale to match rationale", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...result.approvedSelections[0], approvalRationale: "different rationale" }],
    }).success).toBe(false);
  });

  it("requires sourceValidationStatus to match between decision and selection", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);
    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...result.approvedSelections[0], sourceValidationStatus: "accepted", sourceFindingCodes: [] }],
    }).success).toBe(false);
  });

  it("requires sourceFindingCodes to match between decision and selection", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);
    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      approvedSelections: [{ ...result.approvedSelections[0], sourceFindingCodes: ["candidate_removed_original_proper_noun"] }],
    }).success).toBe(false);
  });

  it("throws a stable error for two approvals targeting the same blockId", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { blockId: "block-shared" }),
      makeValidationResult("b", { blockId: "block-shared" }),
    ]);

    expect(() => buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a"), makeDecision("validation-b")],
    }))).toThrow(RewriteReviewDecisionInputErrorCode.MultipleApprovalsForBlock);
  });

  it("throws the same block conflict when two approved candidates have the same blockId and same candidateText", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { blockId: "block-shared", candidateText: "same approved text" }),
      makeValidationResult("b", { blockId: "block-shared", candidateText: "same approved text" }),
    ]);

    expect(() => buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a"), makeDecision("validation-b")],
    }))).toThrow(RewriteReviewDecisionInputErrorCode.MultipleApprovalsForBlock);
  });

  it("rejects manually duplicated approved selection blockIds in the public batch schema", () => {
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch: makeValidationBatch([makeValidationResult("a"), makeValidationResult("b", { blockId: "block-b" })]),
      decisions: [makeDecision("validation-a"), makeDecision("validation-b")],
    }));
    const duplicatedBlockId = result.approvedSelections[0].blockId;

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      decisions: [
        result.decisions[0],
        { ...result.decisions[1], blockId: duplicatedBlockId },
      ],
      approvedSelections: [
        result.approvedSelections[0],
        { ...result.approvedSelections[1], blockId: duplicatedBlockId },
      ],
    }).success).toBe(false);
  });

  it("allows approved and rejected decisions for the same blockId", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { blockId: "block-shared" }),
      makeValidationResult("b", { blockId: "block-shared" }),
    ]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a"), makeDecision("validation-b", { decision: "rejected" })],
    }));

    expect(result.approvedSelections).toHaveLength(1);
  });

  it("allows approved and changes_requested decisions for the same blockId", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { blockId: "block-shared" }),
      makeValidationResult("b", { blockId: "block-shared" }),
    ]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a"), makeDecision("validation-b", { decision: "changes_requested" })],
    }));

    expect(result.approvedSelections).toHaveLength(1);
  });

  it("allows two non-approved decisions for the same blockId", () => {
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { blockId: "block-shared" }),
      makeValidationResult("b", { blockId: "block-shared" }),
    ]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [
        makeDecision("validation-a", { decision: "rejected" }),
        makeDecision("validation-b", { decision: "changes_requested" }),
      ],
    }));

    expect(result.approvedSelections).toEqual([]);
  });

  it("requires empty sourceFindingCodes for accepted source status", () => {
    const decision = buildRewriteReviewDecisions(makeInput()).decisions[0];

    expect(RewriteReviewerDecisionResultSchema.safeParse({
      ...decision,
      sourceFindingCodes: ["candidate_unchanged"],
    }).success).toBe(false);
  });

  it("requires human_review sourceFindingCodes to contain only review codes", () => {
    const decision = {
      ...buildRewriteReviewDecisions(makeInput()).decisions[0],
      sourceValidationStatus: "human_review",
      sourceFindingCodes: ["candidate_contains_markdown"],
      decision: "changes_requested",
    };

    expect(RewriteReviewerDecisionResultSchema.safeParse(decision).success).toBe(false);
  });

  it("requires rejected sourceFindingCodes to contain at least one error code", () => {
    const decision = {
      ...buildRewriteReviewDecisions(makeInput()).decisions[0],
      sourceValidationStatus: "rejected",
      sourceFindingCodes: ["candidate_unchanged"],
      decision: "changes_requested",
    };

    expect(RewriteReviewerDecisionResultSchema.safeParse(decision).success).toBe(false);
  });

  it("rejects duplicate sourceFindingCodes", () => {
    const decision = {
      ...buildRewriteReviewDecisions(makeInput()).decisions[0],
      sourceValidationStatus: "human_review",
      sourceFindingCodes: ["candidate_unchanged", "candidate_unchanged"],
    };

    expect(RewriteReviewerDecisionResultSchema.safeParse(decision).success).toBe(false);
  });

  it("rejects sourceFindingCodes in non-canonical order", () => {
    const decision = {
      ...buildRewriteReviewDecisions(makeInput()).decisions[0],
      sourceValidationStatus: "human_review",
      sourceFindingCodes: ["candidate_removed_original_proper_noun", "candidate_added_unverified_proper_noun"],
    };

    expect(RewriteReviewerDecisionResultSchema.safeParse(decision).success).toBe(false);
  });

  it("copies exactly all sourceFindingCodes from validation result findings in canonical order without mutating findings", () => {
    const findings = [
      finding("candidate_added_unverified_proper_noun"),
      finding("candidate_removed_original_proper_noun"),
      finding("candidate_unchanged"),
    ];
    const validationBatch = makeValidationBatch([makeValidationResult("a", {
      status: "human_review",
      findings,
    })]);
    const beforeFindings = JSON.stringify(validationBatch.results[0].findings);

    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    const expectedCodes = [
      "candidate_added_unverified_proper_noun",
      "candidate_removed_original_proper_noun",
      "candidate_unchanged",
    ];
    expect(result.decisions[0].sourceFindingCodes).toEqual(expectedCodes);
    expect(result.approvedSelections[0].sourceFindingCodes).toEqual(expectedCodes);
    expect(result.decisions[0].sourceFindingCodes).toHaveLength(new Set(expectedCodes).size);
    expect(result.decisions[0].candidateText).toBe(validationBatch.results[0].candidateText);
    expect(JSON.stringify(validationBatch.results[0].findings)).toBe(beforeFindings);
  });

  it("keeps RewriteReviewerDecisionResultSchema strict", () => {
    const decision = buildRewriteReviewDecisions(makeInput()).decisions[0];

    expect(RewriteReviewerDecisionResultSchema.safeParse({ ...decision, reviewerId: "reviewer-a" }).success).toBe(false);
  });

  it.each([
    ["systemPrompt", "system"],
    ["appliedText", "applied text"],
    ["applicationStatus", "applied"],
    ["resumeDocument", {}],
    ["generatedAt", "2026-07-30"],
    ["reviewerId", "reviewer-a"],
    ["provider", "provider"],
    ["model", "model"],
    ["metadata", {}],
  ] as const)("rejects %s on RewriteReviewerDecisionResultSchema", (field, value) => {
    const decision = buildRewriteReviewDecisions(makeInput()).decisions[0];

    expect(RewriteReviewerDecisionResultSchema.safeParse({ ...decision, [field]: value }).success).toBe(false);
  });

  it("keeps ApprovedRewriteSelectionSchema strict", () => {
    const selection = buildRewriteReviewDecisions(makeInput()).approvedSelections[0];

    expect(ApprovedRewriteSelectionSchema.safeParse({ ...selection, appliedAt: "2026-07-30" }).success).toBe(false);
  });

  it.each([
    ["appliedAt", "2026-07-30"],
    ["appliedText", "applied text"],
    ["applicationStatus", "applied"],
    ["resumeDocument", {}],
    ["generatedAt", "2026-07-30"],
    ["reviewerId", "reviewer-a"],
    ["provider", "provider"],
    ["model", "model"],
    ["metadata", {}],
  ] as const)("rejects %s on ApprovedRewriteSelectionSchema", (field, value) => {
    const selection = buildRewriteReviewDecisions(makeInput()).approvedSelections[0];

    expect(ApprovedRewriteSelectionSchema.safeParse({ ...selection, [field]: value }).success).toBe(false);
  });

  it("keeps RewriteReviewDecisionBatchSchema strict", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({ ...result, reviewedAt: "2026-07-30" }).success).toBe(false);
  });

  it("rejects negative or non-integer summary counts", () => {
    expect(RewriteReviewDecisionSummarySchema.safeParse({
      totalValidationResults: -1,
      totalDecisions: 0,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
      approvedSelections: 0,
      approvalsFromAccepted: 0,
      approvalsFromHumanReview: 0,
    }).success).toBe(false);
    expect(RewriteReviewDecisionSummarySchema.safeParse({
      totalValidationResults: 0.5,
      totalDecisions: 0,
      approved: 0,
      rejected: 0,
      changesRequested: 0,
      approvedSelections: 0,
      approvalsFromAccepted: 0,
      approvalsFromHumanReview: 0,
    }).success).toBe(false);
  });

  it("rejects incoherent summaries", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(RewriteReviewDecisionBatchSchema.safeParse({
      ...result,
      summary: { ...result.summary, approved: 0 },
    }).success).toBe(false);
  });

  it("generates deterministic decisionId", () => {
    const result = buildRewriteReviewDecisions(makeInput()).decisions[0];

    expect(result.decisionId).toBe("review-decision|offer=offer-1|profile=profile-1|document=resume-doc|validation=validation-a|decision=approved");
  });

  it("generates deterministic selectionId", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(result.approvedSelections[0].selectionId).toBe(
      "approved-rewrite|offer=offer-1|profile=profile-1|document=resume-doc|decision=review-decision%7Coffer%3Doffer-1%7Cprofile%3Dprofile-1%7Cdocument%3Dresume-doc%7Cvalidation%3Dvalidation-a%7Cdecision%3Dapproved|block=block-a",
    );
  });

  it("changes decisionId when the decision changes", () => {
    const approved = buildRewriteReviewDecisions(makeInput()).decisions[0].decisionId;
    const rejected = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { decision: "rejected" })],
    })).decisions[0].decisionId;

    expect(approved).not.toBe(rejected);
  });

  it("does not include rationale in decisionId", () => {
    const first = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { rationale: "first rationale" })],
    })).decisions[0].decisionId;
    const second = buildRewriteReviewDecisions(makeInput({
      decisions: [makeDecision("validation-a", { rationale: "second rationale" })],
    })).decisions[0].decisionId;

    expect(first).toBe(second);
  });

  it("does not include candidateText in decisionId", () => {
    const first = buildRewriteReviewDecisions(makeInput()).decisions[0].decisionId;
    const validationBatch = makeValidationBatch([makeValidationResult("a", { candidateText: "different candidate text" })]);
    const second = buildRewriteReviewDecisions(makeInput({ validationBatch })).decisions[0].decisionId;

    expect(first).toBe(second);
  });

  it("encodes special IDs without collisions", () => {
    const validationA = "validation / \u00d1:value|x & y=z?#%";
    const validationB = "validation / \u00d1:value|x & y=other?#%";
    const validationBatch = makeValidationBatch([
      makeValidationResult("a", { validationId: validationA, candidateId: "candidate a", requestId: "request a" }),
      makeValidationResult("b", { validationId: validationB, candidateId: "candidate b", requestId: "request b", blockId: "block-b" }),
    ]);
    const result = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision(validationB, { decision: "rejected" }), makeDecision(validationA)],
    }));

    const decisionA = result.decisions.find((decision) => decision.validationId === validationA);
    const decisionB = result.decisions.find((decision) => decision.validationId === validationB);

    expect(decisionA?.decisionId).toContain(encodeURIComponent(validationA));
    expect(decisionB?.decisionId).toContain(encodeURIComponent(validationB));
    expect(decisionA?.decisionId).not.toBe(decisionB?.decisionId);
  });

  it("returns deepEqual for reordered submissions with canonical validation results", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a"), makeValidationResult("b", { blockId: "block-b" })]);
    const first = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-b", { decision: "rejected" }), makeDecision("validation-a")],
    }));
    const second = buildRewriteReviewDecisions(makeInput({
      validationBatch,
      decisions: [makeDecision("validation-a"), makeDecision("validation-b", { decision: "rejected" })],
    }));

    expect(first).toEqual(second);
  });

  it("rejects non-canonical validation batches before using them", () => {
    const unsortedBatch = {
      ...makeValidationBatch([makeValidationResult("a"), makeValidationResult("b")]),
      results: [makeValidationResult("b"), makeValidationResult("a")],
    };

    expect(() => buildRewriteReviewDecisions(makeInput({ validationBatch: unsortedBatch }))).toThrow(
      RewriteReviewDecisionInputErrorCode.InvalidValidationBatch,
    );
  });

  it("does not mutate inputs", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a")]);
    const decisions = [makeDecision()];
    const before = JSON.stringify({ validationBatch, decisions });

    buildRewriteReviewDecisions({ validationBatch, decisions });

    expect(JSON.stringify({ validationBatch, decisions })).toBe(before);
    expect(Object.isFrozen(validationBatch)).toBe(false);
    expect(Object.isFrozen(validationBatch.results)).toBe(false);
    expect(Object.isFrozen(validationBatch.results[0])).toBe(false);
    expect(Object.isFrozen(validationBatch.results[0].findings)).toBe(false);
    expect(Object.isFrozen(decisions)).toBe(false);
    expect(Object.isFrozen(decisions[0])).toBe(false);
  });

  it("accepts deeply frozen inputs", () => {
    const input = deepFreeze(makeInput());

    expect(buildRewriteReviewDecisions(input).summary.totalDecisions).toBe(1);
  });

  it("returns a deeply frozen output", () => {
    const result = buildRewriteReviewDecisions(makeInput());
    const before = JSON.stringify(result);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.decisions)).toBe(true);
    expect(Object.isFrozen(result.decisions[0])).toBe(true);
    expect(Object.isFrozen(result.decisions[0].sourceFindingCodes)).toBe(true);
    expect(Object.isFrozen(result.approvedSelections)).toBe(true);
    expect(Object.isFrozen(result.approvedSelections[0])).toBe(true);
    expect(Object.isFrozen(result.approvedSelections[0].sourceFindingCodes)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
    expect(() => result.decisions.push(result.decisions[0])).toThrow();
    expect(() => result.decisions[0].sourceFindingCodes.push("candidate_unchanged")).toThrow();
    expect(() => result.approvedSelections.push(result.approvedSelections[0])).toThrow();
    expect(() => Object.assign(result.approvedSelections[0], { approvedText: "mutated" })).toThrow();
    expect(() => result.approvedSelections[0].sourceFindingCodes.push("candidate_unchanged")).toThrow();
    expect(() => Object.assign(result.summary, { approved: 99 })).toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });

  it("does not share mutable sourceFindingCodes arrays between decision and selection", () => {
    const validationBatch = makeValidationBatch([makeValidationResult("a", { status: "human_review" })]);
    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    expect(result.decisions[0].sourceFindingCodes).toEqual(result.approvedSelections[0].sourceFindingCodes);
    expect(result.decisions[0].sourceFindingCodes).not.toBe(result.approvedSelections[0].sourceFindingCodes);
  });

  it("preserves originalText literally", () => {
    const originalText = "  original\ttext\ncaf\u00e9!  ";
    const validationBatch = makeValidationBatch([makeValidationResult("a", { originalText })]);
    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    expect(result.decisions[0].originalText).toBe(originalText);
    expect(result.approvedSelections[0].originalText).toBe(originalText);
  });

  it("preserves candidateText and approvedText literally", () => {
    const candidateText = "  candidate\ttext\ncaf\u00e9!  ";
    const validationBatch = makeValidationBatch([makeValidationResult("a", { candidateText })]);
    const result = buildRewriteReviewDecisions(makeInput({ validationBatch }));

    expect(result.decisions[0].candidateText).toBe(candidateText);
    expect(result.approvedSelections[0].approvedText).toBe(candidateText);
  });

  it("rejects reviewer, timestamp, provider, score, confidence, prompt, and metadata fields", () => {
    const decision = buildRewriteReviewDecisions(makeInput()).decisions[0];
    const selection = buildRewriteReviewDecisions(makeInput()).approvedSelections[0];
    const fields = {
      reviewerId: "reviewer-a",
      reviewerName: "Reviewer",
      reviewerEmail: "reviewer@example.com",
      timestamp: "2026-07-30",
      generatedAt: "2026-07-30",
      reviewedAt: "2026-07-30",
      provider: "provider",
      model: "model",
      score: 1,
      confidence: 1,
      prompt: "prompt",
      metadata: {},
    };

    for (const [field, value] of Object.entries(fields)) {
      expect(RewriteReviewerDecisionResultSchema.safeParse({ ...decision, [field]: value }).success).toBe(false);
      expect(ApprovedRewriteSelectionSchema.safeParse({ ...selection, [field]: value }).success).toBe(false);
    }
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

    const serialized = JSON.stringify(buildRewriteReviewDecisions(makeInput()));

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

  it("does not modify ResumeDocument", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(JSON.stringify(result)).not.toContain("resumeDocument");
    expect(JSON.stringify(result)).not.toContain("sections");
  });

  it("does not apply approvedText", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(result.approvedSelections[0].approvedText).toBe(result.decisions[0].candidateText);
    expect(JSON.stringify(result)).not.toContain("appliedAt");
    expect(JSON.stringify(result)).not.toContain("applicationStatus");
  });

  it("uses only synthetic data in tests", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(result.offerId).toBe("offer-1");
    expect(result.profileId).toBe("profile-1");
    expect(result.documentId).toBe("resume-doc");
  });

  it("documents approved as future permission rather than an applied rewrite", () => {
    const result = buildRewriteReviewDecisions(makeInput());

    expect(result.approvedSelections[0].approvalScope).toBe("approved_for_future_application_only");
    expect(result.approvedSelections[0]).not.toHaveProperty("appliedText");
    expect(result.approvedSelections[0]).not.toHaveProperty("resumeDocument");
  });
});
