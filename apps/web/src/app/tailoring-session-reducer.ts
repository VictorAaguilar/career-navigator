import {
  assertTailoringSession,
  createTailoringSession,
  type TailoringSession,
} from "./tailoring-session";
import {
  getNextWorkflowStage,
  getPreviousWorkflowStage,
  getWorkflowStageIndex,
} from "./workflow-navigation";

export const TAILORING_SESSION_ACTION_INVALID_ERROR = "TAILORING_SESSION_ACTION_INVALID";

export type TailoringSessionAction =
  | { type: "advance" }
  | { type: "back" }
  | { type: "reset" };

const allowedActionTypes = Object.freeze(["advance", "back", "reset"] as const);

function isValidTailoringSessionAction(value: unknown): value is TailoringSessionAction {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const action = value as Record<string, unknown>;
  const keys = Object.keys(action);
  return (
    keys.length === 1 &&
    Object.prototype.hasOwnProperty.call(action, "type") &&
    typeof action.type === "string" &&
    allowedActionTypes.some((type) => type === action.type)
  );
}

function assertTailoringSessionAction(value: unknown): asserts value is TailoringSessionAction {
  if (!isValidTailoringSessionAction(value)) {
    throw new Error(TAILORING_SESSION_ACTION_INVALID_ERROR);
  }
}

function freezeSession(session: TailoringSession): TailoringSession {
  return Object.freeze(session);
}

export function tailoringSessionReducer(
  state: TailoringSession,
  action: TailoringSessionAction,
): TailoringSession {
  assertTailoringSession(state);
  assertTailoringSessionAction(action);

  if (action.type === "reset") {
    return createTailoringSession();
  }

  if (action.type === "advance") {
    const nextStage = getNextWorkflowStage(state.currentStageId);
    if (nextStage === null) {
      return state;
    }

    const nextIndex = getWorkflowStageIndex(nextStage.id);
    const furthestIndex = getWorkflowStageIndex(state.furthestStageId);

    return freezeSession({
      ...state,
      currentStageId: nextStage.id,
      furthestStageId: nextIndex > furthestIndex ? nextStage.id : state.furthestStageId,
      transitionCount: state.transitionCount + 1,
    });
  }

  const previousStage = getPreviousWorkflowStage(state.currentStageId);
  if (previousStage === null) {
    return state;
  }

  return freezeSession({
    ...state,
    currentStageId: previousStage.id,
    transitionCount: state.transitionCount + 1,
  });
}
