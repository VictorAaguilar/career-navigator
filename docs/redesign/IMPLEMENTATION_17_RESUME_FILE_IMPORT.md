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

Pendiente de completar al finalizar el incremento.
