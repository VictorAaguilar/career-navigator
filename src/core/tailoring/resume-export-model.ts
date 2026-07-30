import type { ApprovedRewriteApplicationResult } from "../../schemas/application";
import { ApprovedRewriteApplicationResultSchema } from "../../schemas/application";
import type {
  ResumeExportBlock,
  ResumeExportModel,
  ResumeExportSection,
} from "../../schemas/export";
import {
  ResumeExportModelSchema,
  buildResumeExportBlockId,
  buildResumeExportModelId,
  buildResumeExportSectionId,
} from "../../schemas/export";
import type { ResumeDocument } from "../../schemas/resume";

export const ResumeExportModelInputErrorCode = {
  InvalidApplicationResult: "RESUME_EXPORT_INPUT_INVALID_APPLICATION_RESULT",
} as const;

export type ResumeExportModelInputErrorCode =
  (typeof ResumeExportModelInputErrorCode)[keyof typeof ResumeExportModelInputErrorCode];

export type BuildResumeExportModelInput = {
  applicationResult: ApprovedRewriteApplicationResult;
};

export function buildResumeExportModel(input: BuildResumeExportModelInput): ResumeExportModel {
  const applicationResult = validateInput(input);
  const adaptedDocument = applicationResult.adaptedDocument;
  const exportModelId = buildResumeExportModelId(applicationResult.applicationId, adaptedDocument.documentId);
  const changesByBlockId = new Map(applicationResult.changes.map((change) => [change.blockId, change]));

  const sections: ResumeExportSection[] = adaptedDocument.sections.map((section) => {
    const exportSectionId = buildResumeExportSectionId(exportModelId, section.sectionId);
    return {
      exportSectionId,
      sectionId: section.sectionId,
      kind: section.kind,
      label: section.label,
      order: section.order,
      blocks: section.blocks.map((block) => {
        const change = changesByBlockId.get(block.blockId);
        return buildExportBlock({
          exportModelId,
          sectionId: section.sectionId,
          block,
          appliedChangeId: change?.changeId,
        });
      }),
    };
  });

  const blocks = sections.flatMap((section) => section.blocks);
  const model = ResumeExportModelSchema.parse({
    exportModelId,
    applicationId: applicationResult.applicationId,
    offerId: applicationResult.offerId,
    profileId: applicationResult.profileId,
    sourceDocumentId: applicationResult.sourceDocumentId,
    adaptedDocumentId: adaptedDocument.documentId,
    exportScope: "structured_content_for_future_docx_rendering",
    source: copySource(adaptedDocument.source),
    sections,
    summary: {
      totalSections: sections.length,
      totalBlocks: blocks.length,
      renderedFromOriginal: blocks.filter((block) => block.textSource === "source_original").length,
      renderedFromApprovedSelection: blocks.filter((block) => block.textSource === "approved_selection").length,
      rewrittenBlocks: blocks.filter((block) => block.applicationStatus === "rewritten").length,
      approvedUnchangedBlocks: blocks.filter((block) => block.applicationStatus === "approved_unchanged").length,
      totalAppliedChangeReferences: blocks.filter((block) => block.appliedChangeId !== undefined).length,
    },
  });

  return deepFreeze(model);
}

function validateInput(input: BuildResumeExportModelInput): ApprovedRewriteApplicationResult {
  const result = ApprovedRewriteApplicationResultSchema.safeParse(input.applicationResult);
  if (!result.success) {
    throwInputError(ResumeExportModelInputErrorCode.InvalidApplicationResult);
  }
  return result.data;
}

function buildExportBlock(input: {
  exportModelId: string;
  sectionId: string;
  block: ApprovedRewriteApplicationResult["adaptedDocument"]["sections"][number]["blocks"][number];
  appliedChangeId: string | undefined;
}): ResumeExportBlock {
  const textSource = input.block.applicationStatus === "unchanged" ? "source_original" : "approved_selection";
  return {
    exportBlockId: buildResumeExportBlockId(input.exportModelId, input.sectionId, input.block.blockId),
    sectionId: input.sectionId,
    blockId: input.block.blockId,
    kind: input.block.kind,
    order: input.block.order,
    originalText: input.block.originalText,
    effectiveText: input.block.effectiveText,
    renderText: input.block.effectiveText,
    applicationStatus: input.block.applicationStatus,
    textSource,
    evidenceIds: [...input.block.evidenceIds],
    ...(input.block.sourceLocator === undefined
      ? {}
      : {
          sourceLocator: {
            kind: input.block.sourceLocator.kind,
            value: input.block.sourceLocator.value,
          },
        }),
    ...(input.block.appliedSelectionId === undefined
      ? {}
      : {
          appliedSelectionId: input.block.appliedSelectionId,
          appliedChangeId: input.appliedChangeId,
        }),
  };
}

function copySource(source: ResumeDocument["source"]): ResumeDocument["source"] {
  return {
    format: source.format,
    ...(source.fileName === undefined ? {} : { fileName: source.fileName }),
  };
}

function throwInputError(code: ResumeExportModelInputErrorCode): never {
  throw new Error(code);
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
