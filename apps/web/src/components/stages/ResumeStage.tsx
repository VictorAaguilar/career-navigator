import type { RefObject } from "react";
import { TAILORING_DEMO_LIMIT_LABELS } from "../../app/tailoring-demo-limits";
import { validateTextForStage } from "../../app/tailoring-demo-state";
import {
  getResumeImportErrorMessage,
  getResumeImportWarningMessage,
} from "../../app/resume-file-import-contract";
import type { StageComponentProps } from "./stage-types";
import { TextInputStage } from "./TextInputStage";

type ResumeStageProps = StageComponentProps & {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onFileSelected: (file: File | null) => void;
  onClearImport: () => void;
};

export function ResumeStage({
  state,
  dispatch,
  textareaRef,
  onFileSelected,
  onClearImport,
}: ResumeStageProps) {
  const error = validateTextForStage("resume", state.resumeText);
  return (
    <>
      <section className="resume-import-panel" aria-labelledby="resume-import-title">
        <h3 id="resume-import-title">Importar currículum</h3>
        <p id="resume-import-help" className="field-help">
          El archivo se procesa únicamente en este navegador. No se almacena ni se envía a servicios externos.
          Se extrae solo texto de DOCX o PDF con texto seleccionable; no hay OCR.
        </p>
        <label className="file-input-label" htmlFor="resume-file-input">
          Seleccionar archivo DOCX o PDF
        </label>
        <input
          id="resume-file-input"
          type="file"
          accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-describedby="resume-import-help resume-import-status"
          onChange={(event) => {
            onFileSelected(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        <p id="resume-import-status" className="field-note" aria-live="polite">
          {resumeImportStatusText(state)}
        </p>
        {state.resumeImport.status === "error" ? (
          <p className="field-error" role="alert">
            {getResumeImportErrorMessage(state.resumeImport.errorCode)}
          </p>
        ) : null}
        {state.resumeImport.status === "ready" && state.resumeImport.warnings.length > 0 ? (
          <ul className="import-warning-list" aria-label="Advertencias de importación">
            {state.resumeImport.warnings.map((warning) => (
              <li key={warning}>{getResumeImportWarningMessage(warning)}</li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={onClearImport}
          disabled={state.resumeText.length === 0 && state.resumeImport.status === "idle"}
        >
          Limpiar currículum importado o pegado
        </button>
      </section>
      <TextInputStage
        id="resume-text"
        label="Currículum"
        help={`Pega texto plano o revisa el texto extraído. Límite para continuar: ${TAILORING_DEMO_LIMIT_LABELS.resumeTextMaxLength}.`}
        placeholder="Ejemplo: Lideré proyectos React y TypeScript. Mejoré procesos internos documentados en el CV."
        value={state.resumeText}
        error={error}
        textareaRef={textareaRef}
        onChange={(value) => dispatch({ type: "set_resume_text", value })}
        onClear={() => dispatch({ type: "clear_resume_text" })}
      />
    </>
  );
}

function resumeImportStatusText(state: StageComponentProps["state"]): string {
  if (state.resumeImport.status === "reading") {
    return `Procesando ${sourceLabel(state.resumeImport.source)} localmente.`;
  }
  if (state.resumeImport.status === "ready") {
    return `Texto extraído desde ${sourceLabel(state.resumeImport.source)}. Revísalo y corrígelo antes de continuar.`;
  }
  if (state.resumeImport.status === "error") {
    return "No se importó ningún texto. Puedes seleccionar otro archivo o pegar el contenido manualmente.";
  }
  return "Formatos admitidos: DOCX y PDF con texto seleccionable. El formato visual no se conserva.";
}

function sourceLabel(source: string): string {
  if (source === "docx") {
    return "DOCX";
  }
  if (source === "pdf") {
    return "PDF";
  }
  return "texto manual";
}
