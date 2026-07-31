import type { DocxRenderResult } from "../../../../src/schemas/docx-render.js";
import type { RewriteCandidateSubmission } from "../../../../src/schemas/candidate.js";
import { createTailoringSession, type TailoringSession } from "./tailoring-session.js";
import { tailoringSessionReducer } from "./tailoring-session-reducer.js";
import type { WorkflowStageId } from "./workflow-stages.js";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits.js";
import {
  applyTailoringDemoReview,
  decisionIsApplicable,
  isReviewComplete,
  rebuildValidationWithCandidates,
  runTailoringDemoAnalysis,
  TailoringDemoPipelineErrorCode,
  type DemoAnalysisResult,
  type DemoAppliedResult,
  type DemoReviewDecisionType,
  type DemoReviewState,
} from "./tailoring-demo-pipeline.js";

export const TAILORING_DEMO_ACTION_INVALID_ERROR = "TAILORING_DEMO_ACTION_INVALID";

export type TailoringDemoDocxState = Readonly<
  | { status: "idle"; result: null; error: null }
  | { status: "generating"; result: null; error: null }
  | { status: "ready"; result: DocxRenderResult; error: null }
  | { status: "failed"; result: null; error: string }
>;

export type TailoringDemoState = Readonly<{
  session: TailoringSession;
  resumeText: string;
  jobText: string;
  analysis: DemoAnalysisResult | null;
  reviewDecisions: DemoReviewState;
  appliedResult: DemoAppliedResult | null;
  docx: TailoringDemoDocxState;
  visibleError: string | null;
}>;

export type TailoringDemoAction =
  | { type: "set_resume_text"; value: string }
  | { type: "clear_resume_text" }
  | { type: "set_job_text"; value: string }
  | { type: "clear_job_text" }
  | { type: "run_analysis" }
  | { type: "set_review_decision"; validationId: string; decision: DemoReviewDecisionType }
  | { type: "edit_proposal"; validationId: string; value: string }
  | { type: "restore_proposal"; validationId: string }
  | { type: "apply_review" }
  | { type: "docx_generating" }
  | { type: "docx_ready"; result: DocxRenderResult }
  | { type: "docx_failed"; error: string }
  | { type: "navigate"; direction: "back" | "advance" }
  | { type: "reset_demo" };

const allowedActionTypes = Object.freeze([
  "set_resume_text",
  "clear_resume_text",
  "set_job_text",
  "clear_job_text",
  "run_analysis",
  "set_review_decision",
  "edit_proposal",
  "restore_proposal",
  "apply_review",
  "docx_generating",
  "docx_ready",
  "docx_failed",
  "navigate",
  "reset_demo",
] as const);

export function createTailoringDemoState(): TailoringDemoState {
  return freezeState({
    session: createTailoringSession(),
    resumeText: "",
    jobText: "",
    analysis: null,
    reviewDecisions: {},
    appliedResult: null,
    docx: idleDocx(),
    visibleError: null,
  });
}

