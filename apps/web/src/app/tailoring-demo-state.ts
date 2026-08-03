import type { DocxRenderResult } from "../../../../src/schemas/docx-render.js";
import type { RewriteCandidateSubmission } from "../../../../src/schemas/candidate.js";
import type {
  ResumeImportErrorCode,
  ResumeImportSource,
  ResumeImportWarningCode,
} from "./resume-file-import-contract.js";
import { createTailoringSession, type TailoringSession } from "./tailoring-session.js";
import { tailoringSessionReducer } from "./tailoring-session-reducer.js";
import type { WorkflowStageId } from "./workflow-stages.js";
import { TAILORING_DEMO_LIMITS } from "./tailoring-demo-limits.js";
import { parseResumeText } from "./tailoring-demo-parsers.js";
import {
  applyTailoringDemoReview,
  decisionIsApplicable,
  isReviewComplete,
  rebuildValidationWithCandidates,
  runTailoringDemoAnalysis,
  runTailoringDemoAnalysisWithParsedResume,
  TailoringDemoPipelineErrorCode,
  type DemoAnalysisResult,
  type DemoAppliedResult,
  type DemoReviewDecisionType,
  type DemoReviewState,
} from "./tailoring-demo-pipeline.js";
import {
  buildParsedResumeFromStructuredDraft,
  parseStructuredResumeText,
  StructuredResumeErrorCode,
  updateStructuredResumeSectionKind,
  type StructuredResumeDraft,
  type StructuredResumeParseMode,
  type StructuredResumeSectionKind,
  type StructuredResumeWarningCode,
} from "./structured-resume-parsing.js";

export const TAILORING_DEMO_ACTION_INVALID_ERROR = "TAILORING_DEMO_ACTION_INVALID";

export type TailoringDemoDocxState = Readonly<
  | { status: "idle"; result: null; error: null }
  | { status: "generating"; result: null; error: null }
  | { status: "ready"; result: DocxRenderResult; error: null }
  | { status: "failed"; result: null; error: string }
>;

export type ResumeImportState = Readonly<
  | { status: "idle"; source: "manual"; warnings: readonly []; errorCode: null }
  | { status: "reading"; source: Exclude<ResumeImportSource, "manual">; warnings: readonly []; errorCode: null }
  | { status: "ready"; source: Exclude<ResumeImportSource, "manual">; warnings: readonly ResumeImportWarningCode[]; errorCode: null }
  | { status: "error"; source: ResumeImportSource; warnings: readonly []; errorCode: ResumeImportErrorCode }
>;

export type ResumeStructureState = Readonly<
  | { status: "idle"; mode: null; draft: null; warnings: readonly []; errorCode: null }
  | {
      status: "detected";
      mode: null;
      draft: StructuredResumeDraft;
      warnings: readonly StructuredResumeWarningCode[];
      errorCode: null;
    }
  | {
      status: "confirmed";
      mode: StructuredResumeParseMode;
      draft: StructuredResumeDraft | null;
      warnings: readonly StructuredResumeWarningCode[];
      errorCode: null;
    }
  | {
      status: "error";
      mode: null;
      draft: null;
      warnings: readonly [];
      errorCode: typeof StructuredResumeErrorCode[keyof typeof StructuredResumeErrorCode];
    }
>;

