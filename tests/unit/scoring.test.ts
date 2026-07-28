import { describe, expect, it } from "vitest";
import { calculateGlobalConfidence, classifyScore, scoreRequirementMatch, scoreTraceabilityResult } from "../../src/core/scoring";
import type { RequirementMatchResult } from "../../src/core/matching/types";

const buildMatch = (overrides: Partial<RequirementMatchResult>): RequirementMatchResult => ({
  requirementId: overrides.requirementId ?? "req-01",
  category: overrides.category ?? "skill",
  status: overrides.status ?? "met",
  mandatory: overrides.mandatory ?? true,
  weight: overrides.weight ?? 50,
  matchedEvidenceIds: overrides.matchedEvidenceIds ?? ["evidence-01"],
  matchStrength: overrides.matchStrength ?? "exact",
  confidence: overrides.confidence ?? 0.9,
  explanation: overrides.explanation ?? "Evidencia explícita de alto nivel.",
  missingInformation: overrides.missingInformation ?? [],
  warnings: overrides.warnings ?? [],
});

describe("Reproducible scoring engine", () => {
  it("puntúa 100 cuando todos los requisitos están cumplidos", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 50, mandatory: true }),
      buildMatch({ requirementId: "req-2", weight: 40, mandatory: false }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.score).toBe(100);
    expect(result.classification).toBe("excellent_match");
    expect(result.requirementScores.length).toBe(2);
    expect(result.strengths.length).toBe(2);
  });

  it("mezcla met y partially_met con resultado moderado o fuerte", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 80, mandatory: true, status: "met" }),
      buildMatch({ requirementId: "req-2", weight: 50, mandatory: true, status: "partially_met", confidence: 0.8, matchStrength: "partial", explanation: "Parcial por nivel inferior." }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(100);
    expect(["strong_match", "moderate_match"]).toContain(result.classification);
  });

  it("aplica penalización por requisito obligatorio no cumplido", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 100, mandatory: true, status: "not_met", explanation: "No se encontró evidencia." }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.score).toBe(0);
    expect(result.gaps.some((gap) => gap.requirementId === "req-1")).toBe(true);
  });

  it("no penaliza requisitos opcionales no cumplidos", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 100, mandatory: false, status: "not_met" }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.score).toBe(0);
    expect(result.gaps.length).toBe(1);
    expect(result.mandatoryRequirementSummary.count).toBe(0);
    expect(result.optionalRequirementSummary.count).toBe(1);
  });

  it("penaliza más una certificación obligatoria ausente", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 100, mandatory: true, status: "not_met", explanation: "No se encontró certificación requerida." }),
    ];
    const score = scoreRequirementMatch(matches[0]).normalizedContribution;

    expect(score).toBe(0);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("trata autorización laboral desconocida sin asignar puntos automáticos", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 100, mandatory: true, status: "unknown", confidence: 0.4, explanation: "No hay datos de autorización laboral." }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.classification).toBe("insufficient_information");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(50);
    expect(result.unknowns.length).toBe(1);
  });

  it("maneja una oferta sin requisitos", () => {
    const result = scoreTraceabilityResult("profile-1", "job-1", []);

    expect(result.score).toBe(0);
    expect(result.classification).toBe("insufficient_information");
    expect(result.confidence).toBe(0.1);
  });

  it("clasifica como insufficient_information con todos los requisitos unknown", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", status: "unknown", mandatory: true, confidence: 0.3 }),
      buildMatch({ requirementId: "req-2", status: "unknown", mandatory: false, confidence: 0.2 }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.classification).toBe("insufficient_information");
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("limita el score al rango 0-100", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 200, mandatory: true, status: "met", confidence: 1 }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("clasificación correcta en umbrales definidos", () => {
    expect(classifyScore(90, 0)).toBe("excellent_match");
    expect(classifyScore(75, 0)).toBe("strong_match");
    expect(classifyScore(55, 0)).toBe("moderate_match");
    expect(classifyScore(20, 0)).toBe("weak_match");
    expect(classifyScore(20, 0.6)).toBe("insufficient_information");
  });

  it("confianza alta con evidencias claras", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", status: "met", confidence: 0.95 }),
      buildMatch({ requirementId: "req-2", status: "met", confidence: 0.9 }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("confianza baja con muchos unknown", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", status: "unknown", confidence: 0.3 }),
      buildMatch({ requirementId: "req-2", status: "unknown", confidence: 0.2 }),
      buildMatch({ requirementId: "req-3", status: "met", confidence: 0.6 }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.confidence).toBeLessThan(0.6);
  });

  it("admite pesos personalizados y los normaliza", () => {
    const matches = [
      buildMatch({ requirementId: "req-1", weight: 150, mandatory: true, status: "met", confidence: 0.9 }),
    ];
    const score = scoreRequirementMatch(matches[0]);

    expect(score.weight).toBe(100);
    expect(score.rawContribution).toBe(120);
    expect(score.normalizedContribution).toBe(100);
  });

  it("preserva el orden de entradas en requirementScores", () => {
    const matches = [
      buildMatch({ requirementId: "req-1" }),
      buildMatch({ requirementId: "req-2" }),
    ];
    const result = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(result.requirementScores.map((item) => item.requirementId)).toEqual(["req-1", "req-2"]);
  });

  it("no muta los datos de entrada", () => {
    const matches = [
      buildMatch({ requirementId: "req-1" }),
      buildMatch({ requirementId: "req-2" }),
    ];
    const copy = JSON.stringify(matches);

    scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(JSON.stringify(matches)).toBe(copy);
  });

  it("es determinista y produce el mismo resultado con la misma entrada", () => {
    const matches = [
      buildMatch({ requirementId: "req-1" }),
      buildMatch({ requirementId: "req-2", status: "partially_met" }),
    ];
    const first = scoreTraceabilityResult("profile-1", "job-1", matches);
    const second = scoreTraceabilityResult("profile-1", "job-1", matches);

    expect(first).toEqual(second);
  });

  it("no asigna puntos sin evidencia a requisitos not_met", () => {
    const match = buildMatch({ requirementId: "req-1", status: "not_met", mandatory: true, weight: 80, confidence: 0.5 });
    const score = scoreRequirementMatch(match);

    expect(score.normalizedContribution).toBe(0);
  });

  it("no trata unknown como not_met automáticamente", () => {
    const match = buildMatch({ requirementId: "req-1", status: "unknown", mandatory: true, weight: 80, confidence: 0.5, explanation: "Información insuficiente." });
    const score = scoreRequirementMatch(match);

    expect(score.rawContribution).toBeGreaterThan(0);
    expect(score.normalizedContribution).toBeGreaterThanOrEqual(0);
  });
});
