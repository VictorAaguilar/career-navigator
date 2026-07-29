import { describe, expect, it, vi } from "vitest";
import { buildTailoringPlan, TailoringInputErrorCode } from "../../src/core/tailoring";
import type { JobMatchResult, RequirementMatchResult } from "../../src/core/matching";
import type { ScoringResult } from "../../src/core/scoring";
import type { Evidence, Offer, Profile } from "../../src/schemas";
import { TailoringActionSchema, TailoringPlanSchema } from "../../src/schemas";

const profile: Profile = {
  id: "profile-1",
  professionalTitle: "AI Engineer",
  location: { country: "Spain" },
  targetRoles: ["AI Engineer"],
  targetIndustries: ["technology"],
  professionalLevel: "senior",
};

const offer: Offer = {
  id: "offer-1",
  company: { name: "Acme AI" },
  title: "AI Engineer",
  location: { country: "Spain", remoteFriendly: true },
  modality: "remote",
  contract: "full-time",
  source: "fixture",
  description: "Build reliable AI automation systems.",
  responsibilities: ["Build deterministic matching workflows."],
  requirements: [
    {
      id: "req-met",
      originalText: "Python automation",
      category: "skill",
      isRequired: true,
      level: "advanced",
      competencyOrTool: "Python",
      extractionConfidence: 0.9,
      weight: 80,
    },
  ],
  status: "open",
};

const evidencePython: Evidence = {
  id: "evidence-python",
  type: "project",
  title: "Python automation platform",
  description: "Built deterministic automation pipelines with Python.",
  associatedCompetency: "Python",
  source: "project",
  declaredLevel: "advanced",
  verified: true,
  confidence: 0.95,
  tags: ["automation"],
};

const evidenceSql: Evidence = {
  ...evidencePython,
  id: "evidence-sql",
  title: "SQL analytics platform",
  associatedCompetency: "SQL",
  tags: ["analytics"],
};

const buildMatch = (overrides: Partial<RequirementMatchResult>): RequirementMatchResult => ({
  requirementId: overrides.requirementId ?? "req-met",
  category: overrides.category ?? "skill",
  status: overrides.status ?? "met",
  mandatory: overrides.mandatory ?? true,
  weight: overrides.weight ?? 80,
  matchedEvidenceIds: overrides.matchedEvidenceIds ?? ["evidence-python"],
  matchStrength: overrides.matchStrength ?? "exact",
  confidence: overrides.confidence ?? 0.9,
  explanation: overrides.explanation ?? "Requirement is supported by explicit evidence.",
  missingInformation: overrides.missingInformation ?? [],
  warnings: overrides.warnings ?? [],
});

const buildScore = (match: RequirementMatchResult): ScoringResult["requirementScores"][number] => ({
  requirementId: match.requirementId,
  requirementStatus: match.status,
  mandatory: match.mandatory,
  weight: match.weight,
  rawContribution: match.status === "unknown" || match.status === "not_met" ? 0 : match.weight,
  normalizedContribution: match.status === "unknown" || match.status === "not_met" ? 0 : match.weight,
  penalty: match.status === "not_met" ? 15 : match.status === "unknown" ? 5 : 0,
  confidence: match.confidence,
  explanation: `Scored ${match.requirementId}.`,
});

const buildJobMatch = (matches: RequirementMatchResult[], overrides: Partial<JobMatchResult> = {}): JobMatchResult => ({
  jobId: overrides.jobId ?? offer.id,
  profileId: overrides.profileId ?? profile.id,
  requirementMatches: overrides.requirementMatches ?? matches,
  totalRequirements: matches.length,
  metRequirements: matches.filter((match) => match.status === "met").length,
  partiallyMetRequirements: matches.filter((match) => match.status === "partially_met").length,
  notMetRequirements: matches.filter((match) => match.status === "not_met").length,
  unknownRequirements: matches.filter((match) => match.status === "unknown").length,
  generatedAt: "2026-01-01T00:00:00.000Z",
  warnings: overrides.warnings ?? [],
});

