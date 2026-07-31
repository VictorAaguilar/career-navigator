import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

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

type TailoringSession = Readonly<{
  version: "tailoring_session_v1";
  currentStageId: WorkflowStageId;
  furthestStageId: WorkflowStageId;
  transitionCount: number;
}>;

type TailoringSessionStatus = "not_started" | "in_progress" | "ready_to_download";
type TailoringSessionStageStatus = "completed" | "current" | "visited" | "upcoming";
type TailoringSessionAction = { type: "advance" } | { type: "back" } | { type: "reset" };

type TailoringSessionModule = {
  TAILORING_SESSION_VERSION: "tailoring_session_v1";
  assertTailoringSession: (value: unknown) => asserts value is TailoringSession;
  createTailoringSession: () => TailoringSession;
  getTailoringSessionStageStatus: (
    session: TailoringSession,
    stageId: WorkflowStageId,
  ) => TailoringSessionStageStatus;
  getTailoringSessionStatus: (session: TailoringSession) => TailoringSessionStatus;
  isTailoringSession: (value: unknown) => value is TailoringSession;
};

type TailoringSessionReducerModule = {
  tailoringSessionReducer: (
    state: TailoringSession,
    action: TailoringSessionAction,
  ) => TailoringSession;
};

type AppModule = {
  default: React.ComponentType;
};

const sessionModulePath = "../../apps/web/src/app/tailoring-session";
const reducerModulePath = "../../apps/web/src/app/tailoring-session-reducer";
const appModulePath = "../../apps/web/src/App";

let TAILORING_SESSION_VERSION: TailoringSessionModule["TAILORING_SESSION_VERSION"];
let assertTailoringSession: TailoringSessionModule["assertTailoringSession"];
let createTailoringSession: TailoringSessionModule["createTailoringSession"];
let getTailoringSessionStageStatus: TailoringSessionModule["getTailoringSessionStageStatus"];
let getTailoringSessionStatus: TailoringSessionModule["getTailoringSessionStatus"];
let isTailoringSession: TailoringSessionModule["isTailoringSession"];
let tailoringSessionReducer: TailoringSessionReducerModule["tailoringSessionReducer"];
let App: React.ComponentType;

const initialSessionContract = {
  version: "tailoring_session_v1",
  currentStageId: "start",
  furthestStageId: "start",
  transitionCount: 0,
} as const satisfies TailoringSession;

function advanceTimes(session: TailoringSession, count: number): TailoringSession {
  let current = session;
  for (let index = 0; index < count; index += 1) {
    current = tailoringSessionReducer(current, { type: "advance" });
  }
  return current;
}

function backTimes(session: TailoringSession, count: number): TailoringSession {
  let current = session;
  for (let index = 0; index < count; index += 1) {
    current = tailoringSessionReducer(current, { type: "back" });
  }
  return current;
}

function mutableSession(overrides: Partial<TailoringSession> = {}): TailoringSession {
  return {
    ...initialSessionContract,
    ...overrides,
  } as TailoringSession;
}

