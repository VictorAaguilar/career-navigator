import {
  getTailoringSessionStatusLabel,
  type TailoringSessionStatus,
} from "../app/tailoring-session";

type SessionStatusBadgeProps = {
  status: TailoringSessionStatus;
};

export function SessionStatusBadge({ status }: SessionStatusBadgeProps) {
  return (
    <div className={`session-status session-status-${status}`} aria-live="polite">
      <span className="session-status-label">Sesión local</span>
      <span className="session-status-value">{getTailoringSessionStatusLabel(status)}</span>
    </div>
  );
}
