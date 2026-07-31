import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

const stateModulePath = "../../apps/web/src/app/tailoring-demo-state";
const pipelineModulePath = "../../apps/web/src/app/tailoring-demo-pipeline";
const controllerModulePath = "../../apps/web/src/app/use-tailoring-demo-controller";
const constantsModulePath = "../../apps/web/src/app/tailoring-demo-constants";
const startStagePath = "../../apps/web/src/components/stages/StartStage";
const resumeStagePath = "../../apps/web/src/components/stages/ResumeStage";
const jobStagePath = "../../apps/web/src/components/stages/JobStage";
const analysisStagePath = "../../apps/web/src/components/stages/AnalysisStage";
const requirementsStagePath = "../../apps/web/src/components/stages/RequirementsStage";
const proposalsStagePath = "../../apps/web/src/components/stages/ProposalsStage";
const reviewStagePath = "../../apps/web/src/components/stages/ReviewStage";
const previewStagePath = "../../apps/web/src/components/stages/PreviewStage";
const downloadStagePath = "../../apps/web/src/components/stages/DownloadStage";
const sharedStagePath = "../../apps/web/src/components/stages/shared";

const syntheticResume = [
  "Desarrollador de software",
  "Desarrollo de aplicaciones web con TypeScript y React.",
  "Creación de pruebas automatizadas con Vitest.",
].join("\n");

const noMatchJob = ["- Docker", "- Kubernetes"].join("\n");

