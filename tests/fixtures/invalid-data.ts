export const invalidProfileMissingTitle = {
  id: "invalid-profile-01",
  headline: "Falta el título profesional.",
  location: {
    country: "Spain",
  },
  targetRoles: ["Developer"],
  targetIndustries: ["technology"],
  professionalLevel: "junior",
};

export const invalidEvidenceHighConfidence = {
  id: "evidence-xx",
  type: "project",
  title: "Proyecto inválido",
  description: "Descripción corta.",
  source: "cv",
  declaredLevel: "intermediate",
  verified: false,
  confidence: 1.5,
};

export const invalidRequirementBadCategory = {
  id: "req-xx",
  originalText: "Manual entry.",
  category: "invalid-category",
  isRequired: true,
  level: "basic",
  extractionConfidence: 0.7,
};

export const profileWithExtraFields = {
  id: "extra-profile-01",
  professionalTitle: "Analista de datos",
  location: {
    country: "Spain",
  },
  targetRoles: ["Data Analyst"],
  targetIndustries: ["technology"],
  professionalLevel: "junior",
  extraField: "valor adicional",
};
