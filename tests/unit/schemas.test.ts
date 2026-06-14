import { describe, expect, it } from "vitest";
import { EvidenceSchema, OfferSchema, ProfileSchema, RequirementSchema } from "../../src/schemas";
import { juniorProfile } from "../fixtures/profile-junior";
import { seniorProfile } from "../fixtures/profile-senior";
import { technicalJob } from "../fixtures/job-technical";
import { administrativeJob } from "../fixtures/job-administrative";
import { validEvidence } from "../fixtures/evidence-valid";
import { invalidEvidenceHighConfidence, invalidProfileMissingTitle, invalidRequirementBadCategory, profileWithExtraFields } from "../fixtures/invalid-data";

describe("Schemas de datos universales", () => {
  it("valida un perfil junior válido", () => {
    const parsed = ProfileSchema.parse(juniorProfile);
    expect(parsed.professionalTitle).toBe("Junior Data Analyst");
    expect(parsed.targetRoles).toContain("Data Analyst");
  });

  it("valida un perfil senior válido", () => {
    expect(ProfileSchema.parse(seniorProfile).professionalLevel).toBe("senior");
  });

  it("rechaza un perfil inválido sin título profesional", () => {
    const result = ProfileSchema.safeParse(invalidProfileMissingTitle);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("professionalTitle") || issue.path.includes("professional_title") || issue.path.includes("title"))).toBe(true);
  });

  it("acepta un perfil con datos adicionales desconocidos", () => {
    const parsed = ProfileSchema.parse(profileWithExtraFields);
    expect(parsed.extraField).toBe("valor adicional");
  });

  it("valida una evidencia válida", () => {
    const parsed = EvidenceSchema.parse(validEvidence);
    expect(parsed.title).toBe("Automatización de informes de ventas");
    expect(parsed.confidence).toBeCloseTo(0.92);
  });

  it("rechaza una evidencia con confianza fuera de rango", () => {
    const result = EvidenceSchema.safeParse(invalidEvidenceHighConfidence);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("no puede ser mayor que 1");
  });

  it("valida una oferta técnica válida", () => {
    const parsed = OfferSchema.parse(technicalJob);
    expect(parsed.company.name).toBe("Tech Solutions Ltd.");
    expect(parsed.requirements.length).toBeGreaterThan(0);
  });

  it("valida una oferta administrativa válida", () => {
    expect(OfferSchema.parse(administrativeJob).status).toBe("open");
  });

  it("valida un requisito válido", () => {
    const parsed = RequirementSchema.parse({
      id: "req-test-01",
      originalText: "Experiencia en gestión de proyectos.",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "gestión de proyectos",
      extractionConfidence: 0.9,
      weight: 70,
    });
    expect(parsed.category).toBe("skill");
  });

  it("rechaza un requisito con categoría no permitida", () => {
    const result = RequirementSchema.safeParse(invalidRequirementBadCategory);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("Invalid enum value");
  });

  it("garantiza que no se añaden competencias automáticamente cuando no están declaradas", () => {
    const trimmed = {
      id: "profile-autoskill-01",
      professionalTitle: "Especialista en datos",
      location: { country: "Spain" },
      targetRoles: ["Data Specialist"],
      targetIndustries: ["technology"],
      professionalLevel: "mid",
    };
    const parsed = ProfileSchema.parse(trimmed);
    expect(parsed.competencies).toBeUndefined();
  });
});
