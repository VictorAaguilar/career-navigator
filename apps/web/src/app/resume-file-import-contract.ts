export const ResumeImportErrorCode = {
  FileRequired: "RESUME_IMPORT_FILE_REQUIRED",
  FileTooLarge: "RESUME_IMPORT_FILE_TOO_LARGE",
  TypeUnsupported: "RESUME_IMPORT_TYPE_UNSUPPORTED",
  SignatureInvalid: "RESUME_IMPORT_SIGNATURE_INVALID",
  DocxInvalid: "RESUME_IMPORT_DOCX_INVALID",
  DocxTooComplex: "RESUME_IMPORT_DOCX_TOO_COMPLEX",
  PdfInvalid: "RESUME_IMPORT_PDF_INVALID",
  PdfPasswordProtected: "RESUME_IMPORT_PDF_PASSWORD_PROTECTED",
  PdfTooManyPages: "RESUME_IMPORT_PDF_TOO_MANY_PAGES",
  PdfNoText: "RESUME_IMPORT_PDF_NO_TEXT",
  TextTooLarge: "RESUME_IMPORT_TEXT_TOO_LARGE",
  Failed: "RESUME_IMPORT_FAILED",
} as const;

export type ResumeImportErrorCode = (typeof ResumeImportErrorCode)[keyof typeof ResumeImportErrorCode];

export const ResumeImportWarningCode = {
  TextExceedsAnalysisLimit: "RESUME_IMPORT_TEXT_EXCEEDS_ANALYSIS_LIMIT",
  PdfLayoutOrderMayVary: "RESUME_IMPORT_PDF_LAYOUT_ORDER_MAY_VARY",
  VisualFormattingNotPreserved: "RESUME_IMPORT_VISUAL_FORMATTING_NOT_PRESERVED",
} as const;

export type ResumeImportWarningCode =
  (typeof ResumeImportWarningCode)[keyof typeof ResumeImportWarningCode];

export type ResumeImportSource = "manual" | "docx" | "pdf";

export class ResumeImportError extends Error {
  readonly code: ResumeImportErrorCode;

  constructor(code: ResumeImportErrorCode) {
    super(code);
    this.name = "ResumeImportError";
    this.code = code;
  }
}

export function getResumeImportErrorMessage(errorCode: ResumeImportErrorCode): string {
  const messages: Record<ResumeImportErrorCode, string> = {
    RESUME_IMPORT_FILE_REQUIRED: "Selecciona un archivo DOCX o PDF.",
    RESUME_IMPORT_FILE_TOO_LARGE: "El archivo supera el límite de 8 MiB.",
    RESUME_IMPORT_TYPE_UNSUPPORTED: "Formato no compatible. Usa DOCX o PDF con texto seleccionable.",
    RESUME_IMPORT_SIGNATURE_INVALID: "El archivo no coincide con un DOCX o PDF válido.",
    RESUME_IMPORT_DOCX_INVALID: "No se pudo leer el DOCX. Comprueba que sea un archivo DOCX válido.",
    RESUME_IMPORT_DOCX_TOO_COMPLEX: "El DOCX supera los límites de complejidad de esta demo.",
    RESUME_IMPORT_PDF_INVALID: "No se pudo leer el PDF. Comprueba que no esté dañado.",
    RESUME_IMPORT_PDF_PASSWORD_PROTECTED: "No se puede importar un PDF protegido con contraseña.",
    RESUME_IMPORT_PDF_TOO_MANY_PAGES: "El PDF supera el límite de 50 páginas.",
    RESUME_IMPORT_PDF_NO_TEXT: "No se encontró texto seleccionable en el PDF. Esta versión no incluye OCR. Puedes pegar el contenido manualmente o utilizar otro archivo.",
    RESUME_IMPORT_TEXT_TOO_LARGE: "El texto extraído supera el límite de seguridad de esta demo.",
    RESUME_IMPORT_FAILED: "No se pudo importar el archivo. Puedes seleccionar otro archivo o pegar el texto manualmente.",
  };
  return messages[errorCode];
}

export function getResumeImportWarningMessage(warningCode: ResumeImportWarningCode): string {
  const messages: Record<ResumeImportWarningCode, string> = {
    RESUME_IMPORT_TEXT_EXCEEDS_ANALYSIS_LIMIT: "El texto extraído queda editable, pero debes reducirlo por debajo de 24.000 caracteres antes de continuar.",
    RESUME_IMPORT_PDF_LAYOUT_ORDER_MAY_VARY: "En PDFs con columnas, tablas o diseños complejos, el orden del texto puede variar.",
    RESUME_IMPORT_VISUAL_FORMATTING_NOT_PRESERVED: "Se extrae solo el texto. El formato visual, imágenes e iconos no se conservan.",
  };
  return messages[warningCode];
}
