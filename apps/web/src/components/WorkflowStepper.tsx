import {
  getTailoringSessionStageStatusLabel,
  type TailoringSessionStageStatus,
} from "../app/tailoring-session";
import type { WorkflowStage, WorkflowStageId } from "../app/workflow-stages";

type WorkflowStepperProps = {
  stages: readonly WorkflowStage[];
  currentStageId: WorkflowStageId;
  getStageStatus: (stageId: WorkflowStageId) => TailoringSessionStageStatus;
};

export function WorkflowStepper({ stages, currentStageId, getStageStatus }: WorkflowStepperProps) {
  return (
    <nav className="workflow-stepper" aria-label="Etapas del flujo de adaptación">
      <ol>
        {stages.map((stage) => {
          const status = getStageStatus(stage.id);
          const statusLabel = getTailoringSessionStageStatusLabel(status);

          return (
            <li
              key={stage.id}
              className={`stepper-item stepper-item-${status}`}
              aria-current={stage.id === currentStageId ? "step" : undefined}
            >
              <span className="stepper-index" aria-hidden="true">
                {stage.position}
              </span>
              <span className="stepper-copy">
                <span className="stepper-label">{stage.shortLabel}</span>
                <span className="stepper-status">{statusLabel}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
