import type { RefObject } from "react";
import { getJobImportErrorMessage } from "../../app/job-file-import-contract";
import { TAILORING_DEMO_LIMIT_LABELS } from "../../app/tailoring-demo-limits";
import { validateTextForStage } from "../../app/tailoring-demo-state";
import type { StageComponentProps } from "./stage-types";
import { TextInputStage } from "./TextInputStage";

type JobStageProps = StageComponentProps & {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onFileSelected: (file: File | null) => void;
  onClearImport: () => void;
};

export function JobStage({ state, dispatch, textareaRef, onFileSelected, onClearImport }: JobStageProps) {
  const error = validateTextForStage("job", state.jobText);
  return (
    <>
      <section className="resume-import-panel" aria-labelledby="job-import-title">
        <h3 id="job-import-title">Importar oferta</h3>
        <p id="job-import-help" className="field-help">
          El archivo se procesa únicamente en este navegador. No se almacena ni se envía a servicios externos.
          Se admite texto plano TXT o Markdown MD.
        </p>
        <label className="file-input-label" htmlFor="job-file-input">
          Seleccionar archivo TXT o MD
        </label>
        <input
          id="job-file-input"
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown,text/x-markdown"
          aria-describedby="job-import-help job-import-status"
          onChange={(event) => {
            onFileSelected(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
        <p id="job-import-status" className="field-note" aria-live="polite">
          {jobImportStatusText(state)}
        </p>
        {state.jobImport.status === "error" ? (
          <p className="field-error" role="alert">
            {getJobImportErrorMessage(state.jobImport.errorCode)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClearImport}
          disabled={state.jobText.length === 0 && state.jobImport.status === "idle"}
        >
          Limpiar oferta importada o pegada
        </button>
      </section>
      <TextInputStage
        id="job-text"
        label="Oferta laboral"
        help={`Pega requisitos o revisa el texto importado. Límite: ${TAILORING_DEMO_LIMIT_LABELS.jobTextMaxLength}.`}
        placeholder="Ejemplo: Buscamos experiencia con React, TypeScript y revisión de propuestas."
        value={state.jobText}
        error={error}
        textareaRef={textareaRef}
        onChange={(value) => dispatch({ type: "set_job_text", value })}
        onClear={() => dispatch({ type: "clear_job_text" })}
      />
    </>
  );
}

function jobImportStatusText(state: StageComponentProps["state"]): string {
  if (state.jobImport.status === "reading") {
    return `Procesando ${jobSourceLabel(state.jobImport.source)} localmente.`;
  }
  if (state.jobImport.status === "ready") {
    return `Texto extraído desde ${jobSourceLabel(state.jobImport.source)}. Revísalo antes de continuar.`;
  }
  if (state.jobImport.status === "error") {
    return "No se importó ninguna oferta. Puedes seleccionar otro archivo o pegar el contenido manualmente.";
  }
  return "Formatos admitidos: TXT y MD. El formato visual no se conserva.";
}

function jobSourceLabel(source: string): string {
  if (source === "txt") {
    return "TXT";
  }
  if (source === "md") {
    return "MD";
  }
  return "texto manual";
}