export function tailoringDemoReducer(
  state: TailoringDemoState,
  action: TailoringDemoAction,
): TailoringDemoState {
  assertTailoringDemoAction(action);

  if (action.type === "reset_demo") {
    return createTailoringDemoState();
  }

  if (action.type === "navigate") {
    return reduceNavigation(state, action.direction);
  }

  if (action.type === "set_resume_text") {
    return freezeState({
      ...state,
      resumeText: action.value,
      ...emptyDerivedState(),
      visibleError: null,
    });
  }

  if (action.type === "clear_resume_text") {
    return freezeState({
      ...state,
      resumeText: "",
      ...emptyDerivedState(),
      visibleError: null,
    });
  }

  if (action.type === "set_job_text") {
    return freezeState({
      ...state,
      jobText: action.value,
      ...emptyDerivedState(),
      visibleError: null,
    });
  }

  if (action.type === "clear_job_text") {
    return freezeState({
      ...state,
      jobText: "",
      ...emptyDerivedState(),
      visibleError: null,
    });
  }

  if (action.type === "run_analysis") {
    try {
      const analysis = runTailoringDemoAnalysis(state.resumeText, state.jobText);
      return freezeState({
        ...state,
        analysis,
        reviewDecisions: {},
        appliedResult: null,
        docx: idleDocx(),
        visibleError: null,
      });
    } catch (error) {
      return freezeState({ ...state, visibleError: safeErrorMessage(error), ...emptyDerivedState() });
    }
  }

  if (action.type === "set_review_decision") {
    if (state.analysis === null) {
      return freezeState({ ...state, visibleError: "Ejecuta el análisis antes de revisar propuestas." });
    }
    const result = state.analysis.validationBatch.results.find((item) => item.validationId === action.validationId);
    if (result === undefined || !decisionIsApplicable(result, action.decision)) {
      return freezeState({ ...state, visibleError: "Esta decisión no es aplicable a la validación actual." });
    }
    return freezeState({
      ...state,
      reviewDecisions: {
        ...state.reviewDecisions,
        [action.validationId]: action.decision,
      },
      appliedResult: null,
      docx: idleDocx(),
      visibleError: null,
    });
  }

  if (action.type === "edit_proposal" || action.type === "restore_proposal") {
    return reduceProposalEdit(state, action);
  }

  if (action.type === "apply_review") {
    if (state.analysis === null || !isReviewComplete(state.analysis, state.reviewDecisions)) {
      return freezeState({ ...state, visibleError: "Todas las propuestas necesitan una decisión antes de continuar." });
    }
    try {
      const appliedResult = applyTailoringDemoReview(state.analysis, state.reviewDecisions);
      return freezeState({
        ...state,
        appliedResult,
        docx: idleDocx(),
        visibleError: null,
      });
    } catch (error) {
      return freezeState({ ...state, visibleError: safeErrorMessage(error), appliedResult: null, docx: idleDocx() });
    }
  }

  if (action.type === "docx_generating") {
    return freezeState({ ...state, docx: { status: "generating", result: null, error: null }, visibleError: null });
  }

  if (action.type === "docx_ready") {
    return freezeState({ ...state, docx: { status: "ready", result: action.result, error: null }, visibleError: null });
  }

  return freezeState({
    ...state,
    docx: { status: "failed", result: null, error: action.error },
    visibleError: action.error,
  });
}

export function canAdvanceTailoringDemo(state: TailoringDemoState): boolean {
  const stageId = state.session.currentStageId;
  if (stageId === "start") {
    return true;
  }
  if (stageId === "resume") {
    return validateTextForStage("resume", state.resumeText) === null;
  }
  if (stageId === "job") {
    return validateTextForStage("job", state.jobText) === null;
  }
  if (stageId === "analysis" || stageId === "requirements" || stageId === "proposals") {
    return state.analysis !== null;
  }
  if (stageId === "review") {
    return state.appliedResult !== null;
  }
  if (stageId === "preview") {
    return state.appliedResult !== null;
  }
  return false;
}

export function validateTextForStage(stageId: "resume" | "job", value: string): string | null {
  if (value.trim().length === 0) {
    return stageId === "resume" ? "Pega el contenido del currículum para continuar." : "Pega la oferta para continuar.";
  }
  const maxLength = stageId === "resume"
    ? TAILORING_DEMO_LIMITS.resumeTextMaxLength
    : TAILORING_DEMO_LIMITS.jobTextMaxLength;
  if (value.length > maxLength) {
    return stageId === "resume"
      ? "El currículum supera el límite de la demo."
      : "La oferta supera el límite de la demo.";
  }
  return null;
}

export function getStageGuardMessage(state: TailoringDemoState): string | null {
  const stageId = state.session.currentStageId;
  if (stageId === "resume") {
    return validateTextForStage("resume", state.resumeText);
  }
  if (stageId === "job") {
    return validateTextForStage("job", state.jobText);
  }
  if (stageId === "analysis" && state.analysis === null) {
    return "Ejecuta el análisis determinista para continuar.";
  }
  if ((stageId === "requirements" || stageId === "proposals") && state.analysis === null) {
    return "Vuelve al análisis y genera resultados vigentes.";
  }
  if (stageId === "review" && state.analysis !== null && !isReviewComplete(state.analysis, state.reviewDecisions)) {
    return "Revisa todas las propuestas antes de aplicar cambios.";
  }
  if (stageId === "review" && state.appliedResult === null) {
    return "Aplica las decisiones para generar la vista previa.";
  }
  if (stageId === "preview" && state.appliedResult === null) {
    return "La vista previa requiere decisiones aplicadas.";
  }
  return null;
}

function reduceNavigation(state: TailoringDemoState, direction: "back" | "advance"): TailoringDemoState {
  if (direction === "back") {
    return freezeState({
      ...state,
      session: tailoringSessionReducer(state.session, { type: "back" }),
      visibleError: null,
    });
  }
  if (!canAdvanceTailoringDemo(state)) {
    return freezeState({ ...state, visibleError: getStageGuardMessage(state) ?? "La etapa actual todavía no está lista." });
  }
  return freezeState({
    ...state,
    session: tailoringSessionReducer(state.session, { type: "advance" }),
    visibleError: null,
  });
}

