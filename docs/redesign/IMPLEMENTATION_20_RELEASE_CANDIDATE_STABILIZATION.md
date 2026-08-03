# Implementación 20: Release Candidate Stabilization

## Estado Base

La rama `feature/release-candidate-stabilization` parte con:

- árbol limpio;
- `TailoringSession` v1 como fuente única de navegación;
- importación DOCX/PDF local;
- parsing estructural y modo plano;
- explicaciones de targeting y ubicaciones;
- selector de navegador E2E por canal;
- 21 archivos de pruebas;
- 977 tests superados;
- typecheck raíz y web correctos;
- build web correcto;
- audit de producción con cero vulnerabilidades.

Baseline de build confirmado:

- JS inicial: `423.21 kB`;
- CSS inicial: `12.65 kB`;
- `pdf.worker`, PDF.js, JSZip y DOCX siguen en chunks diferidos.

## Riesgos Encontrados

- No existía un E2E sobre `vite preview`; los flujos existentes validaban servidor de desarrollo.
- No existía comprobación automatizada de presupuesto de bundle.
- No existía script agregado de Release Candidate para ejecutar checks en orden.
- La documentación principal no describía el estado RC ni el flujo web local.
- La matriz de navegadores no estaba documentada con estados honestos.
- La meta description del HTML usaba texto español sin tildes.
- El error de descarga DOCX no estaba marcado como `role="alert"`.

## Plan De Trabajo

1. Añadir presupuesto determinista de bundle sobre `apps/web/dist`.
2. Añadir runner de Release Candidate sobre build de producción con `vite preview`.
3. Cubrir responsive, teclado, requests externos, consola e integridad DOCX en el runner RC.
4. Añadir script agregado `release:check` sin nuevas dependencias.
5. Añadir pruebas unitarias de presupuestos, scripts, documentación y regresión de dominio.
6. Aplicar únicamente correcciones de UI justificadas por la inspección.
7. Crear documentación de instalación, readiness y release notes RC1.
8. Ejecutar validación completa y publicar la rama.

## Criterios De Aceptación

- Mismo comportamiento de matching, scoring, propuestas, validación, review, preview, export model y DOCX.
- Build de producción y preview validados.
- Chrome validado mediante `PLAYWRIGHT_BROWSER_CHANNEL=chrome`.
- Viewports 320, 375, 768, 1024 y 1440 sin overflow horizontal general.
- Flujo principal operable por teclado automatizado.
- Sin errores de consola ni requests externos en RC E2E.
- Bundle dentro de presupuesto.
- Documentación suficiente para instalación, validación local y decisión de despliegue posterior.

## Alcance Excluido

No se añade LLM, backend, API, storage, autenticación, analytics, OCR, router, PWA, nuevas dependencias, cambios de scoring, cambios de matching, cambios de renderer DOCX, infraestructura cloud, tags ni GitHub Release.

## Implementación Realizada

- `web:e2e:rc` y `web:e2e:rc:headed` ejecutan un flujo end-to-end contra `vite preview` en `127.0.0.1:4178`.
- El runner RC valida inicio, parsing estructural, oferta, análisis, evidencias, propuestas, revisión humana, vista previa y descarga DOCX.
- El runner RC comprueba ausencia de errores de consola y ausencia de requests externos.
- El runner RC revisa viewports de 320, 375, 768, 1024 y 1440 px para detectar overflow horizontal general.
- El runner RC cubre navegación básica por teclado hasta confirmar estructura.
- El DOCX descargado se valida como ZIP OOXML y se comprueba que no contenga IDs técnicos ni metadatos de trazabilidad de UI.
- `web:bundle:check` analiza `apps/web/dist/index.html` sin depender de hashes de Vite.
- El presupuesto inicial queda fijado en `466000` bytes de JS, `16000` bytes de CSS y `2500` bytes de HTML.
- `pdf.worker`, PDF.js, JSZip y DOCX deben permanecer como chunks diferidos, no como assets iniciales.
- `release:check` ejecuta tests, typechecks, build, bundle check, audit de producción y RC E2E en orden.

## Correcciones Pequeñas Aplicadas

- La meta description de `apps/web/index.html` usa español acentuado.
- El botón de descarga muestra `Descargar currículum adaptado`, manteniendo el nombre de archivo `curriculum-adaptado.docx`.
- Los errores de generación DOCX se anuncian con `role="alert"`.
- Las pruebas E2E existentes se actualizan para buscar el texto visible correcto del botón.

## Documentación Añadida

- `LOCAL_INSTALLATION_AND_VALIDATION.md`: instalación local, comandos de validación, canales de navegador, puertos y limpieza.
- `RELEASE_CANDIDATE_READINESS.md`: matriz de readiness, riesgos residuales y limitaciones.
- `RELEASE_NOTES_RC1.md`: alcance de RC1, garantías de privacidad, navegadores y pendientes.
- `TAILORING_DEMO_USER_GUIDE.md` y `TAILORING_DEMO_ACCEPTANCE_CHECKLIST.md` incorporan el flujo RC.

## Estado De Navegadores

- Chrome: aprobado para RC1.
- Microsoft Edge: aprobado para RC1.
- Chromium completo: soportado por el runner, pero no disponible en este entorno sin instalación manual.
- Firefox: no aprobado en RC1.
- Safari: no probado en RC1.

## Decisión De Release Candidate

El incremento prepara una rama candidata para PR, no un despliegue público ni una release etiquetada. La decisión de despliegue queda fuera del alcance y debe considerar hosting, política de privacidad, accesibilidad manual y matriz final de navegadores.
