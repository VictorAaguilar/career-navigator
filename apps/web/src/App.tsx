import { useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { StagePlaceholder } from "./components/StagePlaceholder";
import { WorkflowNavigation } from "./components/WorkflowNavigation";
import { WorkflowStepper } from "./components/WorkflowStepper";
import { WORKFLOW_STAGES, type WorkflowStageId } from "./app/workflow-stages";
import {
  canNavigateBackward,
  canNavigateForward,
  getNextWorkflowStage,
  getPreviousWorkflowStage,
  getWorkflowNavigationState,
  getWorkflowStage,
} from "./app/workflow-navigation";

export default function App() {
  const [currentStageId, setCurrentStageId] = useState<WorkflowStageId>("start");
  const currentStage = getWorkflowStage(currentStageId);
  const navigationState = useMemo(
    () => getWorkflowNavigationState(currentStageId),
    [currentStageId],
  );

  const handlePrevious = () => {
    const previousStage = getPreviousWorkflowStage(currentStageId);
    if (previousStage !== null) {
      setCurrentStageId(previousStage.id);
    }
  };

  const handleNext = () => {
    const nextStage = getNextWorkflowStage(currentStageId);
    if (nextStage !== null) {
      setCurrentStageId(nextStage.id);
    }
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-layout">
        <WorkflowStepper stages={WORKFLOW_STAGES} currentStageId={currentStageId} />
        <main className="stage-panel" aria-labelledby="stage-title">
          <section className="stage-card">
            <div className="stage-progress" aria-live="polite">
              Paso {navigationState.currentPosition} de {navigationState.totalStages}
            </div>
            <StagePlaceholder stage={currentStage} />
            <WorkflowNavigation
              canGoBackward={canNavigateBackward(currentStageId)}
              canGoForward={canNavigateForward(currentStageId)}
              onPrevious={handlePrevious}
              onNext={handleNext}
            />
          </section>
        </main>
      </div>
      <footer className="privacy-footer">Tus datos no se almacenan en esta versión.</footer>
    </div>
  );
}
