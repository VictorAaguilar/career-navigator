import { describe, expect, it, vi } from "vitest";
import {
  RewriteGenerationInputErrorCode,
  buildRewriteGenerationRequests,
  type BuildRewriteGenerationRequestsInput,
} from "../../src/core/tailoring";
import {
  CANONICAL_GENERATION_RESPONSE_CONTRACT,
  CANONICAL_REWRITE_CONSTRAINTS,
  GenerationEvidenceContextSchema,
  GenerationResponseContractSchema,
  RewriteGenerationBatchSchema,
  RewriteGenerationRequestSchema,
  RewriteGenerationSummarySchema,
  type Evidence,
  type RewriteProposal,
  type RewriteProposalResult,
} from "../../src/schemas";

const originalText = "  Built  AI\tpipelines\nSIN cambiar caf\u00e9, r\u00e9sum\u00e9, \u00d1and\u00fa, punctuation?!  ";

const makeEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  id: overrides.id ?? "evidence-a",
  type: overrides.type ?? "experience",
  title: overrides.title ?? "  Automation Lead\tCafe  ",
  description: overrides.description ?? "Delivered 42% faster reporting\nwith audited workflows.",
  associatedCompetency: overrides.associatedCompetency ?? "AI automation / TypeScript",
  source: overrides.source ?? "cv",
  declaredLevel: overrides.declaredLevel ?? "advanced",
  date: overrides.date ?? "2024-04-20",
  verified: overrides.verified ?? true,
  confidence: overrides.confidence ?? 0.91,
  tags: overrides.tags ?? ["automation", "reporting"],
  reference: overrides.reference ?? {
    profileSection: "experience",
    experienceId: "exp-a",
  },
});

const makeProposal = (overrides: Partial<RewriteProposal> = {}): RewriteProposal => ({
  proposalId: overrides.proposalId ?? "proposal-a",
  actionId: overrides.actionId ?? "action-a",
  resolutionId: overrides.resolutionId ?? "resolution-a",
  sectionId: overrides.sectionId ?? "section-a",
  blockId: overrides.blockId ?? "block-a",
  actionType: "highlight_evidence",
  targetSection: overrides.targetSection ?? "experience",
  requirementIds: overrides.requirementIds ?? ["req-a"],
  evidenceIds: overrides.evidenceIds ?? ["evidence-a"],
  originalText: overrides.originalText ?? originalText,
  rewriteGoal: overrides.rewriteGoal ?? "emphasize_supported_evidence",
  constraints: overrides.constraints ?? [...CANONICAL_REWRITE_CONSTRAINTS],
});

const makeRewriteProposalResult = (overrides: Partial<RewriteProposalResult> = {}): RewriteProposalResult => {
  const proposals = overrides.proposals ?? [makeProposal()];
  const skippedItems = overrides.skippedItems ?? [];

  return {
    offerId: overrides.offerId ?? "offer-1",
    profileId: overrides.profileId ?? "profile-1",
    documentId: overrides.documentId ?? "resume-doc",
    proposals,
    skippedItems,
    summary: overrides.summary ?? {
      totalResolutions: proposals.length + skippedItems.length,
      readyProposals: proposals.length,
      ambiguousTargets: skippedItems.filter((item) => item.reason === "ambiguous_target").length,
      unresolvedTargets: skippedItems.filter((item) => item.reason === "unresolved_target").length,
      noRewriteRequired: skippedItems.filter(
        (item) => item.reason === "no_rewrite_required" || item.reason === "structural_change_required",
      ).length,
    },
  };
};

