import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, Metric, TwoColumnText } from "./shared";

export function PreviewStage({ state }: { state: TailoringDemoState }) {
  const applied = state.appliedResult;
  if (applied === null) {
    return <EmptyState>Aplica decisiones para generar la vista previa.</EmptyState>;
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
        <p className="field-note">No se aplicaron cambios aprobados. El preview conserva el texto original.</p>
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
