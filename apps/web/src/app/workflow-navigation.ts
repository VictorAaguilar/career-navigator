import {
  WORKFLOW_STAGES,
  type WorkflowNavigationState,
  type WorkflowStage,
  type WorkflowStageId,
} from "./workflow-stages";

const INVALID_STAGE_ERROR = "WORKFLOW_STAGE_NOT_FOUND";

function isWorkflowStageId(stageId: string): stageId is WorkflowStageId {
  return WORKFLOW_STAGES.some((stage) => stage.id === stageId);
}

export function getWorkflowStage(stageId: WorkflowStageId | string): WorkflowStage {
  if (!isWorkflowStageId(stageId)) {
    throw new Error(INVALID_STAGE_ERROR);
  }

  const stage = WORKFLOW_STAGES.find((candidate) => candidate.id === stageId);
  if (stage === undefined) {
    throw new Error(INVALID_STAGE_ERROR);
  }

  return stage;
}

export function getWorkflowStageIndex(stageId: WorkflowStageId | string): number {
  const stage = getWorkflowStage(stageId);
  return stage.position - 1;
}

export function getPreviousWorkflowStage(stageId: WorkflowStageId | string): WorkflowStage | null {
  const index = getWorkflowStageIndex(stageId);
  return index === 0 ? null : WORKFLOW_STAGES[index - 1];
}

export function getNextWorkflowStage(stageId: WorkflowStageId | string): WorkflowStage | null {
  const index = getWorkflowStageIndex(stageId);
  return index === WORKFLOW_STAGES.length - 1 ? null : WORKFLOW_STAGES[index + 1];
}

export function canNavigateBackward(stageId: WorkflowStageId | string): boolean {
  return getPreviousWorkflowStage(stageId) !== null;
}

export function canNavigateForward(stageId: WorkflowStageId | string): boolean {
  return getNextWorkflowStage(stageId) !== null;
}

export function getWorkflowNavigationState(stageId: WorkflowStageId | string): WorkflowNavigationState {
  const currentStage = getWorkflowStage(stageId);
  const previousStage = getPreviousWorkflowStage(stageId);
  const nextStage = getNextWorkflowStage(stageId);

  return Object.freeze({
    currentStage,
    previousStage,
    nextStage,
    currentPosition: currentStage.position,
    totalStages: WORKFLOW_STAGES.length,
    canGoBackward: previousStage !== null,
    canGoForward: nextStage !== null,
  });
}