export type TailoringDemoState = Readonly<{
  session: TailoringSession;
  resumeText: string;
  resumeImport: ResumeImportState;
  resumeStructure: ResumeStructureState;
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
  | { type: "resume_import_started"; source: Exclude<ResumeImportSource, "manual"> }
  | {
      type: "resume_import_succeeded";
      source: Exclude<ResumeImportSource, "manual">;
      text: string;
      warnings: readonly ResumeImportWarningCode[];
    }
  | { type: "resume_import_failed"; source: ResumeImportSource; errorCode: ResumeImportErrorCode }
  | { type: "resume_import_cleared" }
  | { type: "detect_resume_structure" }
  | { type: "set_resume_section_kind"; sectionId: string; kind: StructuredResumeSectionKind }
  | { type: "confirm_resume_structure" }
  | { type: "use_plain_resume_parser" }
  | { type: "clear_resume_structure" }
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
  "resume_import_started",
  "resume_import_succeeded",
  "resume_import_failed",
  "resume_import_cleared",
  "detect_resume_structure",
  "set_resume_section_kind",
  "confirm_resume_structure",
  "use_plain_resume_parser",
  "clear_resume_structure",
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
    resumeImport: idleResumeImport(),
    resumeStructure: idleResumeStructure(),
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
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "clear_resume_text") {
    return freezeState({
      ...state,
      resumeText: "",
      resumeImport: idleResumeImport(),
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "resume_import_started") {
    return freezeState({
      ...state,
      resumeImport: { status: "reading", source: action.source, warnings: [], errorCode: null },
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "resume_import_succeeded") {
    return freezeState({
      ...state,
      resumeText: action.text,
      resumeImport: {
        status: "ready",
        source: action.source,
        warnings: [...action.warnings].sort(compareStable),
        errorCode: null,
      },
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "resume_import_failed") {
    return freezeState({
      ...state,
      resumeImport: { status: "error", source: action.source, warnings: [], errorCode: action.errorCode },
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "resume_import_cleared") {
    return freezeState({
      ...state,
      resumeText: "",
      resumeImport: idleResumeImport(),
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "detect_resume_structure") {
    try {
      const result = parseStructuredResumeText(state.resumeText);
      return freezeState({
        ...state,
        resumeStructure: {
          status: "detected",
          mode: null,
          draft: result.draft,
          warnings: result.warnings,
          errorCode: null,
        },
        ...emptyAnalysisState(),
        visibleError: null,
      });
    } catch {
      return freezeState({
        ...state,
        resumeStructure: {
          status: "error",
          mode: null,
          draft: null,
          warnings: [],
          errorCode: StructuredResumeErrorCode.InputInvalid,
        },
        ...emptyAnalysisState(),
        visibleError: "No se pudo detectar una estructura revisable. Puedes corregir el texto o usar el análisis de texto plano.",
      });
    }
  }

  if (action.type === "set_resume_section_kind") {
    if (state.resumeStructure.draft === null) {
      return freezeState({ ...state, visibleError: "Detecta una estructura antes de cambiar categorías." });
    }
    try {
      const draft = state.resumeStructure.draft;
      const nextDraft = updateStructuredResumeSectionKind(draft, action.sectionId, action.kind);
      return freezeState({
        ...state,
        resumeStructure: {
          status: "detected",
          mode: null,
          draft: nextDraft,
          warnings: nextDraft.warningCodes,
          errorCode: null,
        },
        ...emptyAnalysisState(),
        visibleError: null,
      });
    } catch {
      return freezeState({ ...state, visibleError: "La categoría seleccionada no es válida para esta sección." });
    }
  }

  if (action.type === "confirm_resume_structure") {
    if (state.resumeStructure.draft === null) {
      return freezeState({ ...state, visibleError: "Detecta y revisa la estructura antes de confirmarla." });
    }
    return freezeState({
      ...state,
      resumeStructure: {
        status: "confirmed",
        mode: "structured",
        draft: state.resumeStructure.draft,
        warnings: state.resumeStructure.draft.warningCodes,
        errorCode: null,
      },
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "use_plain_resume_parser") {
    return freezeState({
      ...state,
      resumeStructure: {
        status: "confirmed",
        mode: "plain",
        draft: state.resumeStructure.draft,
        warnings: state.resumeStructure.draft?.warningCodes ?? [],
        errorCode: null,
      },
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "clear_resume_structure") {
    return freezeState({
      ...state,
      resumeStructure: idleResumeStructure(),
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "set_job_text") {
    return freezeState({
      ...state,
      jobText: action.value,
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "clear_job_text") {
    return freezeState({
      ...state,
      jobText: "",
      ...emptyAnalysisState(),
      visibleError: null,
    });
  }

  if (action.type === "run_analysis") {
    try {
      const parsedResume = resolveParsedResumeForAnalysis(state);
      const analysis = state.resumeStructure.mode === "structured"
        ? runTailoringDemoAnalysisWithParsedResume(parsedResume, state.jobText)
        : runTailoringDemoAnalysis(state.resumeText, state.jobText);
      return freezeState({
        ...state,
        analysis,
        reviewDecisions: {},
        appliedResult: null,
        docx: idleDocx(),
        visibleError: null,
      });
    } catch (error) {
      return freezeState({ ...state, visibleError: safeErrorMessage(error), ...emptyAnalysisState() });
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
    return validateTextForStage("resume", state.resumeText) === null && resumeParseModeIsReady(state);
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
    return validateTextForStage("resume", state.resumeText) ?? getResumeStructureGuardMessage(state);
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

function emptyAnalysisState(): Pick<TailoringDemoState, "analysis" | "reviewDecisions" | "appliedResult" | "docx"> {
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

function idleResumeImport(): ResumeImportState {
  return { status: "idle", source: "manual", warnings: [], errorCode: null };
}

function idleResumeStructure(): ResumeStructureState {
  return { status: "idle", mode: null, draft: null, warnings: [], errorCode: null };
}

function resumeParseModeIsReady(state: TailoringDemoState): boolean {
  return state.resumeStructure.status === "confirmed" && state.resumeStructure.mode !== null;
}

function getResumeStructureGuardMessage(state: TailoringDemoState): string | null {
  if (state.resumeStructure.status === "detected") {
    return "Confirma la estructura detectada o elige el análisis de texto plano.";
  }
  if (state.resumeStructure.status === "error") {
    return "Corrige el texto, vuelve a detectar la estructura o usa el análisis de texto plano.";
  }
  if (!resumeParseModeIsReady(state)) {
    return "Detecta y confirma la estructura del currículum, o elige continuar con texto plano.";
  }
  return null;
}

function resolveParsedResumeForAnalysis(state: TailoringDemoState) {
  if (state.resumeStructure.mode === "structured") {
    if (state.resumeStructure.draft === null) {
      throw new Error(StructuredResumeErrorCode.NotConfirmed);
    }
    return buildParsedResumeFromStructuredDraft(state.resumeStructure.draft);
  }
  if (state.resumeStructure.mode === "plain") {
    return parseResumeText(state.resumeText);
  }
  throw new Error(StructuredResumeErrorCode.ModeRequired);
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
    [StructuredResumeErrorCode.ModeRequired]: "Elige análisis estructurado confirmado o análisis de texto plano antes de analizar.",
    [StructuredResumeErrorCode.NotConfirmed]: "Confirma la estructura detectada antes de analizar.",
    [StructuredResumeErrorCode.DocumentInvalid]: "La estructura revisada no pudo convertirse en un documento válido.",
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

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function getCurrentStageId(state: TailoringDemoState): WorkflowStageId {
  return state.session.currentStageId;
}
