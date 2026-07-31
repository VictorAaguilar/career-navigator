import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, Metric } from "./shared";

export function AnalysisStage({
  state,
  onRunAnalysis,
  isAnalyzing,
}: {
  state: TailoringDemoState;
  onRunAnalysis: () => void;
  isAnalyzing: boolean;
}) {
  const analysis = state.analysis;
  return (
    <div className="demo-section">
      <button type="button" className="primary-action" onClick={onRunAnalysis} disabled={isAnalyzing}>
        {isAnalyzing ? "Analizando" : "Ejecutar análisis determinista"}
      </button>
      <div aria-live="polite">
        {isAnalyzing ? <p className="field-note">Analizando el currículum y la oferta en esta sesión local.</p> : null}
        {analysis === null ? (
          <EmptyState>El análisis se ejecuta localmente y no usa probabilidades de contratación.</EmptyState>
        ) : (
          <div className="metric-grid">
            <Metric label="Puntuación" value={`${analysis.scoringResult.score}/100`} />
            <Metric label="Requisitos" value={String(analysis.jobMatchResult.totalRequirements)} />
            <Metric label="Cubiertos" value={String(analysis.jobMatchResult.metRequirements)} />
            <Metric label="Parciales" value={String(analysis.jobMatchResult.partiallyMetRequirements)} />
            <Metric label="No cubiertos" value={String(analysis.jobMatchResult.notMetRequirements)} />
            <Metric label="Confianza" value={`${Math.round(analysis.scoringResult.confidence * 100)}%`} />
          </div>
        )}
      </div>
      <p className="field-note">
        La correspondencia usa señales visibles del currículum y de la oferta, y después aplica
        el scoring reproducible del núcleo.
      </p>
    </div>
  );
}
