import { TAILORING_DEMO_DOWNLOAD_FILENAME } from "../../app/tailoring-demo-constants";
import type { StageHeaderProps } from "./stage-types";

export { TAILORING_DEMO_DOWNLOAD_FILENAME };

export function StageHeader({ stage, titleRef }: StageHeaderProps) {
  return (
    <>
      <p className="stage-kicker">Etapa {stage.position}</p>
      <h2 id="stage-title" ref={titleRef} tabIndex={-1}>
        {stage.title}
      </h2>
      <p className="stage-description">{stage.description}</p>
    </>
  );
}

export function EmptyState({ children }: { children: string }) {
  return <p className="empty-state">{children}</p>;
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function TwoColumnText({ original, candidate }: { original: string; candidate: string }) {
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

export function ValidationSummary({
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

export function RequirementStatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`status-pill status-${status}`}>{label}</span>;
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
