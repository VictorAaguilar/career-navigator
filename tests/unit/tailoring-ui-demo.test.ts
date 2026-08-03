import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { beforeAll, describe, expect, it, vi } from "vitest";

const resumeText = [
  "Coordiné documentación interna para equipos.",
  "Lideré proyectos React y TypeScript con revisión humana de propuestas.",
].join("\n");

const jobText = ["- React y TypeScript", "- Docker avanzado"].join("\n");
const appModulePath = "../../apps/web/src/App";
const stateModulePath = "../../apps/web/src/app/tailoring-demo-state";
const limitsModulePath = "../../apps/web/src/app/tailoring-demo-limits";
const parsersModulePath = "../../apps/web/src/app/tailoring-demo-parsers";
const pipelineModulePath = "../../apps/web/src/app/tailoring-demo-pipeline";
const docxModulePath = "../../apps/web/src/app/tailoring-demo-docx";
const constantsModulePath = "../../apps/web/src/app/tailoring-demo-constants";
const nodeDocxRendererModulePath = "../../src/core/tailoring/docx-renderer";

describe("Tailoring UI demo MVP", () => {
  let App: React.ComponentType;
  let createTailoringDemoState: () => any;
  let getStageGuardMessage: (state: any) => string | null;
  let tailoringDemoReducer: (state: any, action: any) => any;
  let TAILORING_DEMO_ACTION_INVALID_ERROR: string;
  let TAILORING_DEMO_LIMITS: { resumeTextMaxLength: number; jobTextMaxLength: number };
  let extractRequirementTexts: (value: string) => string[];
  let parseJobText: (value: string) => any;
  let parseResumeText: (value: string) => any;
  let applyTailoringDemoReview: (analysis: any, decisions: Record<string, string>) => any;
  let rebuildValidationWithCandidates: (analysis: any, candidates: Array<{ requestId: string; candidateText: string }>) => any;
  let runTailoringDemoAnalysis: (resume: string, job: string) => any;
  let TAILORING_DEMO_DOWNLOAD_FILENAME: string;
  let renderTailoringDemoDocx: (exportModel: any) => Promise<any>;
  let renderResumeExportModelToDocx: (input: { exportModel: any }) => Promise<any>;

  beforeAll(async () => {
    ({ default: App } = await import(appModulePath));
    ({
      createTailoringDemoState,
      getStageGuardMessage,
      tailoringDemoReducer,
      TAILORING_DEMO_ACTION_INVALID_ERROR,
    } = await import(stateModulePath));
    ({ TAILORING_DEMO_LIMITS } = await import(limitsModulePath));
    ({ extractRequirementTexts, parseJobText, parseResumeText } = await import(parsersModulePath));
    ({ applyTailoringDemoReview, rebuildValidationWithCandidates, runTailoringDemoAnalysis } = await import(
      pipelineModulePath
    ));
    ({ renderTailoringDemoDocx } = await import(docxModulePath));
    ({ TAILORING_DEMO_DOWNLOAD_FILENAME } = await import(constantsModulePath));
    ({ renderResumeExportModelToDocx } = await import(nodeDocxRendererModulePath));
  });

  function advance(state = createTailoringDemoState()) {
    return tailoringDemoReducer(state, { type: "navigate", direction: "advance" });
  }

  it("creates an immutable initial demo state with TailoringSession as navigation source", () => {
    const state = createTailoringDemoState();

    expect(state.session.currentStageId).toBe("start");
    expect(state.resumeText).toBe("");
    expect(state.jobText).toBe("");
    expect(state.analysis).toBeNull();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.session)).toBe(true);
  });

  it("rejects invalid runtime actions with a stable error", () => {
    const state = createTailoringDemoState();
    expect(() => tailoringDemoReducer(state, { type: "unknown" } as never)).toThrow(
      TAILORING_DEMO_ACTION_INVALID_ERROR,
    );
  });

  it("blocks empty resume and job navigation but allows valid text", () => {
    let state = advance();
    expect(state.session.currentStageId).toBe("resume");

    state = advance(state);
    expect(state.session.currentStageId).toBe("resume");
    expect(getStageGuardMessage(state)).toContain("currículum");

    state = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });
    state = tailoringDemoReducer(state, { type: "use_plain_resume_parser" });
    state = advance(state);
    expect(state.session.currentStageId).toBe("job");

    state = advance(state);
    expect(state.session.currentStageId).toBe("job");
    state = tailoringDemoReducer(state, { type: "set_job_text", value: jobText });
    state = advance(state);
    expect(state.session.currentStageId).toBe("analysis");
  });

  it("invalidates derived results when resume or job changes", () => {
    let state = createTailoringDemoState();
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });
    state = tailoringDemoReducer(state, { type: "use_plain_resume_parser" });
    state = tailoringDemoReducer(state, { type: "set_job_text", value: jobText });
    state = tailoringDemoReducer(state, { type: "run_analysis" });
    expect(state.analysis).not.toBeNull();

    state = tailoringDemoReducer(state, { type: "set_resume_text", value: `${resumeText}\nNueva línea.` });
    expect(state.analysis).toBeNull();
    expect(state.appliedResult).toBeNull();

    state = tailoringDemoReducer(state, { type: "set_job_text", value: `${jobText}\nNueva necesidad.` });
    expect(state.analysis).toBeNull();
    expect(state.docx.status).toBe("idle");
  });

  it("requires an explicit structured or plain parsing mode before leaving resume", () => {
    let state = advance();
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });

    state = advance(state);
    expect(state.session.currentStageId).toBe("resume");
    expect(getStageGuardMessage(state)).toContain("estructura");

    state = tailoringDemoReducer(state, { type: "detect_resume_structure" });
    expect(state.resumeStructure.status).toBe("detected");
    state = advance(state);
    expect(state.session.currentStageId).toBe("resume");
    expect(getStageGuardMessage(state)).toContain("Confirma");

    state = tailoringDemoReducer(state, { type: "confirm_resume_structure" });
    state = advance(state);
    expect(state.session.currentStageId).toBe("job");
  });

  it("runs analysis with the confirmed structured ResumeDocument and keeps plain mode explicit", () => {
    const structured = [
      "PERFIL PROFESIONAL",
      "Profesional con experiencia en desarrollo web.",
      "EXPERIENCIA",
      "- Desarrollo de aplicaciones con TypeScript y React.",
      "HABILIDADES",
      "Vitest",
    ].join("\n");
    let structuredState = createTailoringDemoState();
    structuredState = tailoringDemoReducer(structuredState, { type: "set_resume_text", value: structured });
    structuredState = tailoringDemoReducer(structuredState, { type: "detect_resume_structure" });
    structuredState = tailoringDemoReducer(structuredState, { type: "confirm_resume_structure" });
    structuredState = tailoringDemoReducer(structuredState, { type: "set_job_text", value: jobText });
    structuredState = tailoringDemoReducer(structuredState, { type: "run_analysis" });

    expect(structuredState.analysis).not.toBeNull();
    expect(structuredState.analysis.parsedResume.resumeDocument.sections.map((section: any) => section.kind)).toEqual([
      "summary",
      "experience",
      "skills",
    ]);
    expect(structuredState.analysis.targetingResult.documentId).toBe(
      structuredState.analysis.parsedResume.resumeDocument.documentId,
    );

    let plainState = createTailoringDemoState();
    plainState = tailoringDemoReducer(plainState, { type: "set_resume_text", value: structured });
    plainState = tailoringDemoReducer(plainState, { type: "use_plain_resume_parser" });
    plainState = tailoringDemoReducer(plainState, { type: "set_job_text", value: jobText });
    plainState = tailoringDemoReducer(plainState, { type: "run_analysis" });

    expect(plainState.resumeStructure.mode).toBe("plain");
    expect(plainState.analysis.parsedResume.resumeDocument.sections).toHaveLength(1);
    expect(plainState.analysis.scoringResult.score).toBe(structuredState.analysis.scoringResult.score);
  });

  it("invalidates confirmed structure when text or section kind changes, but preserves it when navigating back", () => {
    let state = createTailoringDemoState();
    state = advance(state);
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: "EXPERIENCIA\nReact" });
    state = tailoringDemoReducer(state, { type: "detect_resume_structure" });
    state = tailoringDemoReducer(state, { type: "confirm_resume_structure" });
    state = advance(state);
    state = tailoringDemoReducer(state, { type: "navigate", direction: "back" });

    expect(state.resumeStructure.status).toBe("confirmed");
    expect(state.session.currentStageId).toBe("resume");

    state = tailoringDemoReducer(state, { type: "set_resume_section_kind", sectionId: "section-000", kind: "skills" });
    expect(state.resumeStructure.status).toBe("detected");
    expect(state.analysis).toBeNull();

    state = tailoringDemoReducer(state, { type: "confirm_resume_structure" });
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: "EXPERIENCIA\nReact\nVitest" });
    expect(state.resumeStructure.status).toBe("idle");
  });

  it("preserves input while navigating backward and reset clears all demo data", () => {
    let state = createTailoringDemoState();
    state = advance(state);
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });
    state = tailoringDemoReducer(state, { type: "use_plain_resume_parser" });
    state = advance(state);
    state = tailoringDemoReducer(state, { type: "set_job_text", value: jobText });
    state = tailoringDemoReducer(state, { type: "navigate", direction: "back" });

    expect(state.session.currentStageId).toBe("resume");
    expect(state.resumeText).toBe(resumeText);
    expect(state.jobText).toBe(jobText);

    state = tailoringDemoReducer(state, { type: "reset_demo" });
    expect(state.session.currentStageId).toBe("start");
    expect(state.resumeText).toBe("");
    expect(state.jobText).toBe("");
    expect(state.analysis).toBeNull();
    expect(state.appliedResult).toBeNull();
    expect(state.docx.status).toBe("idle");
  });

  it("accepts frozen state objects and does not mutate reducer input", () => {
    const state = Object.freeze(createTailoringDemoState());
    const next = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });

    expect(state.resumeText).toBe("");
    expect(next.resumeText).toBe(resumeText);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("parses resume text preserving order, Unicode and stable IDs without inference", () => {
    const parsed = parseResumeText(resumeText);

    expect(parsed.blocks.map((block: any) => block.text)).toEqual(resumeText.split("\n"));
    expect(parsed.blocks.map((block: any) => block.blockId)).toEqual(["resume_block_001", "resume_block_002"]);
    expect(parsed.evidences[1].description).toBe("Lideré proyectos React y TypeScript con revisión humana de propuestas.");
    expect(parsed.profile.experience?.[0].company).toBe("No inferido");
  });

  it("extracts job requirements from bullets, lines and paragraphs in stable order", () => {
    expect(extractRequirementTexts("- React y TypeScript\nExperiencia con revisión. Docker avanzado.")).toEqual([
      "React y TypeScript",
      "Experiencia con revisión.",
      "Docker avanzado.",
    ]);
    expect(parseJobText(jobText).offer.requirements.map((requirement: any) => requirement.id)).toEqual([
      "requirement_001",
      "requirement_002",
    ]);
  });

  it("rejects empty inputs and documented size limits", () => {
    expect(() => parseResumeText(" ")).toThrow("TAILORING_DEMO_EMPTY_RESUME_TEXT");
    expect(() => parseJobText(" ")).toThrow("TAILORING_DEMO_EMPTY_JOB_TEXT");
    expect(() => parseResumeText("x".repeat(TAILORING_DEMO_LIMITS.resumeTextMaxLength + 1))).toThrow(
      "TAILORING_DEMO_RESUME_TOO_LONG",
    );
    expect(() => parseJobText("x".repeat(TAILORING_DEMO_LIMITS.jobTextMaxLength + 1))).toThrow(
      "TAILORING_DEMO_JOB_TOO_LONG",
    );
  });

  it("runs deterministic analysis with real scoring and no unsupported evidence for gaps", () => {
    const first = runTailoringDemoAnalysis(resumeText, jobText);
    const second = runTailoringDemoAnalysis(resumeText, jobText);

    expect(second).toEqual(first);
    expect(first.scoringResult.score).toBeGreaterThan(0);
    expect(first.requirementRows.map((row: any) => row.label)).toContain("Cubierto");
    expect(first.requirementRows.find((row: any) => row.text === "Docker avanzado")?.evidenceTexts).toEqual([]);
    expect(first.rewriteProposalResult.proposals.length).toBe(1);
  });

  it("builds proposals only from existing blocks and reorders existing text without new facts", () => {
    const analysis = runTailoringDemoAnalysis(resumeText, jobText);
    const proposal = analysis.proposalRows[0];

    expect(proposal.originalText).toContain("React y TypeScript");
    expect(proposal.currentCandidateText).toContain("React y TypeScript");
    for (const token of ["Docker", "2026", "99%"]) {
      expect(proposal.currentCandidateText).not.toContain(token);
    }
  });

  it("revalidates edits and prevents rejected candidates from being approved", () => {
    const analysis = runTailoringDemoAnalysis(resumeText, jobText);
    const proposal = analysis.proposalRows[0];
    const rebuilt = rebuildValidationWithCandidates(analysis, [
      { requestId: proposal.requestId, candidateText: `${proposal.currentCandidateText}\n# Markdown` },
    ]);

    expect(rebuilt.validationBatch.results[0].status).toBe("rejected");
    expect(rebuilt.validationBatch.results[0].findings.map((finding: any) => finding.code)).toContain(
      "candidate_contains_markdown",
    );
  });

  it("restores deterministic proposal text after an edit", () => {
    let state = createTailoringDemoState();
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });
    state = tailoringDemoReducer(state, { type: "use_plain_resume_parser" });
    state = tailoringDemoReducer(state, { type: "set_job_text", value: jobText });
    state = tailoringDemoReducer(state, { type: "run_analysis" });
    const proposal = state.analysis.proposalRows[0];

    state = tailoringDemoReducer(state, {
      type: "edit_proposal",
      validationId: proposal.validationId,
      value: `${proposal.currentCandidateText}\n# Markdown`,
    });
    expect(state.analysis.proposalRows[0].validationStatus).toBe("rejected");

    state = tailoringDemoReducer(state, { type: "restore_proposal", validationId: proposal.validationId });
    expect(state.analysis.proposalRows[0].currentCandidateText).toBe(proposal.proposedText);
  });

  it("does not allow approving a candidate rejected by validation", () => {
    let state = createTailoringDemoState();
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: resumeText });
    state = tailoringDemoReducer(state, { type: "use_plain_resume_parser" });
    state = tailoringDemoReducer(state, { type: "set_job_text", value: jobText });
    state = tailoringDemoReducer(state, { type: "run_analysis" });
    const proposal = state.analysis.proposalRows[0];

    state = tailoringDemoReducer(state, {
      type: "edit_proposal",
      validationId: proposal.validationId,
      value: `${proposal.currentCandidateText}\n# Markdown`,
    });
    state = tailoringDemoReducer(state, {
      type: "set_review_decision",
      validationId: proposal.validationId,
      decision: "approved",
    });

    expect(state.reviewDecisions[proposal.validationId]).toBeUndefined();
    expect(state.visibleError).toContain("decisión");
  });

  it("applies only approved decisions and keeps rejected proposals out of preview", () => {
    const analysis = runTailoringDemoAnalysis(resumeText, jobText);
    const validationId = analysis.proposalRows[0].validationId;
    const applied = applyTailoringDemoReview(analysis, { [validationId]: "rejected" });

    expect(applied.reviewDecisionBatch.summary.rejected).toBe(1);
    expect(applied.applicationResult.summary.rewrittenBlocks).toBe(0);
    expect(applied.exportModel.summary.renderedFromOriginal).toBe(2);
  });

  it("applies approved proposals and derives preview and export model from the same document", () => {
    const analysis = runTailoringDemoAnalysis(resumeText, jobText);
    const validationId = analysis.proposalRows[0].validationId;
    const applied = applyTailoringDemoReview(analysis, { [validationId]: "approved" });

    expect(applied.applicationResult.summary.totalApprovedSelections).toBe(1);
    expect(applied.exportModel.adaptedDocumentId).toBe(applied.applicationResult.adaptedDocument.documentId);
    expect(applied.exportModel.sections[0].blocks[1].renderText).toBe(
      applied.applicationResult.adaptedDocument.sections[0].blocks[1].effectiveText,
    );
  });

  it("generates a DOCX artifact from the export model with a neutral download filename", async () => {
    const analysis = runTailoringDemoAnalysis(resumeText, jobText);
    const applied = applyTailoringDemoReview(analysis, {
      [analysis.proposalRows[0].validationId]: "approved",
    });
    const docx = await renderTailoringDemoDocx(applied.exportModel);
    const nodeDocx = await renderResumeExportModelToDocx({ exportModel: applied.exportModel });
    const zip = await JSZip.loadAsync(Buffer.from(docx.contentBase64, "base64"));
    const nodeZip = await JSZip.loadAsync(Buffer.from(nodeDocx.contentBase64, "base64"));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    const nodeDocumentXml = await nodeZip.file("word/document.xml")?.async("string");

    expect(TAILORING_DEMO_DOWNLOAD_FILENAME).toBe("curriculum-adaptado.docx");
    expect(docx.byteLength).toBeGreaterThan(0);
    expect(documentXml).toContain("React");
    expect(documentXml).toBe(nodeDocumentXml);
    expect(documentXml).not.toContain("proposalId");
  });

  it("renders the start UI and keeps one current step during SSR", () => {
    const markup = renderToStaticMarkup(React.createElement(App));

    expect(markup).toContain("Comenzar");
    expect(markup).toContain("Tus datos no se almacenan en esta versión.");
    expect(markup).toContain("No usa IA generativa");
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("does not use forbidden browser persistence, random, timestamps, LLM providers or content logging in new app modules", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUuidSpy = vi.spyOn(crypto, "randomUUID");

    runTailoringDemoAnalysis(resumeText, jobText);

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUuidSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUuidSpy.mockRestore();

    const files = [
      "apps/web/src/app/tailoring-demo-parsers.ts",
      "apps/web/src/app/tailoring-demo-pipeline.ts",
      "apps/web/src/app/tailoring-demo-state.ts",
      "apps/web/src/app/tailoring-demo-docx.ts",
      "apps/web/src/App.tsx",
    ];
    const source = files.map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
    expect(source).not.toMatch(/Date\.now|Math\.random|randomUUID|localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source).not.toMatch(/OpenAI|Anthropic|Gemini|apiKey|console\.log\(resumeText|console\.log\(jobText/);
  });
});
