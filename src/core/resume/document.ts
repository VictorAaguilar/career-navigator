import type { Evidence } from "../../schemas/evidence";
import type { ResumeBlock, ResumeDocument, ResumeSection, ResumeSource } from "../../schemas/resume";
import { ResumeDocumentSchema } from "../../schemas/resume";

export const ResumeDocumentErrorCode = {
  DuplicateSectionId: "RESUME_DOCUMENT_DUPLICATE_SECTION_ID",
  DuplicateBlockId: "RESUME_DOCUMENT_DUPLICATE_BLOCK_ID",
  DuplicateSectionOrder: "RESUME_DOCUMENT_DUPLICATE_SECTION_ORDER",
  DuplicateBlockOrder: "RESUME_DOCUMENT_DUPLICATE_BLOCK_ORDER",
  DuplicateEvidenceId: "RESUME_DOCUMENT_DUPLICATE_EVIDENCE_ID",
  UnknownEvidenceId: "RESUME_DOCUMENT_UNKNOWN_EVIDENCE_ID",
} as const;

export type ResumeDocumentErrorCode = (typeof ResumeDocumentErrorCode)[keyof typeof ResumeDocumentErrorCode];

export type BuildResumeDocumentInput = {
  documentId: string;
  profileId: string;
  source: ResumeSource;
  sections: ResumeSection[];
  evidences: Evidence[];
};

export function buildResumeDocument(input: BuildResumeDocumentInput): ResumeDocument {
  assertUnique(input.evidences.map((evidence) => evidence.id), ResumeDocumentErrorCode.DuplicateEvidenceId);

  const evidenceIds = new Set(input.evidences.map((evidence) => evidence.id));

  assertUnique(input.sections.map((section) => section.sectionId), ResumeDocumentErrorCode.DuplicateSectionId);
  assertUnique(input.sections.map((section) => section.order), ResumeDocumentErrorCode.DuplicateSectionOrder);

  const seenBlockIds = new Set<string>();
  const sections = input.sections
    .map((section) => {
      const blockOrders = section.blocks.map((block) => block.order);
      assertUnique(blockOrders, ResumeDocumentErrorCode.DuplicateBlockOrder);

      const blocks = section.blocks
        .map((block) => {
          if (seenBlockIds.has(block.blockId)) {
            throw new Error(ResumeDocumentErrorCode.DuplicateBlockId);
          }
          seenBlockIds.add(block.blockId);

          return canonicalizeBlock(block, evidenceIds);
        })
        .sort(compareByOrder);

      return {
        sectionId: section.sectionId,
        kind: section.kind,
        label: section.label,
        order: section.order,
        blocks,
      };
    })
    .sort(compareByOrder);

  const document = ResumeDocumentSchema.parse({
    documentId: input.documentId,
    profileId: input.profileId,
    source: {
      format: input.source.format,
      ...(input.source.fileName === undefined ? {} : { fileName: input.source.fileName }),
    },
    sections,
  });

  return deepFreeze(document);
}

function canonicalizeBlock(block: ResumeBlock, evidenceIds: Set<string>): ResumeBlock {
  const canonicalEvidenceIds = [...new Set(block.evidenceIds)].sort();
  for (const evidenceId of canonicalEvidenceIds) {
    if (!evidenceIds.has(evidenceId)) {
      throw new Error(ResumeDocumentErrorCode.UnknownEvidenceId);
    }
  }

  return {
    blockId: block.blockId,
    kind: block.kind,
    order: block.order,
    originalText: block.originalText,
    evidenceIds: canonicalEvidenceIds,
    ...(block.sourceLocator === undefined
      ? {}
      : {
          sourceLocator: {
            kind: block.sourceLocator.kind,
            value: block.sourceLocator.value,
          },
        }),
  };
}

function assertUnique<T extends string | number>(values: T[], errorCode: ResumeDocumentErrorCode): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(errorCode);
    }
    seen.add(value);
  }
}

function compareByOrder<T extends { order: number }>(left: T, right: T): number {
  return left.order - right.order;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }

  return value;
}
