import { TAILORING_DEMO_LIMIT_LABELS } from "../../app/tailoring-demo-limits";
import { validateTextForStage } from "../../app/tailoring-demo-state";
import type { StageComponentProps } from "./stage-types";
import { TextInputStage } from "./TextInputStage";

export function JobStage({ state, dispatch }: StageComponentProps) {
  const error = validateTextForStage("job", state.jobText);
  return (
    <TextInputStage
      id="job-text"
      label="Oferta laboral"
      help={`Pega requisitos o descripción. Límite: ${TAILORING_DEMO_LIMIT_LABELS.jobTextMaxLength}.`}
      placeholder="Ejemplo: Buscamos experiencia con React, TypeScript y revisión de propuestas."
      value={state.jobText}
      error={error}
      onChange={(value) => dispatch({ type: "set_job_text", value })}
      onClear={() => dispatch({ type: "clear_job_text" })}
    />
  );
}
