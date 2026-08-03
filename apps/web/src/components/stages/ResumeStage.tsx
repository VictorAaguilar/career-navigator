import type { RefObject } from "react";
import { TAILORING_DEMO_LIMIT_LABELS } from "../../app/tailoring-demo-limits";
import { getStageGuardMessage, validateTextForStage } from "../../app/tailoring-demo-state";
import {
  getResumeImportErrorMessage,
  getResumeImportWarningMessage,
} from "../../app/resume-file-import-contract";
import {
  STRUCTURED_RESUME_CONFIDENCE_LABELS,
  STRUCTURED_RESUME_SECTION_LABELS,
  STRUCTURED_RESUME_WARNING_LABELS,
  StructuredResumeSectionKind,
  type StructuredResumeSection,
} from "../../app/structured-resume-parsing";
import type { StageComponentProps } from "./stage-types";
import { TextInputStage } from "./TextInputStage";

type ResumeStageProps = StageComponentProps & {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  structureSummaryRef: RefObject<HTMLDivElement | null>;
  onFileSelected: (file: File | null) => void;
  onClearImport: () => void;
  onDetectStructure: () => void;
};

export function ResumeStage({
  state,
  dispatch,
  textareaRef,
  structureSummaryRef,
  onFileSelected,
  onClearImport,
  onDetectStructure,
}: ResumeStageProps) {
  const error = validateTextForStage("resume", state.resumeText);
  const structureGuard = getStageGuardMessage(state);
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
      <section className="resume-structure-panel" aria-labelledby="resume-structure-title">
        <div className="structure-panel-heading">
          <div>
            <h3 id="resume-structure-title">Estructura del currículum</h3>
            <p id="resume-structure-help" className="field-help">
              La detección agrupa líneas existentes y no reescribe ni completa contenido. El textarea sigue siendo
              el único editor del currículum.
            </p>
          </div>
          <button
            type="button"
            onClick={onDetectStructure}
            disabled={error !== null}
            aria-describedby="resume-structure-help"
          >
            {state.resumeStructure.status === "idle" ? "Detectar estructura" : "Volver a detectar"}
          </button>
        </div>
        <div
          ref={structureSummaryRef}
          tabIndex={-1}
          className="structure-summary"
          aria-live="polite"
        >
          {structureStatusText(state)}
        </div>
        {structureGuard !== null && state.resumeText.trim().length > 0 ? (
          <p className="guard-message">{structureGuard}</p>
        ) : null}
        {state.resumeStructure.status === "error" ? (
          <p className="field-error" role="alert">
            No se pudo detectar una estructura revisable. Puedes corregir el texto o usar el análisis de texto plano.
          </p>
        ) : null}
        {state.resumeStructure.status === "detected" && state.resumeStructure.draft !== null ? (
          <StructureReview
            sections={state.resumeStructure.draft.sections}
            dispatch={dispatch}
          />
        ) : null}
        {state.resumeStructure.status === "confirmed" && state.resumeStructure.mode === "structured" ? (
          <ConfirmedStructure sections={state.resumeStructure.draft?.sections ?? []} />
        ) : null}
        {state.resumeStructure.status === "confirmed" && state.resumeStructure.mode === "plain" ? (
          <p className="plain-parser-note">
            Se utilizará el análisis de texto plano anterior. La estructura detectada no se usará para este análisis.
          </p>
        ) : null}
        <div className="structure-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => dispatch({ type: "confirm_resume_structure" })}
            disabled={state.resumeStructure.draft === null}
          >
            Confirmar estructura
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "use_plain_resume_parser" })}
            disabled={error !== null}
          >
            Usar análisis de texto plano
          </button>
          {state.resumeStructure.status === "confirmed" ? (
            <button type="button" onClick={onDetectStructure} disabled={error !== null}>
              Revisar nuevamente
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

function StructureReview({
  sections,
  dispatch,
}: {
  sections: readonly StructuredResumeSection[];
  dispatch: StageComponentProps["dispatch"];
}) {
  return (
    <fieldset className="structure-review" aria-describedby="resume-structure-help">
      <legend>Revisión de secciones detectadas</legend>
      <div className="structure-card-list">
        {sections.map((section, index) => (
          <article className="structure-card" key={section.id}>
            <div className="structure-card-header">
              <div>
                <h4>{section.originalHeading ?? `Sección ${index + 1}`}</h4>
                <p className="field-note">
                  {STRUCTURED_RESUME_CONFIDENCE_LABELS[section.confidence]} · {section.lines.length} líneas
                </p>
              </div>
              <label>
                Tipo de sección
                <select
                  value={section.kind}
                  onChange={(event) =>
                    dispatch({
                      type: "set_resume_section_kind",
                      sectionId: section.id,
                      kind: event.currentTarget.value as StructuredResumeSectionKind,
                    })
                  }
                >
                  {StructuredResumeSectionKind.map((kind) => (
                    <option value={kind} key={kind}>
                      {STRUCTURED_RESUME_SECTION_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {section.warningCodes.length > 0 ? (
              <ul className="structure-warning-list" aria-label="Advertencias de sección">
                {section.warningCodes.map((warningCode) => (
                  <li key={warningCode}>{STRUCTURED_RESUME_WARNING_LABELS[warningCode]}</li>
                ))}
              </ul>
            ) : null}
            <p className="structure-excerpt">{sectionExcerpt(section)}</p>
          </article>
        ))}
      </div>
    </fieldset>
  );
}

function ConfirmedStructure({ sections }: { sections: readonly StructuredResumeSection[] }) {
  return (
    <div className="confirmed-structure">
      <strong>Estructura confirmada.</strong>
      <span>
        {sections.length} secciones: {sections.map((section) => STRUCTURED_RESUME_SECTION_LABELS[section.kind]).join(", ")}.
      </span>
    </div>
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

function structureStatusText(state: StageComponentProps["state"]): string {
  if (state.resumeStructure.status === "detected" && state.resumeStructure.draft !== null) {
    return `${state.resumeStructure.draft.sections.length} secciones detectadas. Revisa la categoría de cada una antes de continuar.`;
  }
  if (state.resumeStructure.status === "confirmed" && state.resumeStructure.mode === "structured") {
    return "Modo estructurado seleccionado para el análisis.";
  }
  if (state.resumeStructure.status === "confirmed" && state.resumeStructure.mode === "plain") {
    return "Modo de texto plano seleccionado para el análisis.";
  }
  if (state.resumeStructure.status === "error") {
    return "La detección no produjo una estructura revisable.";
  }
  return "Detecta secciones para revisar cómo se usará el currículum en el análisis.";
}

function sectionExcerpt(section: StructuredResumeSection): string {
  const content = section.lines
    .filter((line) => line.role === "body" && line.text.trim().length > 0)
    .slice(0, 3)
    .map((line) => line.text.trim())
    .join(" ");
  if (content.length === 0) {
    return "Sin contenido adicional. Si falta texto, edítalo en el textarea y vuelve a detectar.";
  }
  return content.length <= 220 ? content : `${content.slice(0, 217)}...`;
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
