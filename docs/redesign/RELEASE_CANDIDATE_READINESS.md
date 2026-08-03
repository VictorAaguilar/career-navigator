# Release Candidate Readiness

Estado de preparación del MVP web local del CV Tailoring Agent antes de decidir un despliegue posterior.

## Resumen Ejecutivo

El Release Candidate queda preparado para validación local con datos sintéticos y revisión humana. El flujo aprobado cubre importación local de currículum, parsing estructural o plano, análisis determinista, trazabilidad de evidencias, propuestas, decisiones explícitas, vista previa y descarga DOCX.

No se declara listo para producción pública, multiusuario ni uso con datos sensibles fuera del navegador local. No incorpora backend, cuentas, almacenamiento, analítica, llamadas LLM ni OCR.

## Matriz De Readiness

| Área | Estado | Evidencia | Riesgo residual |
| --- | --- | --- | --- |
| Contrato de sesión | Aprobado | `tests/unit/tailoring-session-contracts.test.ts` | Sin navegación directa deliberada. |
| Matching y scoring | Aprobado | `tests/unit/matching.test.ts`, `tests/unit/scoring.test.ts` | No se modifican fórmulas ni umbrales en este incremento. |
| Importación DOCX/PDF local | Aprobado | `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import` | Sin OCR; solo PDF con texto seleccionable. |
| Parsing estructural | Aprobado | `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure` | La clasificación sigue siendo revisable por humanos. |
| Trazabilidad de evidencia y targeting | Aprobado | `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting` | Las ubicaciones aproximadas en modo plano requieren revisión. |
| Revisión humana | Aprobado | `tests/unit/rewrite-review-decisions.test.ts`, `tests/unit/tailoring-ui-demo.test.ts` | No aplica cambios sin decisión explícita. |
| Vista previa y DOCX | Aprobado | `tests/unit/docx-renderer.test.ts`, `npm run web:e2e:rc` | Validación automatizada de estructura ZIP y contenido esperado. |
| Build de producción | Aprobado | `npm run web:build`, `npm run web:bundle:check` | Presupuesto automatizado para assets iniciales. |
| Chrome | Aprobado | `PLAYWRIGHT_BROWSER_CHANNEL=chrome npm run web:e2e:rc` | Canal principal recomendado para RC. |
| Microsoft Edge | Aprobado | `PLAYWRIGHT_BROWSER_CHANNEL=msedge npm run web:e2e:rc` | Validado como segundo canal Chromium-based. |
| Chromium completo | Soportado, no disponible en este entorno | `PLAYWRIGHT_BROWSER_CHANNEL=chromium npm run web:e2e:rc` devuelve el error estable de navegador ausente | Puede instalarse manualmente con `npx.cmd --no-install playwright install --no-shell chromium`. |
| Firefox | No aprobado | Sin runner ni matriz de compatibilidad dedicada | Fuera del alcance de RC1. |
| Safari | No probado | No disponible en el entorno Windows de validación | Fuera del alcance de RC1. |
| Responsive | Aprobado con limitaciones | `npm run web:e2e:rc` en 320, 375, 768, 1024 y 1440 px | Revisión visual manual sigue recomendada. |
| Teclado | Aprobado con limitaciones | `npm run web:e2e:rc` cubre avance básico por teclado | No sustituye auditoría completa WCAG. |
| Privacidad local | Aprobado | E2E bloquea requests externos; tests buscan storage/red | El usuario debe cerrar o limpiar la pestaña para descartar estado en memoria. |
| Seguridad de dependencias de producción | Aprobado | `npm audit --omit=dev` | Vulnerabilidades dev conocidas no forman parte del paquete de producción. |
| Despliegue público | Pendiente | No hay infraestructura en este incremento | Requiere decisión posterior. |

## Criterios Aprobados

- `npm ci` reproduce la instalación bloqueada.
- `npm test` pasa con la suite completa.
- `npm run typecheck` y `npm run web:typecheck` pasan.
- `npm run web:build` genera el build de producción.
- `npm run web:bundle:check` verifica presupuestos y carga diferida de chunks pesados.
- `npm audit --omit=dev` muestra cero vulnerabilidades de producción.
- `npm run web:e2e:rc` valida el flujo end-to-end sobre `vite preview`.
- El DOCX descargado no contiene IDs técnicos ni metadatos de trazabilidad de UI.

## Limitaciones Conocidas

- No hay backend ni persistencia.
- No hay autenticación ni sesiones guardadas.
- No hay OCR para PDFs escaneados.
- No hay importación de ofertas desde archivo.
- No hay llamadas LLM ni generación libre de texto.
- No hay soporte declarado para Firefox o Safari en RC1.
- No hay garantía de compatibilidad con todos los lectores DOCX.
- No hay despliegue cloud ni pipeline de release público.

## Decisión Recomendada

La rama puede abrir Pull Request como Release Candidate local. Antes de un despliegue público se recomienda decidir matriz de navegadores, hosting, política de privacidad publicada, accesibilidad manual y estrategia de datos.
