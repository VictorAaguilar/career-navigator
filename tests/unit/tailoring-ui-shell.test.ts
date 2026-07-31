import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

const CANONICAL_STAGE_IDS = [
  "start",
  "resume",
  "job",
  "analysis",
  "requirements",
  "proposals",
  "review",
  "preview",
  "download",
] as const;

type WorkflowStageId = (typeof CANONICAL_STAGE_IDS)[number];

type WorkflowStage = Readonly<{
  id: WorkflowStageId;
  shortLabel: string;
  title: string;
  description: string;
  position: number;
}>;

type WorkflowStagesModule = {
  WORKFLOW_STAGES: readonly WorkflowStage[];
};

type WorkflowNavigationModule = {
  canNavigateBackward: (stageId: WorkflowStageId | string) => boolean;
  canNavigateForward: (stageId: WorkflowStageId | string) => boolean;
  getNextWorkflowStage: (stageId: WorkflowStageId | string) => WorkflowStage | null;
  getPreviousWorkflowStage: (stageId: WorkflowStageId | string) => WorkflowStage | null;
  getWorkflowStage: (stageId: WorkflowStageId | string) => WorkflowStage;
  getWorkflowStageIndex: (stageId: WorkflowStageId | string) => number;
};

type AppModule = {
  default: React.ComponentType;
};

const workflowStagesModulePath = "../../apps/web/src/app/workflow-stages";
const workflowNavigationModulePath = "../../apps/web/src/app/workflow-navigation";
const appModulePath = "../../apps/web/src/App";

let WORKFLOW_STAGES: readonly WorkflowStage[];
let App: React.ComponentType;
let canNavigateBackward: WorkflowNavigationModule["canNavigateBackward"];
let canNavigateForward: WorkflowNavigationModule["canNavigateForward"];
let getNextWorkflowStage: WorkflowNavigationModule["getNextWorkflowStage"];
let getPreviousWorkflowStage: WorkflowNavigationModule["getPreviousWorkflowStage"];
let getWorkflowStage: WorkflowNavigationModule["getWorkflowStage"];
let getWorkflowStageIndex: WorkflowNavigationModule["getWorkflowStageIndex"];

const snapshotStages = (): string => JSON.stringify(WORKFLOW_STAGES);

