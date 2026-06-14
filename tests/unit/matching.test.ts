import { describe, expect, it } from "vitest";
import { evaluateJobRequirements, matchRequirement } from "../../src/core/matching";
import type { Evidence, Offer, Profile, Requirement } from "../../src/schemas";

const profile: Profile = {
  id: "profile-01",
  professionalTitle: "Data Engineer",
  location: { country: "Spain" },
  targetRoles: ["Data Engineer"],
  targetIndustries: ["technology"],
  professionalLevel: "mid",
  languages: ["English", "Spanish"],
};

const evidencePython: Evidence = {
  id: "evidence-python",
  type: "project",
  title: "Automatización con Python",
  description: "Desarrollé pipelines con Python y Airflow.",
  associatedCompetency: "Python",
  source: "project",
  declaredLevel: "advanced",
  date: "2025-01-01",
  verified: true,
  confidence: 0.95,
  tags: ["data analysis"],
};

const evidenceTag: Evidence = {
  id: "evidence-tag",
  type: "experience",
  title: "Análisis de datos",
  description: "Trabajé con análisis de datos y modelado estadístico.",
  source: "cv",
  declaredLevel: "intermediate",
  date: "2024-06-01",
  verified: false,
  confidence: 0.75,
  tags: ["data analysis", "statistics", "python"],
};

const evidenceCertification: Evidence = {
  id: "evidence-cert",
  type: "certification",
  title: "Certified Data Professional",
  description: "Certificación oficial en gestión de datos.",
  source: "certification",
  declaredLevel: "advanced",
  date: "2024-03-01",
  verified: true,
  confidence: 0.9,
};

const evidenceEducation: Evidence = {
  id: "evidence-edu",
  type: "education",
  title: "Ingeniería Informática",
  description: "Grado en Ingeniería Informática.",
  source: "education",
  declaredLevel: "advanced",
  date: "2023-06-01",
  verified: true,
  confidence: 0.85,
};

const genericJob: Offer = {
  id: "job-01",
  company: { name: "Generic Company" },
  title: "Data Engineer Role",
  location: { country: "Spain" },
  modality: "remote",
  contract: "full-time",
  source: "internal",
  url: "https://example.com/job-01",
  description: "Oferta genérica para prueba de matching.",
  responsibilities: ["Desarrollar soluciones de datos."],
  requirements: [],
  status: "open",
};

