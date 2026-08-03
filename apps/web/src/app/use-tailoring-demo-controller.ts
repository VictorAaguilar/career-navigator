import { useEffect, useMemo, useRef, useReducer, useState } from "react";
import type { DocxRenderResult } from "../../../../src/schemas/docx-render.js";
import type { ResumeImportSource } from "./resume-file-import.js";
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
  const resumeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resumeStructureSummaryRef = useRef<HTMLDivElement | null>(null);
  const resumeImportSequenceRef = useRef(0);
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

  const handleResumeFileSelected = async (file: File | null) => {
    const sequence = resumeImportSequenceRef.current + 1;
    resumeImportSequenceRef.current = sequence;

    try {
      const {
        ResumeImportError,
        ResumeImportErrorCode,
        getResumeImportSource,
        importResumeFile,
      } = await import("./resume-file-import");
      if (file === null) {
        throw new ResumeImportError(ResumeImportErrorCode.FileRequired);
      }
      const source = getResumeImportSource(file);
      dispatch({ type: "resume_import_started", source });
      const result = await importResumeFile(file);
      if (resumeImportSequenceRef.current !== sequence) {
        return;
      }
      dispatch({
        type: "resume_import_succeeded",
        source: result.source,
        text: result.text,
        warnings: result.warnings,
      });
      resumeTextareaRef.current?.focus({ preventScroll: false });
    } catch (error) {
      if (resumeImportSequenceRef.current !== sequence) {
        return;
      }
      const { ResumeImportError } = await import("./resume-file-import");
      const source = inferFailedImportSource(file);
      dispatch({
        type: "resume_import_failed",
        source,
        errorCode: error instanceof ResumeImportError ? error.code : "RESUME_IMPORT_FAILED",
      });
    }
  };

  const handleClearResumeImport = () => {
    resumeImportSequenceRef.current += 1;
    dispatch({ type: "resume_import_cleared" });
    resumeTextareaRef.current?.focus({ preventScroll: false });
  };

  const handleDetectResumeStructure = () => {
    dispatch({ type: "detect_resume_structure" });
    window.setTimeout(() => {
      resumeStructureSummaryRef.current?.focus({ preventScroll: false });
    }, 0);
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
    resumeTextareaRef,
    resumeStructureSummaryRef,
    isAnalyzing,
    isApplyingReview,
    canGoBackward: canNavigateBackward(session.currentStageId),
    canGoForward: canNavigateForward(session.currentStageId) && canAdvanceTailoringDemo(state),
    handlePrevious,
    handleNext,
    handleRunAnalysis,
    handleResumeFileSelected,
    handleClearResumeImport,
    handleDetectResumeStructure,
    handleApplyReview,
    handleDownload,
  };
}

function inferFailedImportSource(file: File | null): ResumeImportSource {
  if (file === null) {
    return "manual";
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    return "docx";
  }
  if (name.endsWith(".pdf")) {
    return "pdf";
  }
  return "manual";
}
