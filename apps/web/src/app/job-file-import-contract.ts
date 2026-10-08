export const JobImportErrorCode = Object.freeze({
  FileRequired: "JOB_IMPORT_FILE_REQUIRED",
  FileTooLarge: "JOB_IMPORT_FILE_TOO_LARGE",
  TypeUnsupported: "JOB_IMPORT_TYPE_UNSUPPORTED",
  EmptyText: "JOB_IMPORT_EMPTY_TEXT",
  TextTooLarge: "JOB_IMPORT_TEXT_TOO_LARGE",
  DecodeFailed: "JOB_IMPORT_DECODE_FAILED",
  Failed: "JOB_IMPORT_FAILED",
} as const);

export type JobImportErrorCode = typeof JobImportErrorCode[keyof typeof JobImportErrorCode];

export type JobImportSource = "manual" | "txt" | "md";

export class JobImportError extends Error {
  readonly code: JobImportErrorCode;

  constructor(code: JobImportErrorCode) {
    super(code);
    this.name = "JobImportError";
    this.code = code;
  }
}

export function getJobImportErrorMessage(code: JobImportErrorCode): string {
  const messages: Record<JobImportErrorCode, string> = {
    JOB_IMPORT_FILE_REQUIRED: "Selecciona un archivo TXT o MD.",
    JOB_IMPORT_FILE_TOO_LARGE: "El archivo supera el límite permitido para la oferta.",
    JOB_IMPORT_TYPE_UNSUPPORTED: "Solo se admiten archivos TXT o MD.",
    JOB_IMPORT_EMPTY_TEXT: "No se encontró texto en el archivo. Puedes seleccionar otro archivo o pegar la oferta.",
    JOB_IMPORT_TEXT_TOO_LARGE: "El texto importado supera el límite de la demo.",
    JOB_IMPORT_DECODE_FAILED: "No se pudo leer el archivo como texto UTF-8.",
    JOB_IMPORT_FAILED: "No se pudo importar la oferta. Puedes seleccionar otro archivo o pegar el texto.",
  };
  return messages[code];
}
