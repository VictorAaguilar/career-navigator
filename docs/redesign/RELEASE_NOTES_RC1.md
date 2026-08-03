# Release Notes RC1

## Career Navigator Web RC1

RC1 estabiliza el MVP local del CV Tailoring Agent para revisión end-to-end antes de cualquier despliegue público.

## Incluido

- Shell web de nueve etapas con `TailoringSession` como fuente única de navegación.
- Importación local de currículum DOCX y PDF con texto seleccionable.
- Parsing estructural revisable y alternativa explícita de texto plano.
- Análisis determinista de requisitos, evidencias y compatibilidad.
- Explicaciones de ubicación de evidencia y ubicación objetivo.
- Propuestas revisables con aprobación, rechazo o edición humana.
- Validación determinista de candidatos antes de aplicar cambios.
- Vista previa del currículum adaptado.
- Descarga local de `curriculum-adaptado.docx`.
- Runner E2E RC sobre build de producción con `vite preview`.
- Presupuesto automatizado de bundle inicial.
- Preparación de despliegue estático en GitHub Pages con base `/career-navigator/`, pendiente de merge y activación manual.

## Garantías De Privacidad

- Ejecución local en navegador.
- Sin backend.
- Sin almacenamiento persistente.
- Sin cookies de producto.
- Sin llamadas LLM.
- Sin analítica.
- Sin subida de archivos.

Los datos pegados o importados viven en memoria de la pestaña durante la sesión local.

## Validación Recomendada

```bash
npm ci
npm run release:check
```

En Windows:

```powershell
npm.cmd ci
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
npm.cmd run release:check
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```

`release:check` ejecuta tests unitarios, typecheck raíz, typecheck web, build web, bundle check, audit de producción y E2E RC.

Validación Pages local:

```bash
npm run web:build:pages
npm run web:e2e:pages
npm run web:pages:artifact-check
```

## Navegadores

- Chrome: aprobado para RC1.
- Microsoft Edge: aprobado para RC1.
- Chromium completo: soportado por el runner, pero no disponible en el entorno Windows validado sin instalación manual.
- Firefox: no aprobado en RC1.
- Safari: no probado en RC1.

El E2E usa canales Playwright (`chromium`, `chrome`, `msedge`) y no requiere `chromium-headless-shell`.

## Limitaciones

- No es un despliegue público.
- GitHub Pages aún requiere merge a `universal-redesign` y activación manual en Settings.
- No hay backend, login, almacenamiento ni sincronización.
- No hay OCR.
- No hay importación de ofertas desde archivo.
- No hay generación libre de texto ni LLM.
- No sustituye revisión humana.
- No garantiza compatibilidad visual perfecta en todos los lectores DOCX.
- No incluye auditoría manual completa WCAG.

## Cambios Compatibles

No se modifican contratos de matching, scoring, schemas de dominio, generación DOCX core ni dependencias.

## Riesgos Pendientes

- Definir hosting y política de privacidad para despliegue.
- Ampliar matriz de navegadores si se requiere soporte Firefox/Safari.
- Añadir revisión manual de accesibilidad y responsive.
- Definir estrategia de persistencia si más adelante se permiten sesiones guardadas.