describe("Deterministic requirement-evidence matching", () => {
  it("coincide exactamente una competencia", () => {
    const requirement: Requirement = {
      id: "req-01",
      originalText: "Python",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "Python",
      extractionConfidence: 0.9,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidencePython], profile);
    expect(result.status).toBe("met");
    expect(result.matchStrength).toBe("exact");
    expect(result.matchedEvidenceIds).toEqual(["evidence-python"]);
  });

  it("coincide sin distinguir mayúsculas", () => {
    const requirement: Requirement = {
      id: "req-02",
      originalText: "python",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "python",
      extractionConfidence: 0.9,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidencePython], profile);
    expect(result.status).toBe("met");
    expect(result.matchStrength).toBe("exact");
  });

  it("coincide mediante etiqueta", () => {
    const requirement: Requirement = {
      id: "req-03",
      originalText: "data analysis",
      category: "skill",
      isRequired: true,
      level: "basic",
      competencyOrTool: "data analysis",
      extractionConfidence: 0.8,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidenceTag], profile);
    expect(result.status).toBe("met");
    expect(result.matchStrength).toBe("strong");
  });

  it("cumple un requisito con nivel inferior requerido", () => {
    const requirement: Requirement = {
      id: "req-04",
      originalText: "Python",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "Python",
      extractionConfidence: 0.95,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidencePython], profile);
    expect(result.status).toBe("met");
    expect(result.matchStrength).toBe("exact");
  });

  it("requiere un nivel superior parcialmente cumplido", () => {
    const requirement: Requirement = {
      id: "req-05",
      originalText: "Python",
      category: "skill",
      isRequired: true,
      level: "expert",
      competencyOrTool: "Python",
      extractionConfidence: 0.95,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidencePython], profile);
    expect(result.status).toBe("partially_met");
    expect(result.missingInformation).toContain("El nivel de la evidencia es inferior al requerido.");
  });

  it("maneja años de experiencia sin información suficiente", () => {
    const requirement: Requirement = {
      id: "req-06",
      originalText: "Experiencia en Python",
      category: "experience",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "Python",
      yearsExperience: 3,
      extractionConfidence: 0.9,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidencePython], profile);
    expect(result.status).toBe("partially_met");
    expect(result.missingInformation).toContain("No hay información explícita de años de experiencia disponible.");
  });

  it("coincide idioma existente sin certificación exigida", () => {
    const requirement: Requirement = {
      id: "req-07",
      originalText: "English",
      category: "language",
      isRequired: true,
      level: "intermediate",
      language: "English",
      extractionConfidence: 0.85,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidenceCertification], profile);
    expect(result.status).toBe("partially_met");
    expect(result.missingInformation).toContain("No hay información explícita de nivel de idioma en el perfil.");
  });

  it("rechaza una certificación obligatoria ausente", () => {
    const requirement: Requirement = {
      id: "req-08",
      originalText: "Certified Data Professional",
      category: "certification",
      isRequired: true,
      level: "advanced",
      certification: "Certified Data Professional",
      extractionConfidence: 0.95,
      weight: 80,
    };

    const result = matchRequirement(requirement, [evidencePython], profile);
    expect(result.status).toBe("not_met");
    expect(result.matchedEvidenceIds).toEqual([]);
  });

  it("informa requisito sin evidencia", () => {
    const requirement: Requirement = {
      id: "req-09",
      originalText: "Tableau",
      category: "tool",
      isRequired: true,
      level: "basic",
      competencyOrTool: "Tableau",
      extractionConfidence: 0.7,
      weight: 40,
    };

    const result = matchRequirement(requirement, [evidencePython, evidenceTag], profile);
    expect(result.status).toBe("not_met");
    expect(result.explanation).toContain("No se encontró evidencia suficiente");
  });

  it("detecta información insuficiente para decisión", () => {
    const requirement: Requirement = {
      id: "req-10",
      originalText: "Certificate in Data Ethics",
      category: "certification",
      isRequired: true,
      level: "intermediate",
      certification: "Data Ethics Certificate",
      extractionConfidence: 0.8,
      weight: 60,
    };

    const result = matchRequirement(requirement, [evidenceCertification], profile);
    expect(result.status).toBe("not_met");
  });

  it("permite varias evidencias para un requisito", () => {
    const requirement: Requirement = {
      id: "req-11",
      originalText: "Data analysis",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "data analysis",
      extractionConfidence: 0.9,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidenceTag, evidencePython], profile);
    expect(result.status).toBe("met");
    expect(result.matchedEvidenceIds).toEqual(["evidence-tag", "evidence-python"]);
  });

  it("usa una evidencia en múltiples requisitos legítimamente", () => {
    const requirementA: Requirement = {
      id: "req-12a",
      originalText: "Python",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "Python",
      extractionConfidence: 0.9,
      weight: 50,
    };
    const requirementB: Requirement = {
      id: "req-12b",
      originalText: "Automatización con Python",
      category: "tool",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "Python",
      extractionConfidence: 0.9,
      weight: 50,
    };

    const resultA = matchRequirement(requirementA, [evidencePython], profile);
    const resultB = matchRequirement(requirementB, [evidencePython], profile);

    expect(resultA.matchedEvidenceIds).toEqual(["evidence-python"]);
    expect(resultB.matchedEvidenceIds).toEqual(["evidence-python"]);
  });

  it("mantiene el orden de los requisitos en el resultado de la oferta", () => {
    const offer: Offer = {
      ...genericJob,
      requirements: [
        {
          id: "req-a",
          originalText: "Python",
          category: "skill",
          isRequired: true,
          level: "intermediate",
          competencyOrTool: "Python",
          extractionConfidence: 0.9,
          weight: 50,
        },
        {
          id: "req-b",
          originalText: "English",
          category: "language",
          isRequired: true,
          level: "basic",
          language: "English",
          extractionConfidence: 0.8,
          weight: 50,
        },
      ],
    };

    const result = evaluateJobRequirements(profile, offer, [evidencePython]);
    expect(result.requirementMatches.map((match) => match.requirementId)).toEqual(["req-a", "req-b"]);
  });

  it("no muta el perfil ni la oferta durante la evaluación", () => {
    const originalProfile = JSON.stringify(profile);
    const offer: Offer = {
      ...genericJob,
      requirements: [
        {
          id: "req-c",
          originalText: "Python",
          category: "skill",
          isRequired: true,
          level: "intermediate",
          competencyOrTool: "Python",
          extractionConfidence: 0.9,
          weight: 50,
        },
      ],
    };
    const originalOffer = JSON.stringify(offer);

    evaluateJobRequirements(profile, offer, [evidencePython]);

    expect(JSON.stringify(profile)).toBe(originalProfile);
    expect(JSON.stringify(offer)).toBe(originalOffer);
  });

  it("no inventa evidencias ni competencias", () => {
    const requirement: Requirement = {
      id: "req-13",
      originalText: "Scala",
      category: "skill",
      isRequired: true,
      level: "intermediate",
      competencyOrTool: "Scala",
      extractionConfidence: 0.9,
      weight: 50,
    };

    const result = matchRequirement(requirement, [evidencePython, evidenceTag], profile);
    expect(result.matchedEvidenceIds).toEqual([]);
    expect(result.status).toBe("not_met");
  });
});