const buildScoring = (matches: RequirementMatchResult[], overrides: Partial<ScoringResult> = {}): ScoringResult => {
  const requirementScores = overrides.requirementScores ?? matches.map(buildScore);
  return {
    jobId: overrides.jobId ?? offer.id,
    profileId: overrides.profileId ?? profile.id,
    score: overrides.score ?? (matches.length === 0 ? 0 : 75),
    scoreScale: "0-100",
    classification: overrides.classification ?? (matches.length === 0 ? "insufficient_information" : "strong_match"),
    requirementScores,
    mandatoryRequirementSummary: {
      count: matches.filter((match) => match.mandatory).length,
      met: matches.filter((match) => match.mandatory && match.status === "met").length,
      partiallyMet: matches.filter((match) => match.mandatory && match.status === "partially_met").length,
      notMet: matches.filter((match) => match.mandatory && match.status === "not_met").length,
      unknown: matches.filter((match) => match.mandatory && match.status === "unknown").length,
      totalPotential: matches.filter((match) => match.mandatory).reduce((sum, match) => sum + match.weight, 0),
    },
    optionalRequirementSummary: {
      count: matches.filter((match) => !match.mandatory).length,
      met: matches.filter((match) => !match.mandatory && match.status === "met").length,
      partiallyMet: matches.filter((match) => !match.mandatory && match.status === "partially_met").length,
      notMet: matches.filter((match) => !match.mandatory && match.status === "not_met").length,
      unknown: matches.filter((match) => !match.mandatory && match.status === "unknown").length,
      totalPotential: matches.filter((match) => !match.mandatory).reduce((sum, match) => sum + match.weight, 0),
    },
    confidence: overrides.confidence ?? (matches.length === 0 ? 0.1 : 0.8),
    strengths: overrides.strengths ?? [],
    gaps: overrides.gaps ?? [],
    unknowns: overrides.unknowns ?? [],
    warnings: overrides.warnings ?? [],
    scoringVersion: overrides.scoringVersion ?? "1.0.0",
  };
};

function buildPlan(
  matches: RequirementMatchResult[],
  options: {
    evidences?: Evidence[];
    jobMatchResult?: JobMatchResult;
    scoringResult?: ScoringResult;
  } = {},
) {
  return buildTailoringPlan({
    offer,
    profile,
    evidences: options.evidences ?? [evidencePython],
    jobMatchResult: options.jobMatchResult ?? buildJobMatch(matches),
    scoringResult: options.scoringResult ?? buildScoring(matches),
  });
}

