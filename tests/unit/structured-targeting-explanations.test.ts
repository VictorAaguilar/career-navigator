import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildResumeDocument } from "../../src/core/resume/document";

const locationModulePath = "../../apps/web/src/app/tailoring-location-explanations";
const structuredModulePath = "../../apps/web/src/app/structured-resume-parsing";
const parserModulePath = "../../apps/web/src/app/tailoring-demo-parsers";
const pipelineModulePath = "../../apps/web/src/app/tailoring-demo-pipeline";
const requirementsStagePath = "../../apps/web/src/components/stages/RequirementsStage";
const proposalsStagePath = "../../apps/web/src/components/stages/ProposalsStage";
const reviewStagePath = "../../apps/web/src/components/stages/ReviewStage";
const previewStagePath = "../../apps/web/src/components/stages/PreviewStage";

const structuredResume = [
  "DESARROLLADOR DE SOFTWARE",
  "",
  "PERFIL PROFESIONAL",
  "Profesional con experiencia en desarrollo de aplicaciones web.",
  "",
  "EXPERIENCIA",
  "- Desarrollo de aplicaciones con TypeScript y React.",
  "- Creación de pruebas automatizadas con Vitest.",
  "- Revisión de código con Git.",
  "",
  "FORMACIÓN",
  "Grado sintético en Ingeniería Informática.",
  "",
  "HABILIDADES",
  "TypeScript",
  "React",
  "Vitest",
  "Git",
  "",
  "IDIOMAS",
  "Español",
  "Inglés",
].join("\n");

const offerText = [
  "Buscamos desarrollador frontend con experiencia en:",
  "- TypeScript",
  "- React",
  "- Pruebas automatizadas",
  "- Git",
  "- Docker",
].join("\n");

