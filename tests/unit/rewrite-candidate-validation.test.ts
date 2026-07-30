import { describe, expect, it, vi } from "vitest";
import {
  RewriteCandidateValidationInputErrorCode,
  validateRewriteCandidates,
  type ValidateRewriteCandidatesInput,
} from "../../src/core/tailoring";
import {
  CANONICAL_GENERATION_RESPONSE_CONTRACT,
  CANONICAL_REWRITE_CONSTRAINTS,
  RewriteCandidateFindingSchema,
  RewriteCandidateSubmissionSchema,
  RewriteCandidateValidationBatchSchema,
  RewriteCandidateValidationResultSchema,
  type GenerationEvidenceContext,
  type RewriteCandidateFinding,
  type RewriteCandidateSubmission,
  type RewriteGenerationBatch,
  type RewriteGenerationRequest,
} from "../../src/schemas";

const makeEvidenceContext = (overrides: Partial<GenerationEvidenceContext> = {}): GenerationEvidenceContext => ({
  evidenceId: overrides.evidenceId ?? "evidence-a",
  title: overrides.title ?? "automation evidence",
  description: overrides.description ?? "reliable delivery evidence",
  ...(overrides.associatedCompetency === undefined ? {} : { associatedCompetency: overrides.associatedCompetency }),
  ...(overrides.date === undefined ? {} : { date: overrides.date }),
  ...(overrides.tags === undefined ? {} : { tags: overrides.tags }),
  ...(overrides.reference === undefined ? {} : { reference: overrides.reference }),
});

const makeRequest = (overrides: Partial<RewriteGenerationRequest> = {}): RewriteGenerationRequest => ({
  requestId: overrides.requestId ?? "request-a",
  proposalId: overrides.proposalId ?? "proposal-a",
  actionId: overrides.actionId ?? "action-a",
  resolutionId: overrides.resolutionId ?? "resolution-a",
  blockId: overrides.blockId ?? "block-a",
  originalText: overrides.originalText ?? "built reliable pipelines",
  rewriteGoal: overrides.rewriteGoal ?? "emphasize_supported_evidence",
  constraints: overrides.constraints ?? [...CANONICAL_REWRITE_CONSTRAINTS],
  requirementIds: overrides.requirementIds ?? ["req-a"],
  evidenceIds: overrides.evidenceIds ?? ["evidence-a"],
  evidenceContexts: overrides.evidenceContexts ?? [makeEvidenceContext()],
  responseContract: overrides.responseContract ?? { ...CANONICAL_GENERATION_RESPONSE_CONTRACT },
});

const makeBatch = (overrides: Partial<RewriteGenerationBatch> = {}): RewriteGenerationBatch => {
  const requests = overrides.requests ?? [makeRequest()];
  return {
    offerId: overrides.offerId ?? "offer-1",
    profileId: overrides.profileId ?? "profile-1",
    documentId: overrides.documentId ?? "resume-doc",
    requests,
    summary: overrides.summary ?? {
      totalProposals: requests.length,
      generationReady: requests.length,
      totalEvidenceContexts: requests.reduce((total, request) => total + request.evidenceContexts.length, 0),
    },
  };
};

const makeSubmission = (overrides: Partial<RewriteCandidateSubmission> = {}): RewriteCandidateSubmission => ({
  requestId: overrides.requestId ?? "request-a",
  candidateText: overrides.candidateText ?? "built reliable automation pipelines",
});