describe("CV Tailoring deterministic planner", () => {
  it("valida un esquema de plan correcto", () => {
    const plan = buildPlan([buildMatch({})]);

    expect(TailoringPlanSchema.parse(plan)).toEqual(plan);
  });

  it("rechaza record_gap como TailoringAction", () => {
    const result = TailoringActionSchema.safeParse({
      actionId: "action-invalid",
      type: "record_gap",
      targetSection: "skills",
      requirementIds: ["req-met"],
      evidenceIds: ["evidence-python"],
      reason: "Invalid action type.",
      supportStatus: "supported",
      priority: "high",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza request_confirmation como TailoringAction", () => {
    const result = TailoringActionSchema.safeParse({
      actionId: "action-invalid",
      type: "request_confirmation",
      targetSection: "skills",
      requirementIds: ["req-met"],
      evidenceIds: ["evidence-python"],
      reason: "Invalid action type.",
      supportStatus: "supported",
      priority: "high",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza una accion positiva sin requirementIds", () => {
    const result = TailoringActionSchema.safeParse({
      actionId: "action-invalid",
      type: "highlight_evidence",
      targetSection: "skills",
      requirementIds: [],
      evidenceIds: ["evidence-python"],
      reason: "Invalid positive action.",
      supportStatus: "supported",
      priority: "high",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza una accion positiva sin evidenceIds", () => {
    const result = TailoringActionSchema.safeParse({
      actionId: "action-invalid",
      type: "highlight_evidence",
      targetSection: "skills",
      requirementIds: ["req-met"],
      evidenceIds: [],
      reason: "Invalid positive action.",
      supportStatus: "supported",
      priority: "high",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza supportStatus incoherente en TailoringAction", () => {
    const result = TailoringActionSchema.safeParse({
      actionId: "action-invalid",
      type: "highlight_evidence",
      targetSection: "skills",
      requirementIds: ["req-met"],
      evidenceIds: ["evidence-python"],
      reason: "Invalid support status.",
      supportStatus: "needs_confirmation",
      priority: "high",
    });

    expect(result.success).toBe(false);
  });

  it("falla con codigo estable ante mismatch de jobId", () => {
    const matches = [buildMatch({})];
    expect(() => buildPlan(matches, { jobMatchResult: buildJobMatch(matches, { jobId: "other-job" }) })).toThrow(TailoringInputErrorCode.JobIdMismatch);
    expect(() => buildPlan(matches, { scoringResult: buildScoring(matches, { jobId: "other-job" }) })).toThrow(TailoringInputErrorCode.JobIdMismatch);
  });

  it("falla con codigo estable ante mismatch de profileId", () => {
    const matches = [buildMatch({})];
    expect(() => buildPlan(matches, { jobMatchResult: buildJobMatch(matches, { profileId: "other-profile" }) })).toThrow(TailoringInputErrorCode.ProfileIdMismatch);
    expect(() => buildPlan(matches, { scoringResult: buildScoring(matches, { profileId: "other-profile" }) })).toThrow(TailoringInputErrorCode.ProfileIdMismatch);
  });

  it("falla si los requirementIds difieren entre matching y scoring", () => {
    const matches = [buildMatch({ requirementId: "req-a" })];
    const scoring = buildScoring(matches, {
      requirementScores: [buildScore(buildMatch({ requirementId: "req-b" }))],
    });

    expect(() => buildPlan(matches, { scoringResult: scoring })).toThrow(TailoringInputErrorCode.RequirementSetMismatch);
  });

  it("falla si el status difiere entre matching y scoring", () => {
    const match = buildMatch({ requirementId: "req-a", status: "met" });
    const scoring = buildScoring([match], {
      requirementScores: [{ ...buildScore(match), requirementStatus: "partially_met" }],
    });

    expect(() => buildPlan([match], { scoringResult: scoring })).toThrow(TailoringInputErrorCode.RequirementStatusMismatch);
  });

  it("falla si hay requirementMatch duplicado", () => {
    const matches = [
      buildMatch({ requirementId: "req-a" }),
      buildMatch({ requirementId: "req-a" }),
    ];

    expect(() => buildPlan(matches)).toThrow(TailoringInputErrorCode.DuplicateMatch);
  });

  it("falla si hay requirementScore duplicado", () => {
    const matches = [buildMatch({ requirementId: "req-a" })];
    const score = buildScore(matches[0]);
    const scoring = buildScoring(matches, { requirementScores: [score, score] });

    expect(() => buildPlan(matches, { scoringResult: scoring })).toThrow(TailoringInputErrorCode.DuplicateScore);
  });

  it("genera una accion trazable para un requisito met con evidencia", () => {
    const plan = buildPlan([buildMatch({ status: "met" })]);

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      type: "highlight_evidence",
      requirementIds: ["req-met"],
      evidenceIds: ["evidence-python"],
      supportStatus: "supported",
      priority: "high",
    });
    expect(plan.gaps).toHaveLength(0);
    expect(plan.reviewItems).toHaveLength(0);
  });

  it("mantiene trazabilidad para partially_met con prioridad inferior a met", () => {
    const plan = buildPlan([
      buildMatch({ requirementId: "req-met", status: "met" }),
      buildMatch({ requirementId: "req-partial", status: "partially_met", missingInformation: ["Explicit years are missing."] }),
    ]);

    expect(plan.actions.map((action) => action.requirementIds[0])).toEqual(["req-met", "req-partial"]);
    expect(plan.actions[0].priority).toBe("high");
    expect(plan.actions[1]).toMatchObject({
      supportStatus: "partially_supported",
      priority: "medium",
      evidenceIds: ["evidence-python"],
    });
  });

  it("convierte not_met en gap sin afirmacion positiva", () => {
    const plan = buildPlan([
      buildMatch({ requirementId: "req-gap", status: "not_met", matchedEvidenceIds: [], matchStrength: "none", missingInformation: ["No evidence found."] }),
    ]);

    expect(plan.actions).toHaveLength(0);
    expect(plan.gaps).toHaveLength(1);
    expect(plan.gaps[0]).toMatchObject({
      requirementId: "req-gap",
      supportStatus: "unsupported",
      missingInformation: ["No evidence found."],
    });
  });

  it("convierte unknown en revision o solicitud de confirmacion", () => {
    const plan = buildPlan([
      buildMatch({ requirementId: "req-unknown", status: "unknown", matchedEvidenceIds: [], matchStrength: "unknown", missingInformation: ["Language level is missing."] }),
    ]);

    expect(plan.actions).toHaveLength(0);
    expect(plan.reviewItems).toHaveLength(1);
    expect(plan.reviewItems[0]).toMatchObject({
      requirementId: "req-unknown",
      supportStatus: "needs_confirmation",
      requestedInformation: ["Language level is missing."],
    });
  });

  it("maneja una mezcla de estados en colecciones separadas", () => {
    const plan = buildPlan([
      buildMatch({ requirementId: "req-met", status: "met" }),
      buildMatch({ requirementId: "req-partial", status: "partially_met" }),
      buildMatch({ requirementId: "req-gap", status: "not_met", matchedEvidenceIds: [] }),
      buildMatch({ requirementId: "req-unknown", status: "unknown", matchedEvidenceIds: [] }),
    ]);

    expect(plan.summary).toMatchObject({
      supportedRequirements: 1,
      partiallySupportedRequirements: 1,
      unsupportedRequirements: 1,
      unknownRequirements: 1,
      actionCount: 2,
      gapCount: 1,
      reviewItemCount: 1,
    });
  });

  it("deduplica y ordena evidenceIds antes de generar acciones e IDs", () => {
    const plan = buildPlan([
      buildMatch({ matchedEvidenceIds: ["evidence-sql", "evidence-python", "evidence-sql"] }),
    ], { evidences: [evidenceSql, evidencePython] });

    expect(plan.actions[0].evidenceIds).toEqual(["evidence-python", "evidence-sql"]);
    expect(plan.actions[0].actionId).toContain("evidence=evidence-python,evidence-sql");
  });

  it("no permite que una evidenceId inexistente sustente una accion", () => {
    const plan = buildPlan([
      buildMatch({ requirementId: "req-met", status: "met", matchedEvidenceIds: ["missing-evidence"] }),
    ]);

    expect(plan.actions).toHaveLength(0);
    expect(plan.reviewItems).toHaveLength(1);
    expect(plan.warnings).toContain('Evidence "missing-evidence" referenced by requirement "req-met" was not provided.');
  });

  it("usa solo evidenceIds validas cuando hay referencias validas e invalidas", () => {
    const plan = buildPlan([
      buildMatch({ requirementId: "req-met", status: "met", matchedEvidenceIds: ["missing-evidence", "evidence-python"] }),
    ]);

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].evidenceIds).toEqual(["evidence-python"]);
    expect(plan.warnings).toContain('Evidence "missing-evidence" referenced by requirement "req-met" was not provided.');
  });

  it("produce deepEqual con entradas semanticamente equivalentes en orden inverso", () => {
    const matches = [
      buildMatch({ requirementId: "req-c", status: "unknown", matchedEvidenceIds: [] }),
      buildMatch({ requirementId: "req-a", status: "met", matchedEvidenceIds: ["evidence-sql", "evidence-python"] }),
      buildMatch({ requirementId: "req-b", status: "not_met", matchedEvidenceIds: [] }),
    ];
    const reversedMatches = [...matches].reverse();
    const reversedScores = reversedMatches.map(buildScore).reverse();

    const first = buildTailoringPlan({
      offer,
      profile,
      evidences: [evidenceSql, evidencePython],
      jobMatchResult: buildJobMatch(matches, { warnings: ["z warning", "a warning"] }),
      scoringResult: buildScoring(matches, { requirementScores: matches.map(buildScore).reverse(), warnings: ["score z", "score a"] }),
    });
    const second = buildTailoringPlan({
      offer,
      profile,
      evidences: [evidencePython, evidenceSql],
      jobMatchResult: buildJobMatch(reversedMatches, { warnings: ["a warning", "z warning"] }),
      scoringResult: buildScoring(reversedMatches, { requirementScores: reversedScores, warnings: ["score a", "score z"] }),
    });

    expect(second).toEqual(first);
    expect(first.actions.map((action) => action.requirementIds[0])).toEqual(["req-a"]);
    expect(first.gaps.map((gap) => gap.requirementId)).toEqual(["req-b"]);
    expect(first.reviewItems.map((item) => item.requirementId)).toEqual(["req-c"]);
    expect(first.warnings).toEqual(["a warning", "score a", "score z", "z warning"]);
  });

  it("genera IDs canonicos sin colisionar con guiones barras dos puntos o separadores", () => {
    const firstMatch = buildMatch({
      requirementId: "req-a-b",
      status: "met",
      matchedEvidenceIds: ["c"],
    });
    const secondMatch = buildMatch({
      requirementId: "req-a",
      status: "met",
      matchedEvidenceIds: ["b-c"],
    });
    const specialMatch = buildMatch({
      requirementId: "req/a:b|c",
      status: "met",
      matchedEvidenceIds: ["ev/a:b|c"],
    });
    const firstEvidence = { ...evidencePython, id: "c" };
    const secondEvidence = { ...evidencePython, id: "b-c" };
    const specialEvidence = { ...evidencePython, id: "ev/a:b|c" };
    const plan = buildPlan([secondMatch, specialMatch, firstMatch], {
      evidences: [specialEvidence, secondEvidence, firstEvidence],
    });

    const actionIds = plan.actions.map((action) => action.actionId);
    expect(new Set(actionIds).size).toBe(actionIds.length);
    expect(actionIds).toContain("action|offer=offer-1|profile=profile-1|requirement=req%2Fa%3Ab%7Cc|status=met|type=highlight_evidence|evidence=ev%2Fa%3Ab%7Cc");
  });

  it("genera IDs deterministas desde datos estables", () => {
    const plan = buildPlan([buildMatch({ requirementId: "req-met", status: "met" })]);

    expect(plan.actions[0].actionId).toBe("action|offer=offer-1|profile=profile-1|requirement=req-met|status=met|type=highlight_evidence|evidence=evidence-python");
  });

  it("produce deepEqual para dos ejecuciones identicas", () => {
    const matches = [
      buildMatch({ requirementId: "req-met", status: "met" }),
      buildMatch({ requirementId: "req-gap", status: "not_met", matchedEvidenceIds: [] }),
    ];

    expect(buildPlan(matches)).toEqual(buildPlan(matches));
  });

  it("no muta las entradas", () => {
    const matches = [buildMatch({ requirementId: "req-met", status: "met", matchedEvidenceIds: ["evidence-python", "evidence-python"] })];
    const input = {
      offer,
      profile,
      evidences: [evidencePython],
      jobMatchResult: buildJobMatch(matches),
      scoringResult: buildScoring(matches),
    };
    const before = JSON.stringify(input);

    buildTailoringPlan(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it("no contiene timestamps ni depende de Date.now", () => {
    const matches = [buildMatch({ requirementId: "req-met", status: "met" })];

    vi.useFakeTimers();
    const dateNowSpy = vi.spyOn(Date, "now");
    try {
      vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
      const first = buildPlan(matches);

      vi.setSystemTime(new Date("2099-12-31T23:59:59.000Z"));
      const second = buildPlan(matches);

      expect(second).toEqual(first);
      expect(JSON.stringify(first)).not.toContain("generatedAt");
      expect(JSON.stringify(first)).not.toContain("2000-01-01");
      expect(dateNowSpy).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("maneja entrada vacia sin acciones", () => {
    const plan = buildPlan([]);

    expect(plan).toMatchObject({
      offerId: "offer-1",
      profileId: "profile-1",
      actions: [],
      gaps: [],
      reviewItems: [],
      warnings: [],
    });
    expect(plan.summary.totalRequirements).toBe(0);
  });

  it("no acepta generatedAt beforeText ni afterText en el plan", () => {
    const plan = buildPlan([buildMatch({})]);
    const result = TailoringPlanSchema.safeParse({
      ...plan,
      generatedAt: "2026-01-01T00:00:00.000Z",
      actions: [
        {
          ...plan.actions[0],
          beforeText: "Original CV text is outside this increment.",
          afterText: "Rewritten CV text is outside this increment.",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
