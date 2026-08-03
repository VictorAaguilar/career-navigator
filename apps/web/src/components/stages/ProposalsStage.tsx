import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, LocationExplanation, TwoColumnText, ValidationSummary } from "./shared";

export function ProposalsStage({ state }: { state: TailoringDemoState }) {
  if (state.analysis === null) {
    return <EmptyState>Ejecuta el análisis para ver propuestas.</EmptyState>;
  }
  if (state.analysis.proposalRows.length === 0) {
    return (
      <EmptyState>
        No hay propuestas aplicables con evidencia suficiente. Puedes continuar sin modificar el currículum.
      </EmptyState>
    );
  }

  return (
    <div className="demo-list">
      {state.analysis.proposalRows.map((proposal) => (
        <article className="demo-item" key={proposal.validationId}>
          <h3>{proposal.requirementText}</h3>
          <LocationExplanation
            title="Ubicación objetivo"
            location={proposal.targetLocation}
            reasonLabels={proposal.targetingReasonLabels}
            relatedRequirement={proposal.requirementText}
          />
          {proposal.evidenceTexts.length === 0 ? null : (
            <ul className="evidence-summary-list" aria-label="Evidencia usada">
              {proposal.evidenceTexts.map((evidenceText) => (
                <li key={evidenceText}>{evidenceText}</li>
              ))}
            </ul>
          )}
          <TwoColumnText original={proposal.originalText} candidate={proposal.currentCandidateText} />
          <p>{proposal.rationale}</p>
          <ValidationSummary status={proposal.validationStatus} findings={proposal.findingLabels} />
        </article>
      ))}
    </div>
  );
}