describe("Tailoring session contracts", () => {
  beforeAll(async () => {
    ({
      TAILORING_SESSION_VERSION,
      assertTailoringSession,
      createTailoringSession,
      getTailoringSessionStageStatus,
      getTailoringSessionStatus,
      isTailoringSession,
    } = (await import(sessionModulePath)) as TailoringSessionModule);
    ({ tailoringSessionReducer } = (await import(reducerModulePath)) as TailoringSessionReducerModule);
    ({ default: App } = (await import(appModulePath)) as AppModule);
  });

  it("creates the exact initial TailoringSession contract", () => {
    expect(TAILORING_SESSION_VERSION).toBe("tailoring_session_v1");
    expect(createTailoringSession()).toEqual(initialSessionContract);
  });

  it("freezes the initial state", () => {
    expect(Object.isFrozen(createTailoringSession())).toBe(true);
  });

  it("creates equivalent independent initial sessions", () => {
    const first = createTailoringSession();
    const second = createTailoringSession();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("does not use timestamps or random IDs in session source", () => {
    const source = readFileSync(join(process.cwd(), "apps/web/src/app/tailoring-session.ts"), "utf8");
    expect(source).not.toMatch(/Date|Date\.now|performance\.now|Math\.random|randomUUID|crypto\.randomUUID/);
  });

  it("accepts the initial session", () => {
    expect(isTailoringSession(createTailoringSession())).toBe(true);
  });

  it("rejects null", () => {
    expect(isTailoringSession(null)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isTailoringSession([])).toBe(false);
  });

  it("rejects strings", () => {
    expect(isTailoringSession("tailoring_session_v1")).toBe(false);
  });

  it("rejects incomplete objects", () => {
    expect(isTailoringSession({ version: TAILORING_SESSION_VERSION })).toBe(false);
  });

  it("rejects additional properties", () => {
    expect(isTailoringSession({ ...initialSessionContract, sessionId: "session-1" })).toBe(false);
  });

  it("rejects unknown versions", () => {
    expect(isTailoringSession({ ...initialSessionContract, version: "tailoring_session_v2" })).toBe(false);
  });

  it("rejects unknown currentStageId", () => {
    expect(isTailoringSession({ ...initialSessionContract, currentStageId: "unknown" })).toBe(false);
  });

  it("rejects unknown furthestStageId", () => {
    expect(isTailoringSession({ ...initialSessionContract, furthestStageId: "unknown" })).toBe(false);
  });

  it("rejects negative transitionCount", () => {
    expect(isTailoringSession({ ...initialSessionContract, transitionCount: -1 })).toBe(false);
  });

  it("rejects decimal transitionCount", () => {
    expect(isTailoringSession({ ...initialSessionContract, transitionCount: 0.5 })).toBe(false);
  });

  it("rejects furthestStageId before currentStageId", () => {
    expect(
      isTailoringSession({
        ...initialSessionContract,
        currentStageId: "requirements",
        furthestStageId: "analysis",
        transitionCount: 1,
      }),
    ).toBe(false);
  });

  it("rejects transitionCount zero outside start", () => {
    expect(
      isTailoringSession({
        ...initialSessionContract,
        currentStageId: "resume",
        furthestStageId: "resume",
      }),
    ).toBe(false);
  });

  it("assertTailoringSession throws the stable invalid session error", () => {
    expect(() => assertTailoringSession("invalid")).toThrow("TAILORING_SESSION_INVALID");
  });

  it("does not mutate or freeze input during validation", () => {
    const input = mutableSession({ currentStageId: "resume", furthestStageId: "resume", transitionCount: 1 });
    const before = JSON.stringify(input);

    expect(isTailoringSession(input)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("advance moves exactly one stage", () => {
    expect(tailoringSessionReducer(createTailoringSession(), { type: "advance" }).currentStageId).toBe("resume");
  });

  it("advance increments transitionCount", () => {
    expect(tailoringSessionReducer(createTailoringSession(), { type: "advance" }).transitionCount).toBe(1);
  });

  it("advance updates furthestStageId", () => {
    expect(tailoringSessionReducer(createTailoringSession(), { type: "advance" }).furthestStageId).toBe("resume");
  });

  it("multiple advances reach download", () => {
    const result = advanceTimes(createTailoringSession(), CANONICAL_STAGE_IDS.length - 1);
    expect(result.currentStageId).toBe("download");
    expect(result.furthestStageId).toBe("download");
  });

  it("advance at download is a no-op", () => {
    const downloadSession = advanceTimes(createTailoringSession(), CANONICAL_STAGE_IDS.length - 1);
    expect(tailoringSessionReducer(downloadSession, { type: "advance" })).toBe(downloadSession);
    expect(downloadSession.transitionCount).toBe(8);
  });

  it("back moves exactly one stage", () => {
    const session = advanceTimes(createTailoringSession(), 2);
    expect(tailoringSessionReducer(session, { type: "back" }).currentStageId).toBe("resume");
  });

  it("back increments transitionCount", () => {
    const session = tailoringSessionReducer(createTailoringSession(), { type: "advance" });
    expect(tailoringSessionReducer(session, { type: "back" }).transitionCount).toBe(2);
  });

  it("back preserves furthestStageId", () => {
    const session = advanceTimes(createTailoringSession(), 2);
    const result = tailoringSessionReducer(session, { type: "back" });
    expect(result.furthestStageId).toBe("job");
  });

  it("back at start is a no-op", () => {
    const initial = createTailoringSession();
    expect(tailoringSessionReducer(initial, { type: "back" })).toBe(initial);
  });

  it("reset returns the initial contract", () => {
    const session = advanceTimes(createTailoringSession(), 3);
    expect(tailoringSessionReducer(session, { type: "reset" })).toEqual(initialSessionContract);
  });

  it("reset from initial returns a frozen equivalent initial session", () => {
    const initial = createTailoringSession();
    const reset = tailoringSessionReducer(initial, { type: "reset" });

    expect(reset).toEqual(initialSessionContract);
    expect(reset).not.toBe(initial);
    expect(Object.isFrozen(reset)).toBe(true);
  });

  it("reducer does not mutate input", () => {
    const input = mutableSession({ currentStageId: "resume", furthestStageId: "resume", transitionCount: 1 });
    const before = JSON.stringify(input);
    const result = tailoringSessionReducer(input, { type: "advance" });

    expect(JSON.stringify(input)).toBe(before);
    expect(result).not.toBe(input);
  });

  it("reducer accepts frozen input", () => {
    const input = Object.freeze(
      mutableSession({ currentStageId: "resume", furthestStageId: "resume", transitionCount: 1 }),
    );
    expect(tailoringSessionReducer(input, { type: "advance" }).currentStageId).toBe("job");
  });

  it("freezes every new reducer state", () => {
    const advanced = tailoringSessionReducer(createTailoringSession(), { type: "advance" });
    const backed = tailoringSessionReducer(advanced, { type: "back" });
    const reset = tailoringSessionReducer(advanced, { type: "reset" });

    expect(Object.isFrozen(advanced)).toBe(true);
    expect(Object.isFrozen(backed)).toBe(true);
    expect(Object.isFrozen(reset)).toBe(true);
  });

  it("rejects unknown actions with the stable action error", () => {
    expect(() =>
      tailoringSessionReducer(createTailoringSession(), { type: "goto" } as unknown as TailoringSessionAction),
    ).toThrow("TAILORING_SESSION_ACTION_INVALID");
  });

  it("rejects actions with additional payload", () => {
    expect(() =>
      tailoringSessionReducer(
        createTailoringSession(),
        { type: "advance", payload: "resume" } as unknown as TailoringSessionAction,
      ),
    ).toThrow("TAILORING_SESSION_ACTION_INVALID");
  });

  it("rejects malformed actions with the stable action error", () => {
    const invalidActions = [null, [], {}, { type: 1 }] as readonly unknown[];

    for (const action of invalidActions) {
      expect(() =>
        tailoringSessionReducer(createTailoringSession(), action as TailoringSessionAction),
      ).toThrow("TAILORING_SESSION_ACTION_INVALID");
    }
  });

  it("reports not_started for the initial session", () => {
    expect(getTailoringSessionStatus(createTailoringSession())).toBe("not_started");
  });

  it("reports in_progress after advancing", () => {
    expect(getTailoringSessionStatus(tailoringSessionReducer(createTailoringSession(), { type: "advance" }))).toBe(
      "in_progress",
    );
  });

  it("reports ready_to_download at download", () => {
    expect(getTailoringSessionStatus(advanceTimes(createTailoringSession(), 8))).toBe("ready_to_download");
  });

  it("reports in_progress after returning to start", () => {
    const returnedToStart = tailoringSessionReducer(
      tailoringSessionReducer(createTailoringSession(), { type: "advance" }),
      { type: "back" },
    );
    expect(returnedToStart.currentStageId).toBe("start");
    expect(getTailoringSessionStatus(returnedToStart)).toBe("in_progress");
  });

  it("marks start current and the rest upcoming in the initial session", () => {
    const session = createTailoringSession();
    expect(CANONICAL_STAGE_IDS.map((stageId) => getTailoringSessionStageStatus(session, stageId))).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks stages before current as completed", () => {
    const session = advanceTimes(createTailoringSession(), 4);
    expect(getTailoringSessionStageStatus(session, "analysis")).toBe("completed");
  });

  it("marks a reached later stage as visited after going back", () => {
    const proposals = advanceTimes(createTailoringSession(), 5);
    const requirements = tailoringSessionReducer(proposals, { type: "back" });
    expect(requirements.currentStageId).toBe("requirements");
    expect(getTailoringSessionStageStatus(requirements, "proposals")).toBe("visited");
  });

  it("marks stages after furthest as upcoming", () => {
    const proposals = advanceTimes(createTailoringSession(), 5);
    const requirements = tailoringSessionReducer(proposals, { type: "back" });
    expect(getTailoringSessionStageStatus(requirements, "review")).toBe("upcoming");
  });

  it("has exactly one current stage", () => {
    const session = backTimes(advanceTimes(createTailoringSession(), 6), 2);
    const currentStages = CANONICAL_STAGE_IDS.filter(
      (stageId) => getTailoringSessionStageStatus(session, stageId) === "current",
    );
    expect(currentStages).toEqual(["requirements"]);
  });

  it("keeps invariants during complete forward navigation", () => {
    let session = createTailoringSession();
    for (let index = 1; index < CANONICAL_STAGE_IDS.length; index += 1) {
      session = tailoringSessionReducer(session, { type: "advance" });
      expect(session.currentStageId).toBe(CANONICAL_STAGE_IDS[index]);
      expect(session.furthestStageId).toBe(CANONICAL_STAGE_IDS[index]);
      expect(session.transitionCount).toBe(index);
      expect(isTailoringSession(session)).toBe(true);
    }
  });

  it("keeps furthestStageId during complete reverse navigation", () => {
    let session = advanceTimes(createTailoringSession(), 8);
    for (let index = CANONICAL_STAGE_IDS.length - 2; index >= 0; index -= 1) {
      session = tailoringSessionReducer(session, { type: "back" });
      expect(session.currentStageId).toBe(CANONICAL_STAGE_IDS[index]);
      expect(session.furthestStageId).toBe("download");
      expect(isTailoringSession(session)).toBe(true);
    }
  });

  it("does not use time, random, storage, or network APIs in session sources", () => {
    const sources = [
      "apps/web/src/app/tailoring-session.ts",
      "apps/web/src/app/tailoring-session-reducer.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8"));

    for (const source of sources) {
      expect(source).not.toMatch(
        /Date\.now|Math\.random|randomUUID|fetch|localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
    }
  });

  it("renders the initial session state without a DOM test environment", () => {
    const markup = renderToStaticMarkup(React.createElement(App));

    expect(markup).toContain("Career Navigator");
    expect(markup).toContain("Sesión local");
    expect(markup).toContain("Sin iniciar");
    expect(markup).toContain("Actual");
    expect(markup).toContain("Pendiente");
    expect(markup).toContain("Paso 1 de 9");
    expect(markup).toContain("Tus datos no se almacenan en esta versión.");
    expect(markup).toMatch(/<button[^>]*disabled=""/);
    expect(markup).toContain(">Continuar</button>");
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("tailoring_session_v1");
    expect(markup).not.toContain("transitionCount");
    expect(markup).not.toContain("furthestStageId");
  });
});
