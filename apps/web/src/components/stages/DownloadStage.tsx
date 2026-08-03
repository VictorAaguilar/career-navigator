import type { TailoringDemoState } from "../../app/tailoring-demo-state";
import { EmptyState, Metric, TAILORING_DEMO_DOWNLOAD_FILENAME } from "./shared";

export function DownloadStage({ state, onDownload }: { state: TailoringDemoState; onDownload: () => void }) {
  if (state.appliedResult === null) {
    return <EmptyState>Genera la vista previa antes de descargar.</EmptyState>;
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
        aria-describedby="download-help"
      >
        {state.docx.status === "generating" ? "Generando DOCX" : "Descargar currículum adaptado"}
      </button>
      <p id="download-help" className="field-note">
        Nombre del archivo: {TAILORING_DEMO_DOWNLOAD_FILENAME}. Revisa el documento antes de enviarlo.
      </p>
      <div aria-live="polite">
        {state.docx.status === "ready" ? (
          <p className="field-note">DOCX preparado: {state.docx.result.byteLength} bytes.</p>
        ) : null}
        {state.docx.status === "failed" ? (
          <p className="field-error" role="alert">
            {state.docx.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
