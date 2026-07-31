type TextInputStageProps = {
  id: string;
  label: string;
  help: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onClear: () => void;
};

export function TextInputStage({
  id,
  label,
  help,
  placeholder,
  value,
  error,
  onChange,
  onClear,
}: TextInputStageProps) {
  const helpId = `${id}-help`;
  const counterId = `${id}-counter`;
  const errorId = `${id}-error`;

  return (
    <div className="demo-form">
      <label htmlFor={id}>{label}</label>
      <p id={helpId} className="field-help">
        {help}
      </p>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${helpId} ${counterId} ${errorId}`}
        aria-invalid={error !== null}
      />
      <div className="field-row">
        <span id={counterId}>{value.length} caracteres</span>
        <button type="button" onClick={onClear} disabled={value.length === 0}>
          Limpiar
        </button>
      </div>
      <p id={errorId} className={error === null ? "field-note" : "field-error"} aria-live="polite">
        {error ?? "El texto se conserva al navegar hacia atrás mientras no reinicies la demo."}
      </p>
    </div>
  );
}