function reduceProposalEdit(
  state: TailoringDemoState,
  action: Extract<TailoringDemoAction, { type: "edit_proposal" | "restore_proposal" }>,
): TailoringDemoState {
  if (state.analysis === null) {
    return freezeState({ ...state, visibleError: "Ejecuta el análisis antes de editar propuestas." });
  }
  const proposal = state.analysis.proposalRows.find((row) => row.validationId === action.validationId);
  if (proposal === undefined) {
    return freezeState({ ...state, visibleError: "La propuesta ya no está vigente." });
  }
  const nextText = action.type === "restore_proposal" ? proposal.proposedText : action.value;
  const candidates = state.analysis.candidateSubmissions.map((candidate): RewriteCandidateSubmission =>
    candidate.requestId === proposal.requestId
      ? { requestId: candidate.requestId, candidateText: nextText }
      : { ...candidate },
  );
  try {
    const rebuilt = rebuildValidationWithCandidates(state.analysis, candidates);
    const nextDecisions = { ...state.reviewDecisions };
    const nextResult = rebuilt.validationBatch.results.find((result) => result.validationId === action.validationId);
    if (nextResult?.status === "rejected" && nextDecisions[action.validationId] === "approved") {
      nextDecisions[action.validationId] = "changes_requested";
    }
    return freezeState({
      ...state,
      analysis: {
        ...state.analysis,
        candidateSubmissions: rebuilt.candidateSubmissions,
        validationBatch: rebuilt.validationBatch,
        proposalRows: rebuilt.proposalRows,
      },
      reviewDecisions: nextDecisions,
      appliedResult: null,
      docx: idleDocx(),
      visibleError: null,
    });
  } catch (error) {
    return freezeState({ ...state, visibleError: safeErrorMessage(error), appliedResult: null, docx: idleDocx() });
  }
}

function assertTailoringDemoAction(value: unknown): asserts value is TailoringDemoAction {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(TAILORING_DEMO_ACTION_INVALID_ERROR);
  }
  const action = value as Record<string, unknown>;
  if (typeof action.type !== "string" || !allowedActionTypes.some((type) => type === action.type)) {
    throw new Error(TAILORING_DEMO_ACTION_INVALID_ERROR);
  }
}

function emptyDerivedState(): Pick<TailoringDemoState, "analysis" | "reviewDecisions" | "appliedResult" | "docx"> {
  return {
    analysis: null,
    reviewDecisions: {},
    appliedResult: null,
    docx: idleDocx(),
  };
}

function idleDocx(): TailoringDemoDocxState {
  return { status: "idle", result: null, error: null };
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "No se pudo completar la operación.";
  }
  const message = error.message;
  const visibleMessages: Record<string, string> = {
    TAILORING_DEMO_EMPTY_RESUME_TEXT: "Pega el contenido del currículum para continuar.",
    TAILORING_DEMO_RESUME_TOO_LONG: "El currículum supera el límite de la demo.",
    TAILORING_DEMO_RESUME_TOO_MANY_BLOCKS: "El currículum tiene demasiados bloques para esta demo.",
    TAILORING_DEMO_EMPTY_JOB_TEXT: "Pega la oferta para continuar.",
    TAILORING_DEMO_JOB_TOO_LONG: "La oferta supera el límite de la demo.",
    TAILORING_DEMO_NO_EXTRACTABLE_REQUIREMENTS: "No he encontrado requisitos concretos en la oferta. Añade habilidades, herramientas o responsabilidades específicas y vuelve a analizar.",
    TAILORING_DEMO_TOO_MANY_REQUIREMENTS: "La oferta contiene demasiados requisitos para esta demo.",
    [TailoringDemoPipelineErrorCode.TooManyProposals]: "Hay demasiadas propuestas para revisar en esta demo.",
    [TailoringDemoPipelineErrorCode.ReviewIncomplete]: "Todas las propuestas necesitan una decisión.",
    [TailoringDemoPipelineErrorCode.EditedProposalTooLong]: "La edición supera el límite permitido.",
  };
  return visibleMessages[message] ?? "No se pudo completar la operación con los datos actuales.";
}

function freezeState<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freezeState(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export function getCurrentStageId(state: TailoringDemoState): WorkflowStageId {
  return state.session.currentStageId;
}
