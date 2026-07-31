import { getWorkflowStageIndex } from "./workflow-navigation";
import { WORKFLOW_STAGES, type WorkflowStageId } from "./workflow-stages";

export const TAILORING_SESSION_VERSION = "tailoring_session_v1";
export const TAILORING_SESSION_INVALID_ERROR = "TAILORING_SESSION_INVALID";

export type TailoringSession = Readonly<{
  version: typeof TAILORING_SESSION_VERSION;
  currentStageId: WorkflowStageId;
  furthestStageId: WorkflowStageId;
  transitionCount: number;
}>;

export type TailoringSessionStatus = "not_started" | "in_progress" | "ready_to_download";
export type TailoringSessionStageStatus = "completed" | "current" | "visited" | "upcoming";

export const TAILORING_SESSION_STATUS_LABELS: Readonly<Record<TailoringSessionStatus, string>> =
  Object.freeze({
    not_started: "Sin iniciar",
    in_progress: "En curso",
    ready_to_download: "Preparada para descargar",
  });

export const TAILORING_SESSION_STAGE_STATUS_LABELS: Readonly<
  Record<TailoringSessionStageStatus, string>
> = Object.freeze({
  completed: "Completada",
  current: "Actual",
  visited: "Visitada",
  upcoming: "Pendiente",
});

const allowedSessionKeys = Object.freeze([
  "version",
  "currentStageId",
  "furthestStageId",
  "transitionCount",
] as const);

function freezeSession(session: TailoringSession): TailoringSession {
  return Object.freeze(session);
}

function isPlainSessionObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactSessionKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === allowedSessionKeys.length &&
    allowedSessionKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isWorkflowStageId(value: unknown): value is WorkflowStageId {
  return typeof value === "string" && WORKFLOW_STAGES.some((stage) => stage.id === value);
}

export function createTailoringSession(): TailoringSession {
  return freezeSession({
    version: TAILORING_SESSION_VERSION,
    currentStageId: "start",
    furthestStageId: "start",
    transitionCount: 0,
  });
}

export function isTailoringSession(value: unknown): value is TailoringSession {
  if (!isPlainSessionObject(value) || !hasExactSessionKeys(value)) {
    return false;
  }

  if (value.version !== TAILORING_SESSION_VERSION) {
    return false;
  }

  if (!isWorkflowStageId(value.currentStageId) || !isWorkflowStageId(value.furthestStageId)) {
    return false;
  }

  const transitionCount = value.transitionCount;
  if (typeof transitionCount !== "number" || !Number.isInteger(transitionCount) || transitionCount < 0) {
    return false;
  }

  const currentIndex = getWorkflowStageIndex(value.currentStageId);
  const furthestIndex = getWorkflowStageIndex(value.furthestStageId);
  if (furthestIndex < currentIndex) {
    return false;
  }

  if (
    transitionCount === 0 &&
    (value.currentStageId !== "start" || value.furthestStageId !== "start")
  ) {
    return false;
  }

  return true;
}

export function assertTailoringSession(value: unknown): asserts value is TailoringSession {
  if (!isTailoringSession(value)) {
    throw new Error(TAILORING_SESSION_INVALID_ERROR);
  }
}

export function getTailoringSessionStatus(session: TailoringSession): TailoringSessionStatus {
  assertTailoringSession(session);

  if (session.currentStageId === "start" && session.transitionCount === 0) {
    return "not_started";
  }

  if (session.currentStageId === "download") {
    return "ready_to_download";
  }

  return "in_progress";
}

export function getTailoringSessionStatusLabel(status: TailoringSessionStatus): string {
  return TAILORING_SESSION_STATUS_LABELS[status];
}

export function getTailoringSessionStageStatus(
  session: TailoringSession,
  stageId: WorkflowStageId,
): TailoringSessionStageStatus {
  assertTailoringSession(session);

  if (stageId === session.currentStageId) {
    return "current";
  }

  const stageIndex = getWorkflowStageIndex(stageId);
  const currentIndex = getWorkflowStageIndex(session.currentStageId);
  const furthestIndex = getWorkflowStageIndex(session.furthestStageId);

  if (stageIndex < currentIndex) {
    return "completed";
  }

  if (stageIndex <= furthestIndex) {
    return "visited";
  }

  return "upcoming";
}

export function getTailoringSessionStageStatusLabel(
  status: TailoringSessionStageStatus,
): string {
  return TAILORING_SESSION_STAGE_STATUS_LABELS[status];
}
