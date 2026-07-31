export const TAILORING_DEMO_LIMITS = Object.freeze({
  resumeTextMaxLength: 24_000,
  jobTextMaxLength: 16_000,
  maxResumeBlocks: 80,
  maxRequirements: 30,
  maxProposals: 12,
  editedProposalMaxLength: 1_200,
} as const);

export const TAILORING_DEMO_LIMIT_LABELS = Object.freeze({
  resumeTextMaxLength: "24.000 caracteres",
  jobTextMaxLength: "16.000 caracteres",
  maxResumeBlocks: "80 bloques",
  maxRequirements: "30 requisitos",
  maxProposals: "12 propuestas",
  editedProposalMaxLength: "1.200 caracteres por edición",
} as const);
