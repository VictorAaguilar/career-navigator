import { useMemo, useReducer, type Dispatch } from "react";
import { AppHeader } from "./components/AppHeader";
import { SessionStatusBadge } from "./components/SessionStatusBadge";
import { WorkflowNavigation } from "./components/WorkflowNavigation";
import { WorkflowStepper } from "./components/WorkflowStepper";
import { WORKFLOW_STAGES, type WorkflowStage } from "./app/workflow-stages";
import {
  getTailoringSessionStageStatus,
  getTailoringSessionStatus,
} from "./app/tailoring-session";
import {
  canAdvanceTailoringDemo,
  createTailoringDemoState,
  getStageGuardMessage,
  tailoringDemoReducer,
  validateTextForStage,
  type TailoringDemoState,
} from "./app/tailoring-demo-state";
import { TAILORING_DEMO_LIMIT_LABELS } from "./app/tailoring-demo-limits";
import {
  canNavigateBackward,
  canNavigateForward,
  getWorkflowNavigationState,
  getWorkflowStage,
} from "./app/workflow-navigation";

const TAILORING_DEMO_DOWNLOAD_FILENAME = "curriculum-adaptado.docx";

export default function App() {
  const [state, dispatch] = useReducer(tailoringDemoReducer, undefined, createTailoringDemoState);
  const session = state.session;
  const currentStage = getWorkflowStage(session.currentStageId);
  const navigationState = useMemo(
    () => getWorkflowNavigationState(session.currentStageId),
    [session.currentStageId],
  );
  const sessionStatus = getTailoringSessionStatus(session);
  const guardMessage = getStageGuardMessage(state);

  const handlePrevious = () => {
    dispatch({ type: "navigate", direction: "back" });
  };

  const handleNext = () => {
    dispatch({ type: "navigate", direction: "advance" });
  };

  const handleDownload = async () => {
    if (state.appliedResult === null) {
      dispatch({ type: "docx_failed", error: "Genera la vista previa antes de preparar el DOCX." });
      return;
    }

    dispatch({ type: "docx_generating" });
    try {
      const { docxResultToBlob, renderTailoringDemoDocx } = await import("./app/tailoring-demo-docx");
      const result = await renderTailoringDemoDocx(state.appliedResult.exportModel);
      dispatch({ type: "docx_ready", result });
      const blob = docxResultToBlob(result);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = TAILORING_DEMO_DOWNLOAD_FILENAME;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      dispatch({
        type: "docx_failed",
        error: "No se pudo generar el DOCX en el navegador. Revisa la vista previa y vuelve a intentarlo.",
      });
    }
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
            {state.visibleError === null ? null : (
              <p className="error-banner" role="alert">
                {state.visibleError}
              </p>
            )}
            <TailoringDemoStage
              state={state}
              stage={currentStage}
              onStart={handleNext}
              onRunAnalysis={() => dispatch({ type: "run_analysis" })}
              onApplyReview={() => dispatch({ type: "apply_review" })}
              onDownload={handleDownload}
              dispatch={dispatch}
            />
            <WorkflowNavigation
              canGoBackward={canNavigateBackward(session.currentStageId)}
              canGoForward={canNavigateForward(session.currentStageId) && canAdvanceTailoringDemo(state)}
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

type DemoDispatch = Dispatch<Parameters<typeof tailoringDemoReducer>[1]>;

type TailoringDemoStageProps = {
  state: TailoringDemoState;
  stage: WorkflowStage;
  onStart: () => void;
  onRunAnalysis: () => void;
  onApplyReview: () => void;
  onDownload: () => void;
  dispatch: DemoDispatch;
};

function TailoringDemoStage({
  state,
  stage,
  onStart,
  onRunAnalysis,
  onApplyReview,
  onDownload,
  dispatch,
}: TailoringDemoStageProps) {
  return (
    <div className="stage-content">
      <p className="stage-kicker">Etapa {stage.position}</p>
      <h2 id="stage-title">{stage.title}</h2>
      <p className="stage-description">{stage.description}</p>
      {stage.id === "start" ? <StartStage onStart={onStart} /> : null}
      {stage.id === "resume" ? <ResumeInputStage state={state} dispatch={dispatch} /> : null}
      {stage.id === "job" ? <JobInputStage state={state} dispatch={dispatch} /> : null}
      {stage.id === "analysis" ? <AnalysisStage state={state} onRunAnalysis={onRunAnalysis} /> : null}
      {stage.id === "requirements" ? <RequirementsStage state={state} /> : null}
      {stage.id === "proposals" ? <ProposalsStage state={state} /> : null}
      {stage.id === "review" ? (
        <ReviewStage state={state} dispatch={dispatch} onApplyReview={onApplyReview} />
      ) : null}
      {stage.id === "preview" ? <PreviewStage state={state} /> : null}
      {stage.id === "download" ? <DownloadStage state={state} onDownload={onDownload} /> : null}
    </div>
  );
}

function StartStage({ onStart }: { onStart: () => void }) {
  return (
    <div className="demo-section">
      <div className="intro-band">
        <div>
          <h3>Demo local de adaptación revisable</h3>
          <p>
            Pega un currículum y una oferta, revisa requisitos, decide cada propuesta y descarga
            un DOCX. Todo sucede en memoria durante esta sesión.
          </p>
        </div>
        <button type="button" className="primary-action" onClick={onStart}>
          Comenzar
        </button>
      </div>
      <div className="feature-grid" aria-label="Alcance de la demo">
        <Feature title="Qué hace" text="Conecta contratos reales de matching, scoring, propuestas, revisión, aplicación y exportación." />
        <Feature title="Qué no hace" text="No usa IA generativa, servicios externos, almacenamiento, cuentas, analytics ni carga de archivos." />
        <Feature title="Privacidad" text="Tus datos no se almacenan en esta versión y no salen del navegador." />
        <Feature title="Anti-invención" text="Las propuestas solo reordenan o conservan texto ya presente en el currículum." />
      </div>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="feature-item">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ResumeInputStage({ state, dispatch }: { state: TailoringDemoState; dispatch: DemoDispatch }) {
  const error = validateTextForStage("resume", state.resumeText);
  return (
    <TextInputStage
      id="resume-text"
      label="Currículum"
      help={`Pega texto plano. Límite: ${TAILORING_DEMO_LIMIT_LABELS.resumeTextMaxLength}.`}
      placeholder="Ejemplo: Lideré proyectos React y TypeScript. Mejoré procesos internos documentados en el CV."
      value={state.resumeText}
      error={error}
      onChange={(value) => dispatch({ type: "set_resume_text", value })}
      onClear={() => dispatch({ type: "clear_resume_text" })}
    />
  );
}

function JobInputStage({ state, dispatch }: { state: TailoringDemoState; dispatch: DemoDispatch }) {
  const error = validateTextForStage("job", state.jobText);
  return (
    <TextInputStage
      id="job-text"
      label="Oferta laboral"
      help={`Pega requisitos o descripción. Límite: ${TAILORING_DEMO_LIMIT_LABELS.jobTextMaxLength}.`}
      placeholder="Ejemplo: Buscamos experiencia con React, TypeScript y revisión de propuestas."
      value={state.jobText}
      error={error}
      onChange={(value) => dispatch({ type: "set_job_text", value })}
      onClear={() => dispatch({ type: "clear_job_text" })}
    />
  );
}

type TextInputStageProps = {
  id: string;
  label: string;
  help: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onClear: () => void;
};

function TextInputStage({ id, label, help, placeholder, value, error, onChange, onClear }: TextInputStageProps) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <div className="demo-form">
      <label htmlFor={id}>{label}</label>
      <p id={helpId} className="field-help">
        {help}
      </p>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${helpId} ${errorId}`}
        aria-invalid={error !== null}
      />
      <div className="field-row">
        <span>{value.length} caracteres</span>
        <button type="button" onClick={onClear} disabled={value.length === 0}>
          Limpiar
        </button>
      </div>
      <p id={errorId} className={error === null ? "field-note" : "field-error"} aria-live="polite">
        {error ?? "El texto se conserva al navegar hacia atrás mientras no reinicies la demo."}
      </p>
    </div>
  );
}

function AnalysisStage({ state, onRunAnalysis }: { state: TailoringDemoState; onRunAnalysis: () => void }) {
  const analysis = state.analysis;
  return (
    <div className="demo-section">
      <button type="button" className="primary-action" onClick={onRunAnalysis}>
        Ejecutar análisis determinista
      </button>
      {analysis === null ? (
        <p className="empty-state">El análisis se ejecuta localmente y no usa probabilidades de contratación.</p>
      ) : (
        <div className="metric-grid" aria-live="polite">
          <Metric label="Puntuación" value={`${analysis.scoringResult.score}/100`} />
          <Metric label="Requisitos" value={String(analysis.jobMatchResult.totalRequirements)} />
          <Metric label="Cubiertos" value={String(analysis.jobMatchResult.metRequirements)} />
          <Metric label="Parciales" value={String(analysis.jobMatchResult.partiallyMetRequirements)} />
          <Metric label="No cubiertos" value={String(analysis.jobMatchResult.notMetRequirements)} />
          <Metric label="Confianza" value={`${Math.round(analysis.scoringResult.confidence * 100)}%`} />
        </div>
      )}
      <p className="field-note">
        La correspondencia compara tokens visibles del currículum con requisitos extraídos de la oferta y después usa
        el scoring reproducible del núcleo.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RequirementsStage({ state }: { state: TailoringDemoState }) {
  if (state.analysis === null) {
    return <p className="empty-state">Todavía no hay requisitos analizados.</p>;
  }
  return (
    <div className="demo-list">
      {state.analysis.requirementRows.map((row) => (
        <article className="demo-item" key={row.requirementId}>
          <div className="item-heading">
            <h3>{row.text}</h3>
            <span className={`status-pill status-${row.status}`}>{row.label}</span>
          </div>
          <p>{row.explanation}</p>
          <p className="field-note">Contribución: {row.contribution}/100</p>
          {row.evidenceTexts.length === 0 ? (
            <p className="missing-evidence">No hay evidencia en el currículum.</p>
          ) : (
            <ul>
              {row.evidenceTexts.map((evidenceText) => (
                <li key={evidenceText}>{evidenceText}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function ProposalsStage({ state }: { state: TailoringDemoState }) {
  if (state.analysis === null) {
    return <p className="empty-state">Ejecuta el análisis para ver propuestas.</p>;
  }
  if (state.analysis.proposalRows.length === 0) {
    return <p className="empty-state">No hay propuestas aplicables con evidencia suficiente.</p>;
  }
  return (
    <div className="demo-list">
      {state.analysis.proposalRows.map((proposal) => (
        <article className="demo-item" key={proposal.validationId}>
          <h3>{proposal.requirementText}</h3>
          <TwoColumnText original={proposal.originalText} candidate={proposal.currentCandidateText} />
          <p>{proposal.rationale}</p>
          <ValidationSummary status={proposal.validationStatus} findings={proposal.findingLabels} />
        </article>
      ))}
    </div>
  );
}

function ReviewStage({
  state,
  dispatch,
  onApplyReview,
}: {
  state: TailoringDemoState;
  dispatch: DemoDispatch;
  onApplyReview: () => void;
}) {
  if (state.analysis === null) {
    return <p className="empty-state">Ejecuta el análisis antes de revisar.</p>;
  }
  if (state.analysis.proposalRows.length === 0) {
    return (
      <div className="demo-section">
        <p className="empty-state">No hay propuestas válidas; puedes generar una vista previa sin cambios.</p>
        <button type="button" className="primary-action" onClick={onApplyReview}>
          Generar vista previa sin cambios
        </button>
      </div>
    );
  }
  return (
    <div className="demo-list">
      {state.analysis.proposalRows.map((proposal) => (
        <article className="demo-item" key={proposal.validationId}>
          <h3>{proposal.requirementText}</h3>
          <TwoColumnText original={proposal.originalText} candidate={proposal.currentCandidateText} />
          <label htmlFor={`${proposal.validationId}-edit`}>Editar propuesta</label>
          <textarea
            id={`${proposal.validationId}-edit`}
            value={proposal.currentCandidateText}
            onChange={(event) =>
              dispatch({ type: "edit_proposal", validationId: proposal.validationId, value: event.target.value })
            }
            aria-describedby={`${proposal.validationId}-validation`}
          />
          <div className="field-row">
            <button
              type="button"
              onClick={() => dispatch({ type: "restore_proposal", validationId: proposal.validationId })}
            >
              Restaurar propuesta
            </button>
          </div>
          <ValidationSummary
            id={`${proposal.validationId}-validation`}
            status={proposal.validationStatus}
            findings={proposal.findingLabels}
          />
          <fieldset className="decision-group">
            <legend>Decisión humana</legend>
            <DecisionOption
              label="Aceptar"
              checked={state.reviewDecisions[proposal.validationId] === "approved"}
              disabled={proposal.validationStatus === "rejected"}
              onChange={() =>
                dispatch({ type: "set_review_decision", validationId: proposal.validationId, decision: "approved" })
              }
            />
            <DecisionOption
              label="Rechazar"
              checked={state.reviewDecisions[proposal.validationId] === "rejected"}
              onChange={() =>
                dispatch({ type: "set_review_decision", validationId: proposal.validationId, decision: "rejected" })
              }
            />
            <DecisionOption
              label="Pedir cambios"
              checked={state.reviewDecisions[proposal.validationId] === "changes_requested"}
              onChange={() =>
                dispatch({
                  type: "set_review_decision",
                  validationId: proposal.validationId,
                  decision: "changes_requested",
                })
              }
            />
          </fieldset>
        </article>
      ))}
      <button type="button" className="primary-action" onClick={onApplyReview}>
        Aplicar decisiones aprobadas
      </button>
    </div>
  );
}

function DecisionOption({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="decision-option">
      <input type="radio" checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function PreviewStage({ state }: { state: TailoringDemoState }) {
  const applied = state.appliedResult;
  if (applied === null) {
    return <p className="empty-state">Aplica decisiones para generar la vista previa.</p>;
  }
  const summary = applied.reviewDecisionBatch.summary;
  return (
    <div className="demo-section">
      <div className="metric-grid">
        <Metric label="Aceptadas" value={String(summary.approved)} />
        <Metric label="Rechazadas" value={String(summary.rejected)} />
        <Metric label="Editadas o cambios" value={String(summary.changesRequested)} />
        <Metric label="Bloques reescritos" value={String(applied.applicationResult.summary.rewrittenBlocks)} />
      </div>
      <div className="resume-preview">
        {applied.applicationResult.adaptedDocument.sections.map((section) => (
          <section key={section.sectionId}>
            <h3>{section.label}</h3>
            {section.blocks.map((block) => (
              <p key={block.blockId} className={block.applicationStatus === "rewritten" ? "rewritten-block" : undefined}>
                {block.effectiveText}
              </p>
            ))}
          </section>
        ))}
      </div>
      {applied.applicationResult.changes.length === 0 ? (
        <p className="field-note">No se aplicaron cambios aprobados.</p>
      ) : (
        <div className="demo-list">
          {applied.applicationResult.changes.map((change) => (
            <article className="demo-item" key={change.changeId}>
              <h3>Cambio aplicado</h3>
              <TwoColumnText original={change.beforeText} candidate={change.afterText} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadStage({ state, onDownload }: { state: TailoringDemoState; onDownload: () => void }) {
  if (state.appliedResult === null) {
    return <p className="empty-state">Genera la vista previa antes de descargar.</p>;
  }
  return (
    <div className="demo-section">
      <div className="metric-grid">
        <Metric label="Secciones" value={String(state.appliedResult.exportModel.summary.totalSections)} />
        <Metric label="Bloques" value={String(state.appliedResult.exportModel.summary.totalBlocks)} />
        <Metric
          label="Desde aprobaciones"
          value={String(state.appliedResult.exportModel.summary.renderedFromApprovedSelection)}
        />
      </div>
      <button
        type="button"
        className="primary-action"
        onClick={onDownload}
        disabled={state.docx.status === "generating"}
      >
        {state.docx.status === "generating" ? "Generando DOCX" : "Descargar DOCX"}
      </button>
      <p className="field-note">
        Nombre del archivo: {TAILORING_DEMO_DOWNLOAD_FILENAME}. Revisa el documento antes de enviarlo.
      </p>
      {state.docx.status === "ready" ? (
        <p className="field-note">DOCX preparado: {state.docx.result.byteLength} bytes.</p>
      ) : null}
      {state.docx.status === "failed" ? <p className="field-error">{state.docx.error}</p> : null}
    </div>
  );
}

function TwoColumnText({ original, candidate }: { original: string; candidate: string }) {
  return (
    <div className="text-compare">
      <div>
        <h4>Texto original</h4>
        <p>{original}</p>
      </div>
      <div>
        <h4>Texto propuesto</h4>
        <p>{candidate}</p>
      </div>
    </div>
  );
}

function ValidationSummary({
  id,
  status,
  findings,
}: {
  id?: string;
  status: string;
  findings: readonly string[];
}) {
  return (
    <div id={id} className="validation-summary">
      <strong>Validación: {validationLabel(status)}</strong>
      {findings.length === 0 ? <span>Sin advertencias.</span> : <span>{findings.join(" · ")}</span>}
    </div>
  );
}

function validationLabel(status: string): string {
  if (status === "accepted") {
    return "aceptada";
  }
  if (status === "rejected") {
    return "rechazada";
  }
  return "requiere revisión";
}
