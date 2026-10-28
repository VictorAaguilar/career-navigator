import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import type { DemoDispatch } from "./stage-types";
import { EmptyState, LocationExplanation, TwoColumnText, ValidationSummary } from "./shared";

export function ReviewStage({
  state,
  dispatch,
  onApplyReview,
  isApplyingReview,
}: {
  state: TailoringDemoState;
  dispatch: DemoDispatch;
  onApplyReview: () => void;
  isApplyingReview: boolean;
}) {
  if (state.analysis === null) {
    return <EmptyState>Ejecuta el análisis antes de revisar.</EmptyState>;
  }
  if (state.analysis.proposalRows.length === 0) {
    return (
      <div className="demo-section">
        <EmptyState>No hay propuestas válidas; puedes generar una vista previa sin cambios.</EmptyState>
        <button type="button" className="primary-action" onClick={onApplyReview} disabled={isApplyingReview}>
          {isApplyingReview ? "Generando vista previa" : "Generar vista previa sin cambios"}
        </button>
      </div>
    );
  }

  return (
    <div className="demo-list">
      {state.analysis.proposalRows.map((proposal, index) => {
        const validationId = proposal.validationId;
        const validationDescriptionId = `${validationId}-validation`;
        const editHelpId = `${validationId}-edit-help`;
        const editInvalid = proposal.validationStatus === "rejected";
        const proposalContext = `propuesta ${index + 1}: ${proposal.requirementText}`;

        return (
          <article className="demo-item" key={validationId}>
            <h3>{proposal.requirementText}</h3>
            <LocationExplanation
              title="Ubicación objetivo"
              location={proposal.targetLocation}
              reasonLabels={proposal.targetingReasonLabels}
              relatedRequirement={proposal.requirementText}
            />
            <TwoColumnText original={proposal.originalText} candidate={proposal.currentCandidateText} />
            <label htmlFor={`${validationId}-edit`}>Editar propuesta</label>
            <p id={editHelpId} className="field-help">
              La edición se valida al escribir. No se puede aprobar si introduce Markdown, fechas o métricas no soportadas.
            </p>
            <textarea
              id={`${validationId}-edit`}
              value={proposal.currentCandidateText}
              onChange={(event) =>
                dispatch({ type: "edit_proposal", validationId, value: event.target.value })
              }
              aria-describedby={`${editHelpId} ${validationDescriptionId}`}
              aria-invalid={editInvalid}
              aria-label={`Editar ${proposalContext}`}
            />
            <div className="field-row">
              <button
                type="button"
                aria-label={`Restaurar ${proposalContext}`}
                onClick={() => dispatch({ type: "restore_proposal", validationId })}
              >
                Restaurar propuesta
              </button>
            </div>
            <ValidationSummary
              id={validationDescriptionId}
              status={proposal.validationStatus}
              findings={proposal.findingLabels}
              announce
            />
            <fieldset className="decision-group" aria-label={`Decisión humana para ${proposalContext}`}>
              <legend>Decisión humana</legend>
              <DecisionOption
                name={validationId}
                label="Aceptar"
                checked={state.reviewDecisions[validationId] === "approved"}
                disabled={editInvalid}
                onChange={() =>
                  dispatch({ type: "set_review_decision", validationId, decision: "approved" })
                }
              />
              <DecisionOption
                name={validationId}
                label="Rechazar"
                checked={state.reviewDecisions[validationId] === "rejected"}
                onChange={() =>
                  dispatch({ type: "set_review_decision", validationId, decision: "rejected" })
                }
              />
              <DecisionOption
                name={validationId}
                label="Pedir cambios"
                checked={state.reviewDecisions[validationId] === "changes_requested"}
                onChange={() =>
                  dispatch({ type: "set_review_decision", validationId, decision: "changes_requested" })
                }
              />
            </fieldset>
          </article>
        );
      })}
      <button type="button" className="primary-action" onClick={onApplyReview} disabled={isApplyingReview}>
        {isApplyingReview ? "Aplicando decisiones" : "Aplicar decisiones aprobadas"}
      </button>
    </div>
  );
}

function DecisionOption({
  name,
  label,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="decision-option">
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
