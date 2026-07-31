import { TAILORING_DEMO_LIMIT_LABELS } from "../../app/tailoring-demo-limits";
import { validateTextForStage } from "../../app/tailoring-demo-state";
import type { StageComponentProps } from "./stage-types";
import { TextInputStage } from "./TextInputStage";

export function ResumeStage({ state, dispatch }: StageComponentProps) {
  const error = validateTextForStage("resume", state.resumeText);
  return (
    <TextInputStage
      id="resume-text"
      label="Currículum"
      help={`Pega texto plano. Límite: ${TAILORING_DEMO_LIMIT_LABELS.resumeTextMaxLength}.`}
      placeholder="Ejemplo: Lideré proyectos React y TypeScript. Mejoré procesos internos documentados en el CV."
      value={state.resumeText}
      error={error}
      onChange={(value) => dispatch({ type: "set_resume_text", value })}
      onClear={() => dispatch({ type: "clear_resume_text" })}
    />
  );
}
