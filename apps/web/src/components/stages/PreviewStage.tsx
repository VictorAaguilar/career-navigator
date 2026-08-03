import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, LocationExplanation, Metric, TwoColumnText } from "./shared";

export function PreviewStage({ state }: { state: TailoringDemoState }) {
  const applied = state.appliedResult;
  if (applied === null) {
    return <EmptyState>Aplica decisiones para generar la vista previa.</EmptyState>;
  }

  const summary = applied.reviewDecisionBatch.summary;
  const appliedRows = applied.traceabilityRows.filter((row) => row.outcome === "applied");
  const notAppliedRows = applied.traceabilityRows.filter((row) => row.outcome === "not_applied");
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
        <p className="field-note">No se aplicaron cambios aprobados. El preview conserva el texto original.</p>
      ) : (
        <section className="traceability-section" aria-labelledby="applied-traceability-title">
          <h3 id="applied-traceability-title">Cambios aplicados</h3>
          <div className="demo-list">
            {appliedRows.map((row) => (
              <article className="demo-item" key={row.validationId}>
                <h4>{row.outcomeLabel}</h4>
                <p>
                  <strong>Decisión:</strong> {row.decisionLabel}
                </p>
                <LocationExplanation
                  title="Ubicación"
                  location={row.location}
                  relatedRequirement={row.requirementText}
                />
                <TwoColumnText original={row.beforeText} candidate={row.afterText} />
              </article>
            ))}
          </div>
        </section>
      )}
      {notAppliedRows.length === 0 ? null : (
        <section className="traceability-section" aria-labelledby="not-applied-traceability-title">
          <h3 id="not-applied-traceability-title">Cambios no aplicados</h3>
          <div className="demo-list">
            {notAppliedRows.map((row) => (
              <article className="demo-item" key={row.validationId}>
                <h4>{row.outcomeLabel}</h4>
                <p>
                  <strong>Decisión:</strong> {row.decisionLabel}
                </p>
                <LocationExplanation
                  title="Ubicación"
                  location={row.location}
                  relatedRequirement={row.requirementText}
                />
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
