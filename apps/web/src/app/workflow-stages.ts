type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

const workflowStages = [
  {
    id: "start",
    shortLabel: "Inicio",
    title: "Comienza una nueva adaptación",
    description: "Prepara un recorrido guiado para adaptar tu currículum con revisión humana en cada decisión.",
    position: 1,
  },
  {
    id: "resume",
    shortLabel: "Currículum",
    title: "Introduce tu experiencia profesional",
    description: "Pega tu currículum o importa un DOCX o PDF con texto seleccionable. Revisa el contenido antes de continuar.",
    position: 2,
  },
  {
    id: "job",
    shortLabel: "Oferta",
    title: "Añade la oferta laboral objetivo",
    description: "Pega la oferta o importa un archivo TXT o Markdown para analizar sus requisitos.",
    position: 3,
  },
  {
    id: "analysis",
    shortLabel: "Análisis",
    title: "Analiza requisitos y compatibilidad",
    description: "Compara los requisitos de la oferta con las evidencias presentes en tu currículum.",
    position: 4,
  },
  {
    id: "requirements",
    shortLabel: "Evidencias",
    title: "Revisa requisitos y evidencias encontradas",
    description: "Comprueba qué requisitos tienen evidencia y cuáles quedan sin cubrir.",
    position: 5,
  },
  {
    id: "proposals",
    shortLabel: "Propuestas",
    title: "Compara las mejoras sugeridas",
    description: "Compara cada propuesta con el texto original y revisa la evidencia que la respalda.",
    position: 6,
  },
  {
    id: "review",
    shortLabel: "Revisión",
    title: "Aprueba, rechaza o edita cada propuesta",
    description: "Decide qué propuestas aplicar. Los cambios requieren tu aprobación explícita.",
    position: 7,
  },
  {
    id: "preview",
    shortLabel: "Vista previa",
    title: "Revisa el currículum adaptado",
    description: "Revisa el contenido que se exportará y comprueba las decisiones aplicadas.",
    position: 8,
  },
  {
    id: "download",
    shortLabel: "Descargar",
    title: "Genera y descarga el documento DOCX",
    description: "Descarga el currículum en DOCX y revísalo en tu editor de documentos antes de enviarlo.",
    position: 9,
  },
] as const;

export type WorkflowStageId = (typeof workflowStages)[number]["id"];

export type WorkflowStage = DeepReadonly<{
  id: WorkflowStageId;
  shortLabel: string;
  title: string;
  description: string;
  position: number;
}>;

export type WorkflowNavigationState = DeepReadonly<{
  currentStage: WorkflowStage;
  previousStage: WorkflowStage | null;
  nextStage: WorkflowStage | null;
  currentPosition: number;
  totalStages: number;
  canGoBackward: boolean;
  canGoForward: boolean;
}>;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }

  return value as DeepReadonly<T>;
}

export const WORKFLOW_STAGES = deepFreeze(workflowStages);
