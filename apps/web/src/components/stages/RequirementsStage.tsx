import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, RequirementStatusBadge } from "./shared";

export function RequirementsStage({ state }: { state: TailoringDemoState }) {
  if (state.analysis === null) {
    return <EmptyState>Todavía no hay requisitos analizados.</EmptyState>;
  }

  return (
    <div className="demo-list">
      {state.analysis.requirementRows.map((row) => (
        <article className="demo-item" key={row.requirementId}>
          <div className="item-heading">
            <h3>{row.text}</h3>
            <RequirementStatusBadge status={row.status} label={row.label} />
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
