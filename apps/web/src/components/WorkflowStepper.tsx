import type { WorkflowStage, WorkflowStageId } from "../app/workflow-stages";

type WorkflowStepperProps = {
  stages: readonly WorkflowStage[];
  currentStageId: WorkflowStageId;
};

export function WorkflowStepper({ stages, currentStageId }: WorkflowStepperProps) {
  const currentStage = stages.find((stage) => stage.id === currentStageId);
  const currentPosition = currentStage?.position ?? 1;

  return (
    <nav className="workflow-stepper" aria-label="Etapas del flujo de adaptación">
      <ol>
        {stages.map((stage) => {
          const status = stage.position < currentPosition
            ? "Completada"
            : stage.position === currentPosition
              ? "Actual"
              : "Pendiente";

          return (
            <li
              key={stage.id}
              className={`stepper-item stepper-item-${status.toLowerCase()}`}
              aria-current={stage.id === currentStageId ? "step" : undefined}
            >
              <span className="stepper-index" aria-hidden="true">
                {stage.position}
              </span>
              <span className="stepper-copy">
                <span className="stepper-label">{stage.shortLabel}</span>
                <span className="stepper-status">{status}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
