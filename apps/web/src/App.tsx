import { AppHeader } from "./components/AppHeader";
import { SessionStatusBadge } from "./components/SessionStatusBadge";
import { TailoringDemoStage } from "./components/stages/TailoringDemoStage";
import { WorkflowNavigation } from "./components/WorkflowNavigation";
import { WorkflowStepper } from "./components/WorkflowStepper";
import { WORKFLOW_STAGES } from "./app/workflow-stages";
import { getTailoringSessionStageStatus } from "./app/tailoring-session";
import { useTailoringDemoController } from "./app/use-tailoring-demo-controller";

export default function App() {
  const controller = useTailoringDemoController();
  const {
    state,
    dispatch,
    session,
    currentStage,
    navigationState,
    sessionStatus,
    guardMessage,
    titleRef,
    resumeTextareaRef,
    resumeStructureSummaryRef,
    isAnalyzing,
    isApplyingReview,
    canGoBackward,
    canGoForward,
    handlePrevious,
    handleNext,
    handleResumeFileSelected,
    handleClearResumeImport,
    handleDetectResumeStructure,
    handleRunAnalysis,
    handleApplyReview,
    handleDownload,
  } = controller;

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
            {state.visibleError === null ? null : (
              <p className="error-banner" role="alert">
                {state.visibleError}
              </p>
            )}
            <TailoringDemoStage
              state={state}
              stage={currentStage}
              titleRef={titleRef}
              resumeTextareaRef={resumeTextareaRef}
              resumeStructureSummaryRef={resumeStructureSummaryRef}
              onStart={handleNext}
              onResumeFileSelected={handleResumeFileSelected}
              onClearResumeImport={handleClearResumeImport}
              onDetectResumeStructure={handleDetectResumeStructure}
              onRunAnalysis={handleRunAnalysis}
              onApplyReview={handleApplyReview}
              onDownload={handleDownload}
              isAnalyzing={isAnalyzing}
              isApplyingReview={isApplyingReview}
              dispatch={dispatch}
            />
            <WorkflowNavigation
              canGoBackward={canGoBackward}
              canGoForward={canGoForward}
              onPrevious={handlePrevious}
              onNext={handleNext}
              guardMessage={guardMessage}
            />
          </section>
        </main>
      </div>
      <footer className="privacy-footer">Tus datos no se almacenan en esta versión.</footer>
    </div>
  );
}