const makeInput = (
  overrides: Partial<BuildRewriteGenerationRequestsInput> = {},
): BuildRewriteGenerationRequestsInput => ({
  rewriteProposalResult: overrides.rewriteProposalResult ?? makeRewriteProposalResult(),
  evidences: overrides.evidences ?? [makeEvidence()],
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

describe("Rewrite generation request builder", () => {
  it("builds a valid batch", () => {
    const batch = buildRewriteGenerationRequests(makeInput());

    expect(RewriteGenerationBatchSchema.parse(batch)).toEqual(batch);
    expect(batch).toMatchObject({
      offerId: "offer-1",
      profileId: "profile-1",
      documentId: "resume-doc",
      summary: {
        totalProposals: 1,
        generationReady: 1,
        totalEvidenceContexts: 1,
      },
    });
  });

  it("keeps generation schemas strict", () => {
    const batch = buildRewriteGenerationRequests(makeInput());
    const request = batch.requests[0];
    const context = request.evidenceContexts[0];

    expect(GenerationEvidenceContextSchema.safeParse({ ...context, extra: true }).success).toBe(false);
    expect(GenerationResponseContractSchema.safeParse({ ...request.responseContract, extra: true }).success).toBe(false);
    expect(RewriteGenerationRequestSchema.safeParse({ ...request, extra: true }).success).toBe(false);
    expect(RewriteGenerationSummarySchema.safeParse({ ...batch.summary, extra: true }).success).toBe(false);
    expect(RewriteGenerationBatchSchema.safeParse({ ...batch, extra: true }).success).toBe(false);
  });

  it("uses the exact fixed response contract", () => {
    const batch = buildRewriteGenerationRequests(makeInput());

    expect(batch.requests[0].responseContract).toEqual(CANONICAL_GENERATION_RESPONSE_CONTRACT);
    expect(GenerationResponseContractSchema.parse(batch.requests[0].responseContract)).toEqual(
      CANONICAL_GENERATION_RESPONSE_CONTRACT,
    );
  });

  it("rejects altered response contract values", () => {
    const contract = CANONICAL_GENERATION_RESPONSE_CONTRACT;

    expect(GenerationResponseContractSchema.safeParse({ ...contract, outputType: "markdown" }).success).toBe(false);
    expect(GenerationResponseContractSchema.safeParse({ ...contract, languagePolicy: "english" }).success).toBe(false);
    expect(GenerationResponseContractSchema.safeParse({ ...contract, candidateCount: 2 }).success).toBe(false);
    expect(GenerationResponseContractSchema.safeParse({ ...contract, allowMarkdown: true }).success).toBe(false);
    expect(GenerationResponseContractSchema.safeParse({ ...contract, allowAdditionalClaims: true }).success).toBe(false);
    expect(GenerationResponseContractSchema.safeParse({ ...contract, requireEvidenceGrounding: false }).success).toBe(false);
  });

  it("creates exactly one request per proposal and ignores skipped items", () => {
    const skippedItem = {
      skippedItemId: "skip-a",
      actionId: "action-skip",
      resolutionId: "resolution-skip",
      reason: "unresolved_target" as const,
      candidateBlockIds: [],
    };
    const proposalA = makeProposal({ proposalId: "proposal-a", actionId: "action-a", resolutionId: "resolution-a" });
    const proposalB = makeProposal({
      proposalId: "proposal-b",
      actionId: "action-b",
      resolutionId: "resolution-b",
      blockId: "block-b",
      requirementIds: ["req-b"],
      evidenceIds: ["evidence-b"],
    });
    const batch = buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [proposalA, proposalB], skippedItems: [skippedItem] }),
      evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-b" })],
    }));

    expect(batch.requests).toHaveLength(2);
    expect(batch.requests.map((request) => request.proposalId)).toEqual(["proposal-a", "proposal-b"]);
    expect(JSON.stringify(batch)).not.toContain("skip-a");
  });

  it("includes authorized evidence and excludes unauthorized evidence", () => {
    const batch = buildRewriteGenerationRequests(makeInput({
      evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-b", title: "Unauthorized" })],
    }));

    expect(batch.requests[0].evidenceIds).toEqual(["evidence-a"]);
    expect(batch.requests[0].evidenceContexts.map((context) => context.evidenceId)).toEqual(["evidence-a"]);
    expect(JSON.stringify(batch)).not.toContain("Unauthorized");
  });

  it("throws stable errors for unknown evidence, duplicate evidence, duplicate proposal, invalid inputs, and empty evidence content", () => {
    expect(() =>
      buildRewriteGenerationRequests(makeInput({
        rewriteProposalResult: makeRewriteProposalResult({ proposals: [makeProposal({ evidenceIds: ["missing-evidence"] })] }),
      })),
    ).toThrow(RewriteGenerationInputErrorCode.UnknownEvidenceId);

    expect(() =>
      buildRewriteGenerationRequests(makeInput({
        evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-a" })],
      })),
    ).toThrow(RewriteGenerationInputErrorCode.DuplicateEvidenceId);

    expect(() =>
      buildRewriteGenerationRequests(makeInput({
        rewriteProposalResult: makeRewriteProposalResult({
          proposals: [
            makeProposal({ proposalId: "proposal-a" }),
            makeProposal({ proposalId: "proposal-a", actionId: "action-b", resolutionId: "resolution-b" }),
          ],
        }),
      })),
    ).toThrow(RewriteGenerationInputErrorCode.DuplicateProposalId);

    expect(() =>
      buildRewriteGenerationRequests(makeInput({
        rewriteProposalResult: { ...makeRewriteProposalResult(), offerId: "" } as RewriteProposalResult,
      })),
    ).toThrow(RewriteGenerationInputErrorCode.InvalidRewriteResult);

    expect(() =>
      buildRewriteGenerationRequests(makeInput({
        rewriteProposalResult: makeRewriteProposalResult({
          proposals: [makeProposal({ evidenceIds: ["evidence-a", "evidence-a"] })],
        }) as RewriteProposalResult,
      })),
    ).toThrow(RewriteGenerationInputErrorCode.InvalidRewriteResult);

    expect(() =>
      buildRewriteGenerationRequests(makeInput({ evidences: [{ ...makeEvidence(), id: "" } as Evidence] })),
    ).toThrow(RewriteGenerationInputErrorCode.InvalidEvidence);

    expect(() =>
      buildRewriteGenerationRequests(makeInput({ evidences: [makeEvidence({ title: "   " })] })),
    ).toThrow(RewriteGenerationInputErrorCode.EmptyEvidenceContent);
  });

  it("requires exact agreement between evidenceIds and evidenceContexts", () => {
    const request = buildRewriteGenerationRequests(makeInput()).requests[0];
    const extraContext = { ...request.evidenceContexts[0], evidenceId: "evidence-b" };
    const orderedRequest = buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({
        proposals: [makeProposal({ requirementIds: ["req-a", "req-b"], evidenceIds: ["evidence-a", "evidence-b"] })],
      }),
      evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-b" })],
    })).requests[0];

    expect(RewriteGenerationRequestSchema.safeParse(request).success).toBe(true);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        evidenceContexts: [...request.evidenceContexts, request.evidenceContexts[0]],
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        evidenceContexts: [],
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        evidenceContexts: [...request.evidenceContexts, extraContext],
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...orderedRequest,
        requirementIds: ["req-b", "req-a"],
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...orderedRequest,
        evidenceIds: ["evidence-b", "evidence-a"],
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...orderedRequest,
        evidenceContexts: [...orderedRequest.evidenceContexts].reverse(),
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...orderedRequest,
        evidenceIds: ["evidence-a", "evidence-b"],
        evidenceContexts: [
          { ...orderedRequest.evidenceContexts[0], evidenceId: "evidence-b" },
          { ...orderedRequest.evidenceContexts[1], evidenceId: "evidence-a" },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates evidence context dates like EvidenceSchema", () => {
    const request = buildRewriteGenerationRequests(makeInput({
      evidences: [makeEvidence({ date: "2025-02-03" })],
    })).requests[0];
    const context = request.evidenceContexts[0];
    const contextWithoutDate = { ...context };
    delete contextWithoutDate.date;

    expect(context.date).toBe("2025-02-03");
    expect(GenerationEvidenceContextSchema.safeParse(context).success).toBe(true);
    expect(GenerationEvidenceContextSchema.safeParse({ ...context, date: "not-a-date" }).success).toBe(false);
    expect(GenerationEvidenceContextSchema.safeParse(contextWithoutDate).success).toBe(true);
  });

  it("copies factual evidence fields literally without copying irrelevant evidence metadata", () => {
    const evidence = makeEvidence({
      title: "  Senior AI Lead\tCafe  ",
      description: "Built\nsystems with 99.9% uptime -- Nandu.",
      associatedCompetency: "  AI orchestration  ",
      date: "2025-02-03",
      tags: ["  GenAI  ", "CV"],
      verified: false,
      confidence: 0.11,
      source: "external",
      reference: {
        profileSection: "projects",
        projectId: "project-a",
      },
    });
    const batch = buildRewriteGenerationRequests(makeInput({ evidences: [evidence] }));
    const context = batch.requests[0].evidenceContexts[0];

    expect(context).toEqual({
      evidenceId: "evidence-a",
      title: "  Senior AI Lead\tCafe  ",
      description: "Built\nsystems with 99.9% uptime -- Nandu.",
      associatedCompetency: "  AI orchestration  ",
      date: "2025-02-03",
      tags: ["  GenAI  ", "CV"],
      reference: {
        profileSection: "projects",
        projectId: "project-a",
      },
    });
    expect(JSON.stringify(context)).not.toContain("confidence");
    expect(JSON.stringify(context)).not.toContain("verified");
    expect(JSON.stringify(context)).not.toContain("external");
  });

  it("preserves originalText exactly, including spaces, tabs, newlines, Unicode, accents, case, and punctuation", () => {
    const exactText = "  Senior\tAI\nEngineer -- caf\u00e9 r\u00e9sum\u00e9 \u00d1and\u00fa!  ";
    const batch = buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [makeProposal({ originalText: exactText })] }),
    }));

    expect(batch.requests[0].originalText).toBe(exactText);
  });

  it("preserves exact ordered constraints from the rewrite proposal", () => {
    const batch = buildRewriteGenerationRequests(makeInput());
    const request = batch.requests[0];

    expect(request.constraints).toEqual([...CANONICAL_REWRITE_CONSTRAINTS]);
    expect(RewriteGenerationRequestSchema.safeParse({ ...request, constraints: [...CANONICAL_REWRITE_CONSTRAINTS] }).success).toBe(true);
    expect(
      RewriteGenerationRequestSchema.safeParse({ ...request, constraints: [...CANONICAL_REWRITE_CONSTRAINTS].reverse() }).success,
    ).toBe(false);
  });

  it("generates deterministic encoded request IDs without collisions", () => {
    const proposalA = makeProposal({ proposalId: "proposal / \u00d1:value|x & y=z?#%" });
    const proposalB = makeProposal({
      proposalId: "proposal / \u00d1:value|x & y=other?#%",
      actionId: "action-b",
      resolutionId: "resolution-b",
      blockId: "block-b",
      requirementIds: ["req-b"],
      evidenceIds: ["evidence-b"],
    });
    const batch = buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [proposalA, proposalB] }),
      evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-b" })],
    }));

    expect(batch.requests[0].requestId).toBe(
      "generation-request|offer=offer-1|profile=profile-1|document=resume-doc|proposal=proposal%20%2F%20%C3%91%3Avalue%7Cx%20%26%20y%3Dother%3F%23%25",
    );
    expect(batch.requests[1].requestId).toBe(
      "generation-request|offer=offer-1|profile=profile-1|document=resume-doc|proposal=proposal%20%2F%20%C3%91%3Avalue%7Cx%20%26%20y%3Dz%3F%23%25",
    );
    expect(buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [proposalA, proposalB] }),
      evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-b" })],
    }))).toEqual(batch);
    expect(new Set(batch.requests.map((request) => request.requestId)).size).toBe(2);
  });

  it("returns deepEqual for proposals, evidences, requirementIds, and evidenceIds in different orders", () => {
    const proposalA = makeProposal({
      proposalId: "proposal-a",
      requirementIds: ["req-b", "req-a"],
      evidenceIds: ["evidence-b", "evidence-a"],
    });
    const proposalB = makeProposal({
      proposalId: "proposal-b",
      actionId: "action-b",
      resolutionId: "resolution-b",
      blockId: "block-b",
      requirementIds: ["req-c"],
      evidenceIds: ["evidence-c"],
    });
    const first = makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [proposalB, proposalA] }),
      evidences: [
        makeEvidence({ id: "evidence-c", title: "Evidence C" }),
        makeEvidence({ id: "evidence-b", title: "Evidence B" }),
        makeEvidence({ id: "evidence-a", title: "Evidence A" }),
      ],
    });
    const second = makeInput({
      rewriteProposalResult: makeRewriteProposalResult({
        proposals: [makeProposal({ ...proposalA, requirementIds: ["req-a", "req-b"], evidenceIds: ["evidence-a", "evidence-b"] }), proposalB],
      }),
      evidences: [
        makeEvidence({ id: "evidence-a", title: "Evidence A" }),
        makeEvidence({ id: "evidence-b", title: "Evidence B" }),
        makeEvidence({ id: "evidence-c", title: "Evidence C" }),
      ],
    });

    expect(buildRewriteGenerationRequests(first)).toEqual(buildRewriteGenerationRequests(second));
  });

  it("does not mutate or freeze RewriteProposalResult, proposals, Evidence[], or Evidence objects", () => {
    const input = makeInput();
    const before = JSON.stringify(input);

    buildRewriteGenerationRequests(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input.rewriteProposalResult)).toBe(false);
    expect(Object.isFrozen(input.rewriteProposalResult.proposals)).toBe(false);
    expect(Object.isFrozen(input.rewriteProposalResult.proposals[0])).toBe(false);
    expect(Object.isFrozen(input.evidences)).toBe(false);
    expect(Object.isFrozen(input.evidences[0])).toBe(false);
  });

  it("creates independent contexts when the same Evidence is reused by multiple proposals", () => {
    const evidence = makeEvidence({
      id: "evidence-a",
      tags: ["shared", "evidence"],
      reference: { profileSection: "experience", experienceId: "exp-a" },
    });
    const proposalA = makeProposal({ proposalId: "proposal-a", evidenceIds: ["evidence-a"] });
    const proposalB = makeProposal({
      proposalId: "proposal-b",
      actionId: "action-b",
      resolutionId: "resolution-b",
      blockId: "block-b",
      requirementIds: ["req-b"],
      evidenceIds: ["evidence-a"],
    });
    const input = makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [proposalA, proposalB] }),
      evidences: [evidence],
    });
    const batch = buildRewriteGenerationRequests(input);
    const firstContext = batch.requests[0].evidenceContexts[0];
    const secondContext = batch.requests[1].evidenceContexts[0];
    const before = JSON.stringify(batch);

    expect(batch.requests).toHaveLength(2);
    expect(firstContext).toEqual(secondContext);
    expect(firstContext).not.toBe(secondContext);
    expect(firstContext.tags).not.toBe(secondContext.tags);
    expect(firstContext.reference).not.toBe(secondContext.reference);
    expect(() => firstContext.tags?.push("mutated")).toThrow();
    expect(() => Object.assign(firstContext.reference ?? {}, { profileSection: "mutated" })).toThrow();
    expect(JSON.stringify(batch)).toBe(before);
    expect(Object.isFrozen(input.evidences[0])).toBe(false);
    expect(input.evidences[0]).toEqual(evidence);
  });

  it("accepts deeply frozen inputs and returns a deeply frozen output", () => {
    const input = deepFreeze(makeInput());
    const batch = buildRewriteGenerationRequests(input);
    const before = JSON.stringify(batch);

    expect(Object.isFrozen(batch)).toBe(true);
    expect(Object.isFrozen(batch.requests)).toBe(true);
    expect(Object.isFrozen(batch.requests[0])).toBe(true);
    expect(Object.isFrozen(batch.requests[0].constraints)).toBe(true);
    expect(Object.isFrozen(batch.requests[0].requirementIds)).toBe(true);
    expect(Object.isFrozen(batch.requests[0].evidenceIds)).toBe(true);
    expect(Object.isFrozen(batch.requests[0].evidenceContexts)).toBe(true);
    expect(Object.isFrozen(batch.requests[0].evidenceContexts[0])).toBe(true);
    expect(Object.isFrozen(batch.requests[0].evidenceContexts[0].tags)).toBe(true);
    expect(Object.isFrozen(batch.requests[0].evidenceContexts[0].reference)).toBe(true);
    expect(Object.isFrozen(batch.requests[0].responseContract)).toBe(true);
    expect(Object.isFrozen(batch.summary)).toBe(true);
    expect(() => batch.requests.push(batch.requests[0])).toThrow();
    expect(() => batch.requests[0].constraints.push("do_not_add_claims")).toThrow();
    expect(() => batch.requests[0].requirementIds.push("req-b")).toThrow();
    expect(() => batch.requests[0].evidenceIds.push("evidence-b")).toThrow();
    expect(() => batch.requests[0].evidenceContexts.push(batch.requests[0].evidenceContexts[0])).toThrow();
    expect(() => batch.requests[0].evidenceContexts[0].tags?.push("mutated")).toThrow();
    expect(() => Object.assign(batch.requests[0].evidenceContexts[0].reference ?? {}, { profileSection: "mutated" })).toThrow();
    expect(() => Object.assign(batch.requests[0].responseContract, { candidateCount: 2 })).toThrow();
    expect(() => Object.assign(batch.summary, { totalProposals: 99 })).toThrow();
    expect(JSON.stringify(batch)).toBe(before);
  });

  it("builds a coherent summary and rejects incoherent summaries", () => {
    const batch = buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({
        proposals: [
          makeProposal({ evidenceIds: ["evidence-a", "evidence-b"] }),
          makeProposal({
            proposalId: "proposal-b",
            actionId: "action-b",
            resolutionId: "resolution-b",
            blockId: "block-b",
            requirementIds: ["req-b"],
            evidenceIds: ["evidence-c"],
          }),
        ],
      }),
      evidences: [makeEvidence({ id: "evidence-a" }), makeEvidence({ id: "evidence-b" }), makeEvidence({ id: "evidence-c" })],
    }));

    expect(batch.summary).toEqual({
      totalProposals: 2,
      generationReady: 2,
      totalEvidenceContexts: 3,
    });
    expect(
      RewriteGenerationBatchSchema.safeParse({
        ...batch,
        summary: { ...batch.summary, totalEvidenceContexts: 99 },
      }).success,
    ).toBe(false);
  });

  it("returns a valid empty batch for input without proposals", () => {
    const skippedItem = {
      skippedItemId: "skip-a",
      actionId: "action-skip",
      resolutionId: "resolution-skip",
      reason: "unresolved_target" as const,
      candidateBlockIds: [],
    };
    const batch = buildRewriteGenerationRequests(makeInput({
      rewriteProposalResult: makeRewriteProposalResult({ proposals: [], skippedItems: [skippedItem] }),
      evidences: [],
    }));

    expect(batch).toEqual({
      offerId: "offer-1",
      profileId: "profile-1",
      documentId: "resume-doc",
      requests: [],
      summary: {
        totalProposals: 0,
        generationReady: 0,
        totalEvidenceContexts: 0,
      },
    });
    expect(RewriteGenerationBatchSchema.parse(batch)).toEqual(batch);
  });

  it("rejects generated text, provider, model, prompt, temperature, and timestamp fields", () => {
    const request = buildRewriteGenerationRequests(makeInput()).requests[0];
    const forbiddenFields: Record<string, unknown> = {
      candidateText: "candidate",
      rewrittenText: "rewrite",
      afterText: "after",
      finalText: "final",
      confidence: 0.9,
      provider: "openai",
      model: "model-a",
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 256,
      prompt: "prompt",
      systemPrompt: "system",
      messages: [{ role: "user", content: "prompt" }],
      tools: [{ name: "tool" }],
      generatedAt: "2026-07-29T00:00:00.000Z",
    };

    for (const [field, value] of Object.entries(forbiddenFields)) {
      expect(RewriteGenerationRequestSchema.safeParse({ ...request, [field]: value }).success).toBe(false);
    }
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        responseContract: { ...request.responseContract, provider: "openai" },
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        responseContract: { ...request.responseContract, model: "model-a" },
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        evidenceContexts: [{ ...request.evidenceContexts[0], provider: "openai" }],
      }).success,
    ).toBe(false);
    expect(
      RewriteGenerationRequestSchema.safeParse({
        ...request,
        evidenceContexts: [{ ...request.evidenceContexts[0], prompt: "prompt" }],
      }).success,
    ).toBe(false);
  });

  it("does not use Date.now, random, UUID, network calls, or LLM adapters", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUUIDSpy =
      typeof globalThis.crypto?.randomUUID === "function"
        ? vi.spyOn(globalThis.crypto, "randomUUID")
        : undefined;
    const fetchSpy =
      typeof globalThis.fetch === "function"
        ? vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network must not be called"))
        : undefined;

    const batch = buildRewriteGenerationRequests(makeInput());
    const serialized = JSON.stringify(batch);

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUUIDSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain("candidateText");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("model");
    expect(serialized).not.toContain("prompt");

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUUIDSpy?.mockRestore();
    fetchSpy?.mockRestore();
  });
});