describe("Tailoring acceptance hardening", () => {
  let createTailoringDemoState: () => any;
  let tailoringDemoReducer: (state: any, action: any) => any;
  let runTailoringDemoAnalysis: (resume: string, job: string) => any;
  let applyTailoringDemoReview: (analysis: any, decisions: Record<string, string>) => any;
  let downloadTailoringDemoDocx: (exportModel: any, dependencies: any) => Promise<any>;
  let TAILORING_DEMO_DOWNLOAD_FILENAME: string;
  let StageHeader: React.ComponentType<any>;
  let stages: Record<string, React.ComponentType<any>>;

  beforeAll(async () => {
    ({ createTailoringDemoState, tailoringDemoReducer } = await import(stateModulePath));
    ({ runTailoringDemoAnalysis, applyTailoringDemoReview } = await import(pipelineModulePath));
    ({ downloadTailoringDemoDocx } = await import(controllerModulePath));
    ({ TAILORING_DEMO_DOWNLOAD_FILENAME } = await import(constantsModulePath));
    ({ StageHeader } = await import(sharedStagePath));
    stages = {
      start: (await import(startStagePath)).StartStage,
      resume: (await import(resumeStagePath)).ResumeStage,
      job: (await import(jobStagePath)).JobStage,
      analysis: (await import(analysisStagePath)).AnalysisStage,
      requirements: (await import(requirementsStagePath)).RequirementsStage,
      proposals: (await import(proposalsStagePath)).ProposalsStage,
      review: (await import(reviewStagePath)).ReviewStage,
      preview: (await import(previewStagePath)).PreviewStage,
      download: (await import(downloadStagePath)).DownloadStage,
    };
  });

  it("renders every extracted stage independently with semantic text", () => {
    const state = createTailoringDemoState();
    const dispatch = () => undefined;
    const noop = () => undefined;
    const rendered = Object.entries(stages).map(([stageId, Component]) =>
      renderToStaticMarkup(
        React.createElement(Component, {
          state,
          dispatch,
          onStart: noop,
          onRunAnalysis: noop,
          onApplyReview: noop,
          onDownload: noop,
          isAnalyzing: false,
          isApplyingReview: false,
        }),
      ),
    );

    expect(rendered.join("\n")).toContain("Comenzar");
    expect(rendered.join("\n")).toContain("Currículum");
    expect(rendered.join("\n")).toContain("Oferta laboral");
    expect(rendered.join("\n")).toContain("Ejecutar análisis determinista");
    expect(rendered.join("\n")).toContain("Todavía no hay requisitos analizados.");
    expect(rendered.join("\n")).toContain("Genera la vista previa antes de descargar.");
  });

  it("renders the stage heading as a focusable target", () => {
    const markup = renderToStaticMarkup(
      React.createElement(StageHeader, {
        stage: {
          id: "analysis",
          position: 4,
          title: "Analiza requisitos y compatibilidad",
          description: "Demo",
          shortLabel: "Análisis",
        },
        titleRef: { current: null },
      }),
    );

    expect(markup).toContain('id="stage-title"');
    expect(markup).toContain('tabindex="-1"');
  });

  it("keeps non-domain presentation state out of TailoringSession and avoids parallel currentStageId fields", () => {
    const source = [
      "apps/web/src/App.tsx",
      "apps/web/src/app/use-tailoring-demo-controller.ts",
      "apps/web/src/components/stages/TailoringDemoStage.tsx",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");

    expect(source).not.toMatch(/currentStageId\s*:/);
    expect(source).not.toMatch(/useState\([^)]*currentStage/i);
  });

  it("shows a safe retryable error when the offer has no extractable requirements", () => {
    let state = createTailoringDemoState();
    state = tailoringDemoReducer(state, { type: "set_resume_text", value: syntheticResume });
    state = tailoringDemoReducer(state, { type: "set_job_text", value: "Somos una empresa cercana con cultura colaborativa." });
    state = tailoringDemoReducer(state, { type: "run_analysis" });

    expect(state.analysis).toBeNull();
    expect(state.visibleError).toContain("No he encontrado requisitos concretos");
    expect(state.visibleError).not.toContain(syntheticResume);
    expect(state.visibleError).not.toContain("cultura colaborativa");
  });

  it("handles zero matches and zero proposals without inventing evidence", () => {
    const analysis = runTailoringDemoAnalysis(syntheticResume, noMatchJob);

    expect(analysis.scoringResult.score).toBe(0);
    expect(analysis.requirementRows.every((row: any) => row.evidenceTexts.length === 0)).toBe(true);
    expect(analysis.proposalRows).toEqual([]);
  });

  it("allows preview and export from the original document when there are zero proposals", () => {
    const analysis = runTailoringDemoAnalysis(syntheticResume, noMatchJob);
    const applied = applyTailoringDemoReview(analysis, {});

    expect(applied.applicationResult.summary.rewrittenBlocks).toBe(0);
    expect(applied.exportModel.summary.renderedFromOriginal).toBe(applied.exportModel.summary.totalBlocks);
    expect(applied.exportModel.sections[0].blocks.map((block: any) => block.renderText)).toEqual(
      syntheticResume.split("\n"),
    );
  });

  it("revokes the generated object URL after a DOCX download click", async () => {
    const events: string[] = [];
    const fakeResult = { contentBase64: "UEsDBAo=", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    const result = await downloadTailoringDemoDocx({} as any, {
      renderDocx: async () => fakeResult,
      resultToBlob: () => new Blob(["docx"]),
      createObjectURL: () => {
        events.push("create");
        return "blob:demo";
      },
      revokeObjectURL: (url: string) => {
        events.push(`revoke:${url}`);
      },
      createLink: () => ({
        href: "",
        download: "",
        click: () => {
          events.push(`click:${TAILORING_DEMO_DOWNLOAD_FILENAME}`);
        },
      }),
    });

    expect(result).toBe(fakeResult);
    expect(events).toEqual(["create", "click:curriculum-adaptado.docx", "revoke:blob:demo"]);
  });

  it("keeps privacy constraints out of new UI modules", () => {
    const source = [
      "apps/web/src/app/use-tailoring-demo-controller.ts",
      "apps/web/src/components/stages/DownloadStage.tsx",
      "apps/web/src/components/stages/ReviewStage.tsx",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");

    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|fetch|XMLHttpRequest/);
    expect(source).not.toMatch(/OpenAI|Anthropic|Gemini|analytics|console\.log/);
  });
});
