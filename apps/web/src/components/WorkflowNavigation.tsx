type WorkflowNavigationProps = {
  canGoBackward: boolean;
  canGoForward: boolean;
  onPrevious: () => void;
  onNext: () => void;
  nextLabel?: string;
  guardMessage?: string | null;
};

export function WorkflowNavigation({
  canGoBackward,
  canGoForward,
  onPrevious,
  onNext,
  nextLabel = "Continuar",
  guardMessage = null,
}: WorkflowNavigationProps) {
  return (
    <>
      {guardMessage === null ? null : (
        <p className="guard-message" role="status">
          {guardMessage}
        </p>
      )}
      <div className="workflow-navigation">
        <button type="button" onClick={onPrevious} disabled={!canGoBackward}>
          Anterior
        </button>
        <button type="button" className="primary-action" onClick={onNext} disabled={!canGoForward}>
          {nextLabel}
        </button>
      </div>
    </>
  );
}
