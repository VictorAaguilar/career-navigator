import { useEffect, useMemo, useRef, useReducer, useState } from "react";
import type { DocxRenderResult } from "../../../../src/schemas/docx-render.js";
import {
  canAdvanceTailoringDemo,
  createTailoringDemoState,
  getStageGuardMessage,
  tailoringDemoReducer,
} from "./tailoring-demo-state";
import { TAILORING_DEMO_DOWNLOAD_FILENAME } from "./tailoring-demo-constants";
import {
  canNavigateBackward,
  canNavigateForward,
  getWorkflowNavigationState,
  getWorkflowStage,
} from "./workflow-navigation";
import {
  getTailoringSessionStatus,
} from "./tailoring-session";

type DocxDownloadDependencies = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createLink: () => Pick<HTMLAnchorElement, "href" | "download" | "click">;
  renderDocx: (exportModel: NonNullable<ReturnType<typeof createTailoringDemoState>["appliedResult"]>["exportModel"]) => Promise<DocxRenderResult>;
  resultToBlob: (result: DocxRenderResult) => Blob;
};

export async function downloadTailoringDemoDocx(
  exportModel: NonNullable<ReturnType<typeof createTailoringDemoState>["appliedResult"]>["exportModel"],
  dependencies: DocxDownloadDependencies,
): Promise<DocxRenderResult> {
  const result = await dependencies.renderDocx(exportModel);
  const blob = dependencies.resultToBlob(result);
  const objectUrl = dependencies.createObjectURL(blob);
  try {
    const link = dependencies.createLink();
    link.href = objectUrl;
    link.download = TAILORING_DEMO_DOWNLOAD_FILENAME;
    link.click();
  } finally {
    dependencies.revokeObjectURL(objectUrl);
  }
  return result;
}

export function useTailoringDemoController() {
  const [state, dispatch] = useReducer(tailoringDemoReducer, undefined, createTailoringDemoState);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplyingReview, setIsApplyingReview] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const session = state.session;
  const currentStage = getWorkflowStage(session.currentStageId);
  const navigationState = useMemo(
    () => getWorkflowNavigationState(session.currentStageId),
    [session.currentStageId],
  );
  const sessionStatus = getTailoringSessionStatus(session);
  const guardMessage = getStageGuardMessage(state);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [session.currentStageId]);

  const handlePrevious = () => {
    dispatch({ type: "navigate", direction: "back" });
  };

  const handleNext = () => {
    dispatch({ type: "navigate", direction: "advance" });
  };

  const handleRunAnalysis = () => {
    setIsAnalyzing(true);
    try {
      dispatch({ type: "run_analysis" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyReview = () => {
    setIsApplyingReview(true);
    try {
      dispatch({ type: "apply_review" });
    } finally {
      setIsApplyingReview(false);
    }
  };

  const handleDownload = async () => {
    if (state.appliedResult === null) {
      dispatch({ type: "docx_failed", error: "Genera la vista previa antes de preparar el DOCX." });
      return;
    }

    dispatch({ type: "docx_generating" });
    try {
      const { docxResultToBlob, renderTailoringDemoDocx } = await import("./tailoring-demo-docx");
      const result = await downloadTailoringDemoDocx(state.appliedResult.exportModel, {
        renderDocx: renderTailoringDemoDocx,
        resultToBlob: docxResultToBlob,
        createObjectURL: URL.createObjectURL.bind(URL),
        revokeObjectURL: URL.revokeObjectURL.bind(URL),
        createLink: () => document.createElement("a"),
      });
      dispatch({ type: "docx_ready", result });
    } catch {
      dispatch({
        type: "docx_failed",
        error: "No se pudo generar el DOCX en el navegador. Revisa la vista previa y vuelve a intentarlo.",
      });
    }
  };

  return {
    state,
    dispatch,
    session,
    currentStage,
    navigationState,
    sessionStatus,
    guardMessage,
    titleRef,
    isAnalyzing,
    isApplyingReview,
    canGoBackward: canNavigateBackward(session.currentStageId),
    canGoForward: canNavigateForward(session.currentStageId) && canAdvanceTailoringDemo(state),
    handlePrevious,
    handleNext,
    handleRunAnalysis,
    handleApplyReview,
    handleDownload,
  };
}