describe("Tailoring UI workflow shell", () => {
  beforeAll(async () => {
    ({ WORKFLOW_STAGES } = (await import(workflowStagesModulePath)) as WorkflowStagesModule);
    ({
      canNavigateBackward,
      canNavigateForward,
      getNextWorkflowStage,
      getPreviousWorkflowStage,
      getWorkflowStage,
      getWorkflowStageIndex,
    } = (await import(workflowNavigationModulePath)) as WorkflowNavigationModule);
    ({ default: App } = (await import(appModulePath)) as AppModule);
  });

  it("defines exactly nine stages in canonical order", () => {
    expect(WORKFLOW_STAGES).toHaveLength(9);
    expect(WORKFLOW_STAGES.map((stage) => stage.id)).toEqual(CANONICAL_STAGE_IDS);
  });

  it("keeps stage IDs unique", () => {
    expect(new Set(WORKFLOW_STAGES.map((stage) => stage.id)).size).toBe(WORKFLOW_STAGES.length);
  });

  it("keeps stage positions unique", () => {
    expect(new Set(WORKFLOW_STAGES.map((stage) => stage.position)).size).toBe(WORKFLOW_STAGES.length);
  });

  it("uses positions 1 through 9", () => {
    expect(WORKFLOW_STAGES.map((stage) => stage.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("keeps labels, titles, and descriptions non-empty", () => {
    for (const stage of WORKFLOW_STAGES) {
      expect(stage.shortLabel.trim()).not.toBe("");
      expect(stage.title.trim()).not.toBe("");
      expect(stage.description.trim()).not.toBe("");
    }
  });

  it("freezes WORKFLOW_STAGES and every stage object", () => {
    expect(Object.isFrozen(WORKFLOW_STAGES)).toBe(true);
    for (const stage of WORKFLOW_STAGES) {
      expect(Object.isFrozen(stage)).toBe(true);
    }
  });

  it("returns the requested stage", () => {
    expect(getWorkflowStage("requirements").shortLabel).toBe("Evidencias");
    expect(getWorkflowStage("resume").shortLabel).toBe("Currículum");
    expect(getWorkflowStage("analysis").shortLabel).toBe("Análisis");
    expect(getWorkflowStage("review").shortLabel).toBe("Revisión");
    expect(getWorkflowStage("preview").title).toBe("Revisa el currículum adaptado");
    expect(getWorkflowStageIndex("requirements")).toBe(4);
  });

  it("handles invalid runtime stage IDs with a stable error", () => {
    expect(() => getWorkflowStage("invalid-stage")).toThrow("WORKFLOW_STAGE_NOT_FOUND");
  });

  it("returns null before start and after download", () => {
    expect(getPreviousWorkflowStage("start")).toBeNull();
    expect(getNextWorkflowStage("download")).toBeNull();
  });

  it("advances exactly one stage", () => {
    for (let index = 0; index < CANONICAL_STAGE_IDS.length - 1; index += 1) {
      expect(getNextWorkflowStage(CANONICAL_STAGE_IDS[index])?.id).toBe(CANONICAL_STAGE_IDS[index + 1]);
    }
  });

  it("moves backward exactly one stage", () => {
    for (let index = 1; index < CANONICAL_STAGE_IDS.length; index += 1) {
      expect(getPreviousWorkflowStage(CANONICAL_STAGE_IDS[index])?.id).toBe(CANONICAL_STAGE_IDS[index - 1]);
    }
  });

  it("allows backward navigation except on start", () => {
    expect(CANONICAL_STAGE_IDS.filter((stageId) => !canNavigateBackward(stageId))).toEqual(["start"]);
  });

  it("allows forward navigation except on download", () => {
    expect(CANONICAL_STAGE_IDS.filter((stageId) => !canNavigateForward(stageId))).toEqual(["download"]);
  });

  it("does not mutate WORKFLOW_STAGES while navigating", () => {
    const before = snapshotStages();
    for (const stageId of CANONICAL_STAGE_IDS) {
      getWorkflowStage(stageId);
      getPreviousWorkflowStage(stageId);
      getNextWorkflowStage(stageId);
      canNavigateBackward(stageId);
      canNavigateForward(stageId);
    }
    expect(snapshotStages()).toBe(before);
  });

  it("navigates from start to download", () => {
    const visited: WorkflowStageId[] = [];
    let current: WorkflowStageId | null = "start";
    while (current !== null) {
      visited.push(current);
      current = getNextWorkflowStage(current)?.id ?? null;
    }
    expect(visited).toEqual(CANONICAL_STAGE_IDS);
  });

  it("navigates from download to start", () => {
    const visited: WorkflowStageId[] = [];
    let current: WorkflowStageId | null = "download";
    while (current !== null) {
      visited.push(current);
      current = getPreviousWorkflowStage(current)?.id ?? null;
    }
    expect(visited).toEqual([...CANONICAL_STAGE_IDS].reverse());
  });

  it("does not use Date, random, UUID, or network APIs in navigation logic", () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    const randomSpy = vi.spyOn(Math, "random");
    const randomUuidSpy = vi.spyOn(crypto, "randomUUID");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    for (const stageId of CANONICAL_STAGE_IDS) {
      getWorkflowStage(stageId);
      getPreviousWorkflowStage(stageId);
      getNextWorkflowStage(stageId);
    }

    expect(dateNowSpy).not.toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(randomUuidSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
    randomUuidSpy.mockRestore();
    fetchSpy.mockRestore();

    const navigationSource = readFileSync(
      join(process.cwd(), "apps/web/src/app/workflow-navigation.ts"),
      "utf8",
    );
    expect(navigationSource).not.toMatch(/Date|Math\.random|randomUUID|fetch|XMLHttpRequest|localeCompare/);
  });

  it("renders the initial App shell with React server rendering", () => {
    const markup = renderToStaticMarkup(React.createElement(App));

    expect(markup).toContain("Career Navigator");
    expect(markup).toContain("Adaptación de currículum asistida y revisable");
    expect(markup).toContain("Comienza una nueva adaptación");
    expect(markup).toContain("Paso 1 de 9");
    expect(markup).toContain("Anterior");
    expect(markup).toContain("Continuar");
    expect(markup).toContain("Currículum");
    expect(markup).toContain("Análisis");
    expect(markup).toContain("Revisión");
    expect(markup).toContain("Tus datos no se almacenan en esta versión.");
  });
});
