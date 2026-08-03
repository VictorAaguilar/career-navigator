import type { RefObject } from "react";
import type { WorkflowStage } from "../../app/workflow-stages";
import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { AnalysisStage } from "./AnalysisStage";
import { DownloadStage } from "./DownloadStage";
import { JobStage } from "./JobStage";
import { PreviewStage } from "./PreviewStage";
import { ProposalsStage } from "./ProposalsStage";
import { RequirementsStage } from "./RequirementsStage";
import { ResumeStage } from "./ResumeStage";
import { ReviewStage } from "./ReviewStage";
import { StageHeader } from "./shared";
import { StartStage } from "./StartStage";
import type { DemoDispatch, StageHeaderProps } from "./stage-types";

type TailoringDemoStageProps = {
  state: TailoringDemoState;
  stage: WorkflowStage;
  titleRef: StageHeaderProps["titleRef"];
  resumeTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onStart: () => void;
  onResumeFileSelected: (file: File | null) => void;
  onClearResumeImport: () => void;
  onRunAnalysis: () => void;
  onApplyReview: () => void;
  onDownload: () => void;
  isAnalyzing: boolean;
  isApplyingReview: boolean;
  dispatch: DemoDispatch;
};

export function TailoringDemoStage({
  state,
  stage,
  titleRef,
  resumeTextareaRef,
  onStart,
  onResumeFileSelected,
  onClearResumeImport,
  onRunAnalysis,
  onApplyReview,
  onDownload,
  isAnalyzing,
  isApplyingReview,
  dispatch,
}: TailoringDemoStageProps) {
  return (
    <div className="stage-content">
      <StageHeader stage={stage} titleRef={titleRef} />
      {stage.id === "start" ? <StartStage onStart={onStart} /> : null}
      {stage.id === "resume" ? (
        <ResumeStage
          state={state}
          dispatch={dispatch}
          textareaRef={resumeTextareaRef}
          onFileSelected={onResumeFileSelected}
          onClearImport={onClearResumeImport}
        />
      ) : null}
      {stage.id === "job" ? <JobStage state={state} dispatch={dispatch} /> : null}
      {stage.id === "analysis" ? (
        <AnalysisStage state={state} onRunAnalysis={onRunAnalysis} isAnalyzing={isAnalyzing} />
      ) : null}
      {stage.id === "requirements" ? <RequirementsStage state={state} /> : null}
      {stage.id === "proposals" ? <ProposalsStage state={state} /> : null}
      {stage.id === "review" ? (
        <ReviewStage
          state={state}
          dispatch={dispatch}
          onApplyReview={onApplyReview}
          isApplyingReview={isApplyingReview}
        />
      ) : null}
      {stage.id === "preview" ? <PreviewStage state={state} /> : null}
      {stage.id === "download" ? <DownloadStage state={state} onDownload={onDownload} /> : null}
    </div>
  );
}
