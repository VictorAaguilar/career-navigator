export const TAILORING_DEMO_LIMITS = Object.freeze({
  resumeTextMaxLength: 24_000,
  jobTextMaxLength: 16_000,
  maxResumeBlocks: 80,
  maxRequirements: 30,
  maxProposals: 12,
  editedProposalMaxLength: 1_200,
  resumeImportFileMaxBytes: 8 * 1024 * 1024,
  resumeImportPdfMaxPages: 50,
  resumeImportDocxMaxEntries: 200,
  resumeImportDocxMaxXmlBytes: 8 * 1024 * 1024,
  resumeImportRawTextMaxLength: 120_000,
} as const);

export const TAILORING_DEMO_LIMIT_LABELS = Object.freeze({
  resumeTextMaxLength: "24.000 caracteres",
  jobTextMaxLength: "16.000 caracteres",
  maxResumeBlocks: "80 bloques",
  maxRequirements: "30 requisitos",
  maxProposals: "12 propuestas",
  editedProposalMaxLength: "1.200 caracteres por edición",
  resumeImportFileMaxBytes: "8 MiB",
  resumeImportPdfMaxPages: "50 páginas",
  resumeImportDocxMaxEntries: "200 entradas internas",
  resumeImportDocxMaxXmlBytes: "8 MiB de XML DOCX",
  resumeImportRawTextMaxLength: "120.000 caracteres extraídos",
} as const);