const makeInput = (overrides: Partial<ValidateRewriteCandidatesInput> = {}): ValidateRewriteCandidatesInput => ({
  generationBatch: overrides.generationBatch ?? makeBatch(),
  candidates: overrides.candidates ?? [makeSubmission()],
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

const finding = (overrides: Partial<RewriteCandidateFinding> = {}): RewriteCandidateFinding => ({
  findingId: overrides.findingId ?? "finding-a",
  code: overrides.code ?? "candidate_contains_markdown",
  severity: overrides.severity ?? "error",
  values: overrides.values ?? ["```"],
});

describe("Rewrite candidate validation", () => {
  it("builds a valid batch with an accepted candidate", () => {
    const result = validateRewriteCandidates(makeInput());

    expect(RewriteCandidateValidationBatchSchema.parse(result)).toEqual(result);
    expect(result.validationScope).toBe("deterministic_surface_checks_only");
    expect(result.results[0]).toMatchObject({
      status: "accepted",
      requestId: "request-a",
      proposalId: "proposal-a",
      actionId: "action-a",
      resolutionId: "resolution-a",
      blockId: "block-a",
      originalText: "built reliable pipelines",
      candidateText: "built reliable automation pipelines",
      findings: [],
    });
  });

  it("keeps RewriteCandidateSubmissionSchema strict", () => {
    const forbiddenFields: Record<string, unknown> = {
      proposalId: "proposal-a",
      actionId: "action-a",
      resolutionId: "resolution-a",
      blockId: "block-a",
      originalText: "original",
      evidenceIds: ["evidence-a"],
      evidenceContexts: [],
      provider: "openai",
      model: "model-a",
      confidence: 0.9,
      score: 1,
      prompt: "prompt",
      systemPrompt: "system",
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 256,
      usage: { totalTokens: 1 },
      generatedAt: "2026-07-30T00:00:00.000Z",
    };

    expect(RewriteCandidateSubmissionSchema.safeParse(makeSubmission()).success).toBe(true);
    for (const [field, value] of Object.entries(forbiddenFields)) {
      expect(RewriteCandidateSubmissionSchema.safeParse({ ...makeSubmission(), [field]: value }).success).toBe(false);
    }
  });

  it("rejects empty candidateText", () => {
    expect(RewriteCandidateSubmissionSchema.safeParse({ requestId: "request-a", candidateText: "" }).success).toBe(false);
  });

  it("rejects whitespace-only candidateText", () => {
    expect(RewriteCandidateSubmissionSchema.safeParse({ requestId: "request-a", candidateText: " \t\n " }).success).toBe(false);
  });

  it("preserves candidateText literally", () => {
    const candidateText = "  built  reliable\tpipelines\nwith caf\u00e9 and \u00d1and\u00fa!  ";
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText })] }));

    expect(result.results[0].candidateText).toBe(candidateText);
  });

  it("requires exactly one submission per request", () => {
    const requestB = makeRequest({
      requestId: "request-b",
      proposalId: "proposal-b",
      actionId: "action-b",
      resolutionId: "resolution-b",
    });
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest(), requestB] }),
      candidates: [makeSubmission(), makeSubmission({ requestId: "request-b", candidateText: "built reliable service" })],
    }));

    expect(result.results).toHaveLength(2);
    expect(result.summary.totalCandidates).toBe(2);
  });

  it("throws a stable error for duplicate submissions for a request", () => {
    expect(() =>
      validateRewriteCandidates(makeInput({
        candidates: [makeSubmission(), makeSubmission({ candidateText: "another candidate" })],
      })),
    ).toThrow(RewriteCandidateValidationInputErrorCode.DuplicateRequestId);
  });

  it("throws a stable error for unknown requestId", () => {
    expect(() =>
      validateRewriteCandidates(makeInput({
        candidates: [makeSubmission({ requestId: "unknown-request" })],
      })),
    ).toThrow(RewriteCandidateValidationInputErrorCode.UnknownRequestId);
  });

  it("throws a stable error when a request has no candidate", () => {
    expect(() => validateRewriteCandidates(makeInput({ candidates: [] }))).toThrow(
      RewriteCandidateValidationInputErrorCode.MissingCandidate,
    );
  });

  it("accepts an empty generation batch with empty candidates", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [] }),
      candidates: [],
    }));

    expect(result).toEqual({
      offerId: "offer-1",
      profileId: "profile-1",
      documentId: "resume-doc",
      validationScope: "deterministic_surface_checks_only",
      results: [],
      summary: {
        totalRequests: 0,
        totalCandidates: 0,
        accepted: 0,
        rejected: 0,
        humanReview: 0,
        totalFindings: 0,
      },
    });
  });

  it("throws stable errors for invalid runtime inputs without exposing ZodError", () => {
    expect(() =>
      validateRewriteCandidates(makeInput({
        generationBatch: { ...makeBatch(), offerId: "" } as RewriteGenerationBatch,
      })),
    ).toThrow(RewriteCandidateValidationInputErrorCode.InvalidGenerationBatch);
    expect(() =>
      validateRewriteCandidates(makeInput({
        candidates: [{ ...makeSubmission(), candidateText: "" } as RewriteCandidateSubmission],
      })),
    ).toThrow(RewriteCandidateValidationInputErrorCode.InvalidCandidate);
  });

  it("rejects candidates containing a Markdown fence", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "```code```" })] }));

    expect(result.results[0].status).toBe("rejected");
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({ code: "candidate_contains_markdown", severity: "error" }));
  });

  it("rejects candidates containing a Markdown heading", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "# Heading" })] }));

    expect(result.results[0].findings[0]).toMatchObject({ code: "candidate_contains_markdown", severity: "error" });
  });

  it("rejects candidates containing a Markdown list", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "- item" })] }));

    expect(result.results[0].findings[0]).toMatchObject({ code: "candidate_contains_markdown", severity: "error" });
  });

  it("rejects candidates containing a numbered Markdown list", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "1. item" })] }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({ code: "candidate_contains_markdown", severity: "error" }));
  });

  it("rejects candidates containing a Markdown blockquote", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "> quoted" })] }));

    expect(result.results[0].findings[0]).toMatchObject({ code: "candidate_contains_markdown", severity: "error" });
  });

  it("rejects candidates containing a Markdown link", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "[label](https://example.com)" })] }));

    expect(result.results[0].findings[0]).toMatchObject({ code: "candidate_contains_markdown", severity: "error" });
  });

  it("does not mark a normal internal hyphen as Markdown", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built end-to-end automation pipelines" })] }));

    expect(result.results[0].status).toBe("accepted");
  });

  it("allows an original date to be preserved", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "launched 2024-05-01" })] }),
      candidates: [makeSubmission({ candidateText: "launched 2024-05-01" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_removed_original_date");
  });

  it("rejects removal of an original date", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "launched 2024-05-01" })] }),
      candidates: [makeSubmission({ candidateText: "launched recently" })],
    }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_removed_original_date",
      severity: "error",
      values: ["2024-05-01"],
    }));
  });

  it("allows adding a date from authorized evidence", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({
        requests: [makeRequest({ evidenceContexts: [makeEvidenceContext({ date: "2024-05-01" })] })],
      }),
      candidates: [makeSubmission({ candidateText: "built reliable automation pipelines in 2024-05-01" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unsupported_date");
  });

  it("rejects adding an unsupported date", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built reliable automation in 2024-05-01" })] }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_date",
      severity: "error",
      values: ["2024-05-01"],
    }));
  });

  it("detects one- and two-digit day and month date formats literally", () => {
    const candidateText = [
      "delivered on 1-5-2024",
      "01-5-2024",
      "1-05-2024",
      "01-05-2024",
      "1/5/2024",
      "01/05/2024",
      "5/2024",
      "05/2024",
    ].join(" ");
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText })] }));

    const dateFinding = result.results[0].findings.find((item) => item.code === "candidate_added_unsupported_date");
    expect(dateFinding?.values).toEqual(expect.arrayContaining([
      "1-5-2024",
      "01-5-2024",
      "1-05-2024",
      "01-05-2024",
      "1/5/2024",
      "01/05/2024",
      "5/2024",
      "05/2024",
    ]));
    expect(dateFinding?.values).toHaveLength(8);
    expect(dateFinding?.values).not.toContain("2024");
  });

  it("treats different date representations as different exact tokens", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "launched 01/05/2024" })] }),
      candidates: [makeSubmission({ candidateText: "launched 1-5-2024 and 2024" })],
    }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_removed_original_date",
      values: ["01/05/2024"],
    }));
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_date",
      values: ["1-5-2024", "2024"],
    }));
  });

  it("does not extract the internal year or metric tokens from a long date", () => {
    const result = validateRewriteCandidates(makeInput({
      candidates: [makeSubmission({ candidateText: "built reliable automation on 1-5-2024" })],
    }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_date",
      values: ["1-5-2024"],
    }));
    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unsupported_metric");
  });

  it("detects impossible calendar dates superficially when they match the supported formats", () => {
    const result = validateRewriteCandidates(makeInput({
      candidates: [makeSubmission({ candidateText: "built reliable automation on 99-99-2024, 13/99/2024, and 00/2024" })],
    }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_date",
      values: ["00/2024", "13/99/2024", "99-99-2024"],
    }));
    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unsupported_metric");
  });

  it("does not recognize 1899 or 2100 as standalone years", () => {
    const result = validateRewriteCandidates(makeInput({
      candidates: [makeSubmission({ candidateText: "built reliable automation in 1899 and 2100" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unsupported_date");
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_metric",
      values: ["1899", "2100"],
    }));
  });

  it("allows an original metric to be preserved", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "improved reporting by 10%" })] }),
      candidates: [makeSubmission({ candidateText: "improved reporting by 10%" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_removed_original_metric");
  });

  it("rejects removal of an original metric", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "improved reporting by 10%" })] }),
      candidates: [makeSubmission({ candidateText: "improved reporting" })],
    }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_removed_original_metric",
      severity: "error",
      values: ["10%"],
    }));
  });

  it("allows adding a metric from authorized evidence", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({
        requests: [makeRequest({ evidenceContexts: [makeEvidenceContext({ description: "delivered 42% faster reporting" })] })],
      }),
      candidates: [makeSubmission({ candidateText: "built reliable automation with 42% faster reporting" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unsupported_metric");
  });

  it("rejects adding an unsupported metric", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built reliable automation with 99%" })] }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_metric",
      severity: "error",
      values: ["99%"],
    }));
  });

  it("detects currency and unit metrics", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built reliable automation with $100 and 5 users" })] }));

    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unsupported_metric",
      values: ["$100", "5 users"],
    }));
  });

  it("does not count a date again as a metric", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "launched 2024-05-01" })] }),
      candidates: [makeSubmission({ candidateText: "launched 2024-05-01" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unsupported_metric");
    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_removed_original_metric");
  });

  it("marks removed original proper nouns for human review", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "OpenAI Platform improved flow" })] }),
      candidates: [makeSubmission({ candidateText: "improved flow" })],
    }));

    expect(result.results[0].status).toBe("human_review");
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_removed_original_proper_noun",
      severity: "review",
      values: ["OpenAI Platform"],
    }));
  });

  it("allows adding a proper noun from authorized evidence", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({
        requests: [makeRequest({ evidenceContexts: [makeEvidenceContext({ title: "OpenAI Platform" })] })],
      }),
      candidates: [makeSubmission({ candidateText: "built reliable OpenAI Platform automation" })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_added_unverified_proper_noun");
  });

  it("marks new unverified proper nouns for human review", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built reliable OpenAI Platform automation" })] }));

    expect(result.results[0].status).toBe("human_review");
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_added_unverified_proper_noun",
      severity: "review",
      values: ["OpenAI Platform"],
    }));
  });

  it("does not treat a single capitalized sentence-start word as a proper noun", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "Built reliable automation pipelines" })] }));

    expect(result.results[0].status).toBe("accepted");
  });

  it("marks exact unchanged candidate text for human review", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "built reliable pipelines" })] }),
      candidates: [makeSubmission({ candidateText: "built reliable pipelines" })],
    }));

    expect(result.results[0].status).toBe("human_review");
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_unchanged",
      severity: "review",
      values: [],
    }));
  });

  it("uses exact equality for unchanged rather than trim", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "built reliable pipelines" })] }),
      candidates: [makeSubmission({ candidateText: " built reliable pipelines " })],
    }));

    expect(result.results[0].findings.map((item) => item.code)).not.toContain("candidate_unchanged");
  });

  it("keeps candidate_unchanged alongside error findings when the unchanged text contains Markdown", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "# Heading" })] }),
      candidates: [makeSubmission({ candidateText: "# Heading" })],
    }));

    expect(result.results[0].status).toBe("rejected");
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_contains_markdown",
      severity: "error",
    }));
    expect(result.results[0].findings).toContainEqual(expect.objectContaining({
      code: "candidate_unchanged",
      severity: "review",
      values: [],
    }));
  });

  it("rejects incoherent finding code and severity", () => {
    expect(RewriteCandidateFindingSchema.safeParse(finding({ severity: "review" })).success).toBe(false);
    expect(
      RewriteCandidateFindingSchema.safeParse(finding({
        code: "candidate_unchanged",
        severity: "error",
        values: [],
      })).success,
    ).toBe(false);
  });

  it("rejects accepted results with findings", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "```code```" })] })).results[0];

    expect(RewriteCandidateValidationResultSchema.safeParse({ ...result, status: "accepted" }).success).toBe(false);
  });

  it("rejects rejected results without an error finding", () => {
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest({ originalText: "built reliable pipelines" })] }),
      candidates: [makeSubmission({ candidateText: "built reliable pipelines" })],
    })).results[0];

    expect(RewriteCandidateValidationResultSchema.safeParse({ ...result, status: "rejected" }).success).toBe(false);
  });

  it("rejects human_review results with an error finding", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "```code```" })] })).results[0];

    expect(RewriteCandidateValidationResultSchema.safeParse({ ...result, status: "human_review" }).success).toBe(false);
  });

  it("keeps validation result and batch schemas strict", () => {
    const result = validateRewriteCandidates(makeInput());

    expect(RewriteCandidateValidationResultSchema.safeParse({ ...result.results[0], unexpected: true }).success).toBe(false);
    expect(RewriteCandidateValidationBatchSchema.safeParse({ ...result, unexpected: true }).success).toBe(false);
  });

  it("rejects duplicate findings by id or code", () => {
    const first = finding({ findingId: "finding-a", code: "candidate_contains_markdown", values: ["```"] });
    const duplicateId = finding({ findingId: "finding-a", code: "candidate_added_unsupported_date", values: ["2024"] });
    const duplicateCode = finding({ findingId: "finding-b", code: "candidate_contains_markdown", values: ["~~~"] });
    const base = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built reliable automation" })] })).results[0];

    expect(RewriteCandidateValidationResultSchema.safeParse({ ...base, status: "rejected", findings: [first, duplicateId] }).success).toBe(false);
    expect(RewriteCandidateValidationResultSchema.safeParse({ ...base, status: "rejected", findings: [first, duplicateCode] }).success).toBe(false);
  });

  it("rejects findings in non-canonical order", () => {
    const first = finding({ findingId: "finding-a", code: "candidate_removed_original_metric", values: ["10%"] });
    const second = finding({ findingId: "finding-b", code: "candidate_added_unsupported_date", values: ["2024"] });
    const base = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "built reliable automation" })] })).results[0];

    expect(RewriteCandidateValidationResultSchema.safeParse({ ...base, status: "rejected", findings: [first, second] }).success).toBe(false);
  });

  it("rejects duplicate or unsorted finding values", () => {
    expect(RewriteCandidateFindingSchema.safeParse(finding({ values: ["2024", "2024"] })).success).toBe(false);
    expect(RewriteCandidateFindingSchema.safeParse(finding({ values: ["b", "a"] })).success).toBe(false);
  });

  it("rejects non-empty values for candidate_unchanged findings", () => {
    expect(
      RewriteCandidateFindingSchema.safeParse(finding({
        code: "candidate_unchanged",
        severity: "review",
        values: ["unchanged"],
      })).success,
    ).toBe(false);
  });

  it("generates deterministic IDs", () => {
    const result = validateRewriteCandidates(makeInput()).results[0];

    expect(result.candidateId).toBe("rewrite-candidate|offer=offer-1|profile=profile-1|document=resume-doc|request=request-a");
    expect(result.validationId).toBe("rewrite-validation|offer=offer-1|profile=profile-1|document=resume-doc|request=request-a");
  });

  it("encodes special IDs without collisions", () => {
    const requestA = "request / \u00d1:value|x & y=z?#%";
    const requestB = "request / \u00d1:value|x & y=other?#%";
    const batch = makeBatch({
      requests: [
        makeRequest({ requestId: requestA }),
        makeRequest({ requestId: requestB, proposalId: "proposal-b", actionId: "action-b", resolutionId: "resolution-b" }),
      ],
    });
    const result = validateRewriteCandidates(makeInput({
      generationBatch: batch,
      candidates: [
        makeSubmission({ requestId: requestA }),
        makeSubmission({ requestId: requestB, candidateText: "built reliable service" }),
      ],
    }));

    expect(result.results.some((item) => item.validationId.includes(encodeURIComponent(requestA)))).toBe(true);
    expect(new Set(result.results.map((item) => item.validationId)).size).toBe(2);
  });

  it("returns deepEqual for requests and submissions in different orders", () => {
    const requestA = makeRequest({ requestId: "request-a", proposalId: "proposal-a" });
    const requestB = makeRequest({ requestId: "request-b", proposalId: "proposal-b", actionId: "action-b", resolutionId: "resolution-b" });
    const first = makeInput({
      generationBatch: makeBatch({ requests: [requestB, requestA] }),
      candidates: [
        makeSubmission({ requestId: "request-b", candidateText: "built reliable service" }),
        makeSubmission({ requestId: "request-a", candidateText: "built reliable automation pipelines" }),
      ],
    });
    const second = makeInput({
      generationBatch: makeBatch({ requests: [requestA, requestB] }),
      candidates: [
        makeSubmission({ requestId: "request-a", candidateText: "built reliable automation pipelines" }),
        makeSubmission({ requestId: "request-b", candidateText: "built reliable service" }),
      ],
    });

    expect(validateRewriteCandidates(first)).toEqual(validateRewriteCandidates(second));
  });

  it("does not mutate inputs", () => {
    const input = makeInput();
    const before = JSON.stringify(input);

    validateRewriteCandidates(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input.generationBatch)).toBe(false);
    expect(Object.isFrozen(input.generationBatch.requests[0])).toBe(false);
    expect(Object.isFrozen(input.candidates)).toBe(false);
    expect(Object.isFrozen(input.candidates[0])).toBe(false);
  });

  it("accepts deeply frozen inputs", () => {
    const input = deepFreeze(makeInput());
    const result = validateRewriteCandidates(input);

    expect(result.results).toHaveLength(1);
    expect(Object.isFrozen(input)).toBe(true);
  });

  it("returns a deeply frozen output", () => {
    const result = validateRewriteCandidates(makeInput({ candidates: [makeSubmission({ candidateText: "```code```" })] }));
    const before = JSON.stringify(result);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.results)).toBe(true);
    expect(Object.isFrozen(result.results[0])).toBe(true);
    expect(Object.isFrozen(result.results[0].findings)).toBe(true);
    expect(Object.isFrozen(result.results[0].findings[0])).toBe(true);
    expect(Object.isFrozen(result.results[0].findings[0].values)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
    expect(() => result.results.push(result.results[0])).toThrow();
    expect(() => result.results[0].findings.push(result.results[0].findings[0])).toThrow();
    expect(() => result.results[0].findings[0].values.push("mutated")).toThrow();
    expect(() => Object.assign(result.summary, { totalFindings: 99 })).toThrow();
    expect(JSON.stringify(result)).toBe(before);
  });

  it("builds a coherent summary", () => {
    const requestB = makeRequest({ requestId: "request-b", proposalId: "proposal-b", actionId: "action-b", resolutionId: "resolution-b" });
    const result = validateRewriteCandidates(makeInput({
      generationBatch: makeBatch({ requests: [makeRequest(), requestB] }),
      candidates: [
        makeSubmission({ candidateText: "```code```" }),
        makeSubmission({ requestId: "request-b", candidateText: "built reliable service" }),
      ],
    }));

    expect(result.summary).toEqual({
      totalRequests: 2,
      totalCandidates: 2,
      accepted: 1,
      rejected: 1,
      humanReview: 0,
      totalFindings: 1,
    });
  });

  it("rejects incoherent summaries", () => {
    const result = validateRewriteCandidates(makeInput());

    expect(
      RewriteCandidateValidationBatchSchema.safeParse({
        ...result,
        summary: { ...result.summary, totalRequests: 99 },
      }).success,
    ).toBe(false);
  });

  it("does not use Date.now, random, UUID, network calls, provider, or LLM adapters", () => {
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

    const result = validateRewriteCandidates(makeInput());
    const serialized = JSON.stringify(result);

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

  it("documents accepted as deterministic validation rather than semantic approval", () => {
    const result = validateRewriteCandidates(makeInput());

    expect(result.results[0].status).toBe("accepted");
    expect(result.validationScope).toBe("deterministic_surface_checks_only");
  });
});
