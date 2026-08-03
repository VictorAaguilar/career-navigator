# Implementation 17 - Resume File Import

## Plan Inicial

Objetivo: permitir importar currículums DOCX y PDF desde la etapa `Currículum` del flujo web, manteniendo `resumeText` como única entrada canónica para parsing, matching, scoring, propuestas, revisión, preview y exportación DOCX.

## Inspección Inicial

- `TailoringSession` v1 existe y no necesita cambios.
- `TailoringDemoState` concentra `resumeText`, derivados y navegación por sesión.
- Cambiar `resumeText` ya invalida análisis, propuestas, decisiones, preview y DOCX.
- La etapa `ResumeStage` usa el textarea existente mediante `TextInputStage`.
- `JSZip` está disponible en el paquete raíz, pero no está declarado como dependencia directa del workspace web.
- No existe parser PDF local instalado.
- Playwright E2E ya tiene selector de navegador con fallback `chromium -> chrome -> msedge`.

## Decisiones Previstas

- Añadir `jszip@3.10.1` como dependencia directa de `@career-navigator/web` para lectura local de DOCX.
- Añadir `pdfjs-dist@6.2.108` como dependencia directa de `@career-navigator/web` para extracción local de texto de PDF.
- Cargar `pdfjs-dist` dinámicamente solo al importar PDF.
- Configurar el worker de PDF desde el bundle local de Vite, sin CDN.
- Mantener operaciones async fuera del reducer.
- Usar un contador local con `useRef` para que gane la última importación seleccionada.
- No almacenar `File`, `Blob`, `ArrayBuffer`, `Uint8Array`, rutas locales ni bytes en `TailoringDemoState`.

## Límites Iniciales

- Archivo máximo: 8 MiB.
- PDF máximo: 50 páginas.
- ZIP DOCX máximo: 200 entradas.
- XML DOCX acumulado máximo: 8 MiB.
- Texto bruto extraído máximo: 120.000 caracteres.
- Texto válido para continuar el análisis: 24.000 caracteres, igual que el límite actual de `resumeText`.

## Seguridad Y Privacidad

- El archivo se procesa únicamente en el navegador.
- No se envía a servidores, APIs, storage, LLM ni servicios externos.
- No hay OCR.
- Los errores visibles son seguros y no incluyen contenido del CV, bytes, stack traces ni rutas locales.

## Resultado Final

La implementación añade importación local de currículums DOCX y PDF en la etapa `Currículum`.

- `resumeText` sigue siendo la única entrada canónica.
- El reducer incorpora solo `resumeImport`, un estado efímero con `status`, `source`, `warnings` y `errorCode`.
- No se almacenan `File`, `Blob`, `ArrayBuffer`, `Uint8Array`, rutas, object URLs ni bytes.
- `resume_import_succeeded` actualiza `resumeText` e invalida derivados mediante el mismo contrato que la edición manual.
- Las lecturas async ocurren en `useTailoringDemoController`, fuera del reducer.
- `resumeImportSequenceRef` garantiza que el último archivo seleccionado gana y que resultados obsoletos no sobrescriben el estado.
- La UI mantiene el textarea visible y editable tras importar.

## Implementación DOCX

La importación DOCX usa `jszip@3.10.1` declarado directamente en `@career-navigator/web`.

Validación:

- extensión `.docx`;
- MIME DOCX cuando el navegador lo proporciona;
- firma ZIP;
- presencia de `[Content_Types].xml`;
- presencia de `word/document.xml`;
- límite de entradas ZIP;
- rechazo de DTD, DOCTYPE y CDATA.

Extracción:

- `word/document.xml`;
- headers y footers referenciados desde `word/_rels/document.xml.rels`;
- párrafos;
- tablas mediante sus párrafos internos;
- tabs;
- saltos;
- entidades XML estándar y numéricas;
- Unicode y acentos.

No conserva formato visual, imágenes, colores, columnas ni iconos.

## Implementación PDF

La importación PDF usa `pdfjs-dist@6.2.108` declarado directamente en `@career-navigator/web`.

Justificación: no existía parser PDF local ya instalado. `pdfjs-dist` permite extraer texto seleccionable en el navegador sin backend, sin OCR y sin servicios externos.

El módulo se carga dinámicamente solo al importar PDF. El worker se resuelve desde el bundle local con:

```ts
new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url)
```

No se usa CDN ni URL remota.

Validación:

- extensión `.pdf`;
- MIME PDF cuando el navegador lo proporciona;
- firma `%PDF-`;
- máximo 50 páginas;
- detección de PDF sin texto seleccionable;
- clasificación segura de PDF protegido o dañado.

Orden textual:

- páginas en orden ascendente;
- elementos agrupados por posición vertical con tolerancia de 2,5 unidades;
- texto dentro de cada línea ordenado por posición horizontal;
- warning visible para columnas, tablas y diseños complejos.

## Errores Estables

- `RESUME_IMPORT_FILE_REQUIRED`
- `RESUME_IMPORT_FILE_TOO_LARGE`
- `RESUME_IMPORT_TYPE_UNSUPPORTED`
- `RESUME_IMPORT_SIGNATURE_INVALID`
- `RESUME_IMPORT_DOCX_INVALID`
- `RESUME_IMPORT_DOCX_TOO_COMPLEX`
- `RESUME_IMPORT_PDF_INVALID`
- `RESUME_IMPORT_PDF_PASSWORD_PROTECTED`
- `RESUME_IMPORT_PDF_TOO_MANY_PAGES`
- `RESUME_IMPORT_PDF_NO_TEXT`
- `RESUME_IMPORT_TEXT_TOO_LARGE`
- `RESUME_IMPORT_FAILED`

## Pruebas

Unitarias:

- `tests/unit/resume-file-import.test.ts`

E2E:

- `tests/e2e/resume-file-import-flow.mjs`

Scripts:

- `npm run web:e2e:import`
- `npm run web:e2e:import:headed`

Los E2E generan archivos DOCX/PDF sintéticos en directorios temporales y los eliminan al terminar.
