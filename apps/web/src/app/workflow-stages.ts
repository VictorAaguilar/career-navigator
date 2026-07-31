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
    description: "Aquí se incorporará el contenido del CV sin almacenarlo en esta versión del shell.",
    position: 2,
  },
  {
    id: "job",
    shortLabel: "Oferta",
    title: "Añade la oferta laboral objetivo",
    description: "Esta etapa recibirá la oferta para extraer requisitos cuando se conecten los próximos incrementos.",
    position: 3,
  },
  {
    id: "analysis",
    shortLabel: "Análisis",
    title: "Analiza requisitos y compatibilidad",
    description: "El análisis mostrará el avance del matching y scoring sin exponer detalles técnicos innecesarios.",
    position: 4,
  },
  {
    id: "requirements",
    shortLabel: "Evidencias",
    title: "Revisa requisitos y evidencias encontradas",
    description: "Aquí se presentarán requisitos y evidencias de forma comprensible, manteniendo los datos privados.",
    position: 5,
  },
  {
    id: "proposals",
    shortLabel: "Propuestas",
    title: "Compara las mejoras sugeridas",
    description: "Las propuestas futuras se compararán con el texto original antes de pedir aprobación.",
    position: 6,
  },
  {
    id: "review",
    shortLabel: "Revisión",
    title: "Aprueba, rechaza o edita cada propuesta",
    description: "La revisión humana será obligatoria antes de aplicar cualquier cambio al currículum.",
    position: 7,
  },
  {
    id: "preview",
    shortLabel: "Vista previa",
    title: "Revisa el currículum adaptado",
    description: "La vista previa mostrará el contenido final aprobado sin crear archivos en este incremento.",
    position: 8,
  },
  {
    id: "download",
    shortLabel: "Descargar",
    title: "Genera y descarga el documento DOCX",
    description: "La descarga DOCX se conectará más adelante; este shell no genera ni guarda documentos.",
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
