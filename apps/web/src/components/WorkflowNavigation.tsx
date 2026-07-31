type WorkflowNavigationProps = {
  canGoBackward: boolean;
  canGoForward: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function WorkflowNavigation({
  canGoBackward,
  canGoForward,
  onPrevious,
  onNext,
}: WorkflowNavigationProps) {
  return (
    <div className="workflow-navigation">
      <button type="button" onClick={onPrevious} disabled={!canGoBackward}>
        Anterior
      </button>
      <button type="button" className="primary-action" onClick={onNext} disabled={!canGoForward}>
        Continuar
      </button>
    </div>
  );
}
