import { useMemo, useReducer } from "react";
import { AppHeader } from "./components/AppHeader";
import { SessionStatusBadge } from "./components/SessionStatusBadge";
import { StagePlaceholder } from "./components/StagePlaceholder";
import { WorkflowNavigation } from "./components/WorkflowNavigation";
import { WorkflowStepper } from "./components/WorkflowStepper";
import { WORKFLOW_STAGES } from "./app/workflow-stages";
import {
  createTailoringSession,
  getTailoringSessionStageStatus,
  getTailoringSessionStatus,
} from "./app/tailoring-session";
import { tailoringSessionReducer } from "./app/tailoring-session-reducer";
import {
  canNavigateBackward,
  canNavigateForward,
  getWorkflowNavigationState,
  getWorkflowStage,
} from "./app/workflow-navigation";

export default function App() {
  const [session, dispatch] = useReducer(tailoringSessionReducer, undefined, createTailoringSession);
  const currentStage = getWorkflowStage(session.currentStageId);
  const navigationState = useMemo(
    () => getWorkflowNavigationState(session.currentStageId),
    [session.currentStageId],
  );
  const sessionStatus = getTailoringSessionStatus(session);

  const handlePrevious = () => {
    dispatch({ type: "back" });
  };

  const handleNext = () => {
    dispatch({ type: "advance" });
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-layout">
        <WorkflowStepper
          stages={WORKFLOW_STAGES}
          currentStageId={session.currentStageId}
          getStageStatus={(stageId) => getTailoringSessionStageStatus(session, stageId)}
        />
        <main className="stage-panel" aria-labelledby="stage-title">
          <section className="stage-card">
            <div className="stage-meta">
              <SessionStatusBadge status={sessionStatus} />
              <div className="stage-progress" aria-live="polite">
                Paso {navigationState.currentPosition} de {navigationState.totalStages}
              </div>
            </div>
            <StagePlaceholder stage={currentStage} />
            <WorkflowNavigation
              canGoBackward={canNavigateBackward(session.currentStageId)}
              canGoForward={canNavigateForward(session.currentStageId)}
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
