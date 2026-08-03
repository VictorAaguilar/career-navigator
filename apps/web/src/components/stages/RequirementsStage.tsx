import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, LocationExplanation, RequirementStatusBadge } from "./shared";

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
          {row.evidenceLocations.length === 0 ? (
            <p className="missing-evidence">No se encontró evidencia en el currículum.</p>
          ) : (
            <ul className="evidence-location-list">
              {row.evidenceLocations.map((evidence) => (
                <li key={`${evidence.evidenceText}-${evidence.location.label}`}>
                  <p>
                    <strong>{evidence.supportLabel}:</strong> {evidence.evidenceText}
                  </p>
                  <LocationExplanation title="Ubicación de la evidencia" location={evidence.location} />
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