describe("structured targeting explanations", () => {
  let location: any;
  let structured: any;
  let parsers: any;
  let pipeline: any;
  let RequirementsStage: React.ComponentType<any>;
  let ProposalsStage: React.ComponentType<any>;
  let ReviewStage: React.ComponentType<any>;
  let PreviewStage: React.ComponentType<any>;

  beforeAll(async () => {
    location = await import(locationModulePath);
    structured = await import(structuredModulePath);
    parsers = await import(parserModulePath);
    pipeline = await import(pipelineModulePath);
    ({ RequirementsStage } = await import(requirementsStagePath));
    ({ ProposalsStage } = await import(proposalsStagePath));
    ({ ReviewStage } = await import(reviewStagePath));
    ({ PreviewStage } = await import(previewStagePath));
  });

  function buildStructuredAnalysis() {
    const parsed = structured.buildParsedResumeFromStructuredDraft(
      structured.parseStructuredResumeText(structuredResume).draft,
    );
    return pipeline.runTailoringDemoAnalysisWithParsedResume(parsed, offerText);
  }

  function buildPlainAnalysis() {
    return pipeline.runTailoringDemoAnalysis(
      "React TypeScript Vitest Git",
      offerText,
    );
  }

  function decisionsForAnalysis(analysis: any, decision: "approved" | "rejected" | "changes_requested") {
    return Object.fromEntries(
      analysis.validationBatch.results.map((result: any) => [result.validationId, decision]),
    );
  }

  it("defines exact contracts, reason codes, warning codes and stable errors", () => {
    expect(location.ResumeLocationSource).toEqual(["structured", "plain"]);
    expect(location.ResumeLocationStatus).toEqual(["resolved", "ambiguous", "unresolved"]);
    expect(location.TailoringTargetingReasonCode).toEqual([
      "evidence_block_match",
      "structured_section_match",
      "existing_target_resolution",
      "plain_text_position",
      "ambiguous_target",
      "unresolved_target",
    ]);
    expect(Object.values(location.ResumeLocationWarningCode)).toEqual([
      "TAILORING_LOCATION_APPROXIMATE_PLAIN_TEXT",
      "TAILORING_LOCATION_AMBIGUOUS_TARGET",
      "TAILORING_LOCATION_UNRESOLVED",
      "TAILORING_LOCATION_HEADING_HIDDEN",
    ]);
    expect(Object.values(location.TailoringLocationErrorCode)).toContain("TAILORING_LOCATION_DUPLICATE_ID");
  });

  it("validates location contracts and rejects additional properties", () => {
    const reference = {
      source: "structured",
      status: "resolved",
      sectionKind: "experience",
      sectionOrdinal: 1,
      blockOrdinal: 2,
      originalHeading: "EXPERIENCIA",
      internalSectionId: "section-000",
      internalBlockId: "section-000-block-001",
      warningCodes: [],
    };

    expect(() => location.assertResumeLocationReference(reference)).not.toThrow();
    expect(() => location.assertResumeLocationReference({ ...reference, extra: true })).toThrow(
      "TAILORING_EXPLANATION_INVALID",
    );
    expect(() => location.formatTargetingReasonLabel("invented", reference)).toThrow(
      "TAILORING_EXPLANATION_INVALID",
    );
  });

  it("builds a frozen structured index with Spanish labels and source order", () => {
    const parsed = structured.buildParsedResumeFromStructuredDraft(
      structured.parseStructuredResumeText(structuredResume).draft,
    );
    const index = location.buildResumeLocationIndex(parsed.resumeDocument);
    const firstExperienceEvidence = parsed.evidences.find((evidence: any) =>
      evidence.description.includes("TypeScript y React"),
    );
    const evidenceLocation = location.resolveEvidenceLocation(firstExperienceEvidence, index);

    expect(index.source).toBe("structured");
    expect(index.blockIds).toContain("section-002-block-001");
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.locationsByBlockId["section-002-block-001"])).toBe(true);
    expect(location.formatResumeLocationLabel(evidenceLocation)).toBe("Experiencia · bloque 2");
    expect(location.formatResumeLocationDetail(evidenceLocation)).toBe("Sección Experiencia, bloque 2.");
  });

  it("builds a frozen plain index with honest paragraph locations and warnings", () => {
    const parsed = parsers.parseResumeText("React\nTypeScript\nVitest");
    const index = location.buildResumeLocationIndex(parsed.resumeDocument);
    const evidenceLocation = location.resolveEvidenceLocation(parsed.evidences[1], index);

    expect(index.source).toBe("plain");
    expect(location.formatResumeLocationLabel(evidenceLocation)).toBe("Texto del currículum · párrafo 2");
    expect(evidenceLocation.warningCodes).toEqual(["TAILORING_LOCATION_APPROXIMATE_PLAIN_TEXT"]);
    expect(location.formatResumeLocationWarning(evidenceLocation.warningCodes[0])).toContain("texto plano");
    expect(index.summary.approximateBlocks).toBe(3);
  });

  it("shows safe other headings and hides sensitive headings", () => {
    const safeDocument = buildResumeDocument({
      documentId: "doc",
      profileId: "profile",
      source: { format: "plain_text" },
      evidences: [],
      sections: [
        {
          sectionId: "section-000",
          kind: "other",
          label: "Publicaciones",
          order: 0,
          blocks: [
            {
              blockId: "section-000-block-000",
              kind: "paragraph",
              order: 0,
              originalText: "Artículo sintético.",
              evidenceIds: [],
            },
          ],
        },
      ],
    });
    const sensitiveDocument = buildResumeDocument({
      documentId: "doc-sensitive",
      profileId: "profile",
      source: { format: "plain_text" },
      evidences: [],
      sections: [{ ...safeDocument.sections[0], label: "ada@example.test" }],
    });

    expect(location.formatResumeLocationLabel(location.resolveBlockLocation(
      location.buildResumeLocationIndex(safeDocument),
      "section-000-block-000",
    ))).toBe("Otra sección: Publicaciones · bloque 1");
    const sensitiveLocation = location.resolveBlockLocation(
      location.buildResumeLocationIndex(sensitiveDocument),
      "section-000-block-000",
    );
    expect(location.formatResumeLocationLabel(sensitiveLocation)).toBe("Otra sección · bloque 1");
    expect(sensitiveLocation.warningCodes).toContain("TAILORING_LOCATION_HEADING_HIDDEN");
  });

  it("detects duplicate section and block ids without mutating input", () => {
    const parsed = structured.buildParsedResumeFromStructuredDraft(
      structured.parseStructuredResumeText("EXPERIENCIA\nReact\nGit").draft,
    );
    const duplicateSectionDocument = {
      ...parsed.resumeDocument,
      sections: [
        parsed.resumeDocument.sections[0],
        { ...parsed.resumeDocument.sections[0], order: 1 },
      ],
    };
    const duplicateBlockDocument = {
      ...parsed.resumeDocument,
      sections: [
        {
          ...parsed.resumeDocument.sections[0],
          blocks: [
            parsed.resumeDocument.sections[0].blocks[0],
            { ...parsed.resumeDocument.sections[0].blocks[1], blockId: parsed.resumeDocument.sections[0].blocks[0].blockId },
          ],
        },
      ],
    };

    expect(() => location.buildResumeLocationIndex(duplicateSectionDocument)).toThrow(
      "TAILORING_LOCATION_DUPLICATE_ID",
    );
    expect(() => location.buildResumeLocationIndex(duplicateBlockDocument)).toThrow(
      "TAILORING_LOCATION_DUPLICATE_ID",
    );
    expect(parsed.resumeDocument.sections[0].blocks.map((block: any) => block.blockId)).toEqual([
      "section-000-block-000",
      "section-000-block-001",
      "section-000-block-002",
    ]);
  });

  it("resolves evidence and blocks without accepting missing references as support", () => {
    const parsed = parsers.parseResumeText("React");
    const index = location.buildResumeLocationIndex(parsed.resumeDocument);
    const noReference = { ...parsed.evidences[0], reference: undefined };
    const staleReference = {
      ...parsed.evidences[0],
      reference: { ...parsed.evidences[0].reference, experienceId: "missing-block" },
    };

    expect(location.resolveEvidenceLocation(parsed.evidences[0], index).status).toBe("resolved");
    expect(location.resolveEvidenceLocation(noReference, index).status).toBe("unresolved");
    expect(location.resolveEvidenceLocation(staleReference, index).status).toBe("unresolved");
    expect(location.formatResumeLocationLabel(location.resolveBlockLocation(index, "missing-block"))).toBe(
      "Ubicación no disponible",
    );
  });

  it("derives target reasons for exact, plain, ambiguous and unresolved targets", () => {
    const structuredAnalysis = buildStructuredAnalysis();
    const proposal = structuredAnalysis.proposalRows[0];
    const plainProposal = buildPlainAnalysis().proposalRows[0];
    const ambiguous = {
      status: "ambiguous",
      candidateBlockIds: ["a", "b"],
      selectedBlockIds: [],
    };
    const unresolved = {
      status: "unresolved",
      candidateBlockIds: [],
      selectedBlockIds: [],
    };

    expect(proposal.targetingReasonLabels).toContain(
      "Este bloque contiene la evidencia relacionada con el requisito.",
    );
    expect(proposal.targetingReasonLabels.join(" ")).toContain("sección revisada");
    expect(plainProposal.targetingReasonLabels.join(" ")).toContain("texto plano");
    expect(location.reasonCodesForTargetLocation(location.resolveTargetLocation(ambiguous, structuredAnalysis.locationIndex))).toEqual([
      "ambiguous_target",
    ]);
    expect(location.reasonCodesForTargetLocation(location.resolveTargetLocation(unresolved, structuredAnalysis.locationIndex))).toEqual([
      "unresolved_target",
    ]);
  });

  it("adds evidence locations without changing matching, scoring or proposal content", () => {
    const first = buildStructuredAnalysis();
    const second = buildStructuredAnalysis();
    const dockerRow = first.requirementRows.find((row: any) => row.text === "Docker");

    expect(second).toEqual(first);
    expect(first.scoringResult.score).toBeGreaterThan(0);
    expect(first.requirementRows.find((row: any) => row.text === "TypeScript")?.label).toBe("Cubierto");
    expect(dockerRow?.evidenceTexts).toEqual([]);
    expect(dockerRow?.evidenceLocations).toEqual([]);
    expect(first.rewriteProposalResult).toEqual(second.rewriteProposalResult);
    expect(first.validationBatch).toEqual(second.validationBatch);
  });

  it("keeps matched evidence state and original evidence immutable", () => {
    const analysis = buildStructuredAnalysis();
    const row = analysis.requirementRows.find((item: any) => item.evidenceLocations.length > 0);
    const evidence = analysis.parsedResume.evidences[0];

    expect(["met", "partially_met"]).toContain(row.status);
    expect(row.evidenceLocations[0].supportLabel).toMatch(/Evidencia/);
    expect(evidence.description).toBe("DESARROLLADOR DE SOFTWARE");
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it("creates final traceability rows for approved, edited and rejected decisions", () => {
    let analysis = buildStructuredAnalysis();
    const proposal = analysis.proposalRows[0];
    const edited = `${proposal.currentCandidateText} Revisado manualmente.`;
    const rebuilt = pipeline.rebuildValidationWithCandidates(
      analysis,
      analysis.candidateSubmissions.map((candidate: any) =>
        candidate.requestId === proposal.requestId
          ? { requestId: candidate.requestId, candidateText: edited }
          : { ...candidate },
      ),
    );
    analysis = {
      ...analysis,
      candidateSubmissions: rebuilt.candidateSubmissions,
      validationBatch: rebuilt.validationBatch,
      proposalRows: rebuilt.proposalRows,
    };
    const editedDecisions = decisionsForAnalysis(analysis, "rejected");
    editedDecisions[proposal.validationId] = "approved";
    const editedApplied = pipeline.applyTailoringDemoReview(analysis, editedDecisions);
    const rejected = pipeline.applyTailoringDemoReview(buildStructuredAnalysis(), decisionsForAnalysis(buildStructuredAnalysis(), "rejected"));

    expect(editedApplied.traceabilityRows[0]).toMatchObject({
      outcome: "applied",
      decisionLabel: "Editada y aceptada",
      requirementText: expect.any(String),
    });
    expect(editedApplied.traceabilityRows[0].location.label).toBe(analysis.proposalRows[0].targetLocation.label);
    expect(rejected.traceabilityRows[0]).toMatchObject({
      outcome: "not_applied",
      decisionLabel: "Rechazada",
    });
    expect(rejected.applicationResult.changes).toEqual([]);
  });

  it("keeps preview/export model and DOCX data free of UI location metadata", () => {
    const analysis = buildStructuredAnalysis();
    const decisions = decisionsForAnalysis(analysis, "rejected");
    decisions[analysis.proposalRows[0].validationId] = "approved";
    const applied = pipeline.applyTailoringDemoReview(analysis, decisions);

    expect(JSON.stringify(applied.exportModel)).not.toContain("Ubicación");
    expect(JSON.stringify(applied.exportModel)).not.toContain("targetLocation");
    expect(JSON.stringify(applied.applicationResult.adaptedDocument)).not.toContain("Ubicación");
    expect(applied.exportModel.adaptedDocumentId).toBe(applied.applicationResult.adaptedDocument.documentId);
  });

  it("invalidates location explanations with the analysis when resume text, mode or section kind changes", () => {
    let state = pipeline.runTailoringDemoAnalysis("React", "- React");
    const firstIndex = state.locationIndex;
    state = pipeline.runTailoringDemoAnalysis("React\nGit", "- React");

    expect(state.locationIndex).not.toBe(firstIndex);
    expect(state.locationIndex.blockIds).toEqual(["resume_block_001", "resume_block_002"]);
  });

  it("renders Requirements, Proposals, Review and Preview traceability without visible technical ids", () => {
    const analysis = buildStructuredAnalysis();
    const validationId = analysis.proposalRows[0].validationId;
    const applied = pipeline.applyTailoringDemoReview(analysis, decisionsForAnalysis(analysis, "rejected"));
    const state = {
      analysis,
      reviewDecisions: { [validationId]: "rejected" },
      appliedResult: applied,
    };
    const text = visibleText([
      renderToStaticMarkup(React.createElement(RequirementsStage, { state })),
      renderToStaticMarkup(React.createElement(ProposalsStage, { state })),
      renderToStaticMarkup(React.createElement(ReviewStage, {
        state,
        dispatch: () => undefined,
        onApplyReview: () => undefined,
        isApplyingReview: false,
      })),
      renderToStaticMarkup(React.createElement(PreviewStage, { state })),
    ].join("\n"));

    expect(text).toContain("Ubicación de la evidencia");
    expect(text).toContain("Ubicación objetivo");
    expect(text).toContain("Por qué se propone aquí");
    expect(text).toContain("Cambios no aplicados");
    expect(text).toContain("No se encontró evidencia en el currículum.");
    expect(text).not.toMatch(/section-\d|block-\d|proposal\||requirement_\d|evidence_\d/);
  });

  it("does not use Date, random, UUID, storage, network, analytics, LLMs, logs or absolute paths", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUuidSpy = vi.spyOn(crypto, "randomUUID");

    buildStructuredAnalysis();

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUuidSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUuidSpy.mockRestore();

    const files = [
      "apps/web/src/app/tailoring-location-explanations.ts",
      "apps/web/src/app/tailoring-demo-pipeline.ts",
      "apps/web/src/components/stages/RequirementsStage.tsx",
      "apps/web/src/components/stages/ProposalsStage.tsx",
      "apps/web/src/components/stages/ReviewStage.tsx",
      "apps/web/src/components/stages/PreviewStage.tsx",
    ];
    const source = files.map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    expect(source).not.toMatch(/Date\.now|performance\.now|Math\.random|randomUUID|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|sendBeacon/);
    expect(source).not.toMatch(/OpenAI|Anthropic|Gemini|analytics|console\.log|C:[\\/]|AppData/);
  });
});

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
}
