# DECISION 00: Conservar, reescribir, eliminar y posponer

## 1. Objetivo del documento

Este documento clasifica los componentes actuales de `career-navigator` para decidir qué conservar, qué reescribir, qué eliminar y qué posponer en la ruta hacia una herramienta universal y más amigable. La clasificación se basa exclusivamente en los análisis de `docs/redesign/AUDIT_00_REPOSITORY_MAP.md`, `docs/redesign/AUDIT_01_SCORING_ASSISTANTS_DASHBOARD.md` y la estructura real del repositorio.

## 2. Principios del rediseño

- Universalidad: facilitar que la herramienta funcione con distintos asistentes, plataformas y contextos.
- Privacidad local: el usuario debe poder gestionar su CV, perfil y datos sin exponerlos a servicios externos obligatorios.
- Explicabilidad: cada score y recomendación debe ser rastreable y comprensible.
- Trazabilidad requisito-evidencia: las decisiones deben ligar requisitos de la oferta con evidencia del CV.
- Compatibilidad multiasistente: soportar múltiples asistentes con adaptadores comunes y mínima duplicación.
- Facilidad de uso: reducir la dependencia de terminal y archivos manuales para usuarios no técnicos.
- Revisión humana: el sistema debe guiar, no automatizar el envío sin supervisión.
- No inventar experiencia: no generar ni alterar información del candidato más allá de lo que el CV soporta.
- Separación entre lógica, datos e interfaz: aislar la evaluación, los datos de usuario y las interfaces de presentación.

## 3. Criterios de clasificación

- Conservar: componente reutilizable con cambios menores, sin reescritura mayor.
- Conservar y refactorizar: componente útil, pero con acoplamientos, deuda técnica o formato difícil de mantener.
- Reescribir: componente cuya lógica actual no cumple los objetivos del rediseño y requiere reemplazo estructural.
- Eliminar: componente específico, duplicado, innecesario o demasiado atado al autor original.
- Posponer: componente útil para futuro, pero fuera del alcance del MVP.

## 4. Matriz de decisiones

| Componente | Ruta | Categoría | Motivo | Dependencias | Riesgo | Prioridad | Acción propuesta |
|---|---|---|---|---|---|---|---|
| Shared prompt de evaluación | `modes/_shared.md` | Conservar y refactorizar | Base de reglas y ética compartidas; requiere extraer lógica de scoring y política del prompt. | `modes/oferta.md`, `modes/ofertas.md`, asistentes | Medio | Alta | Refactorizar en una capa de política reutilizable y en un motor de scoring separado. |
| Modo de evaluación individual | `modes/oferta.md` | Reescribir | Depende de razonamiento del modelo más que de scoring reproducible. | `modes/_shared.md` | Alto | Alta | Reescribir como flujo de evaluación estructurado con extracción de evidencias. |
| Modo de comparación de ofertas | `modes/ofertas.md` | Conservar y refactorizar | Buena matriz de dimensiones, pero acoplada a prompts. | `modes/_shared.md` | Medio | Media | Refactorizar como configuración de critères y pesos configurables. |
| Perfil de usuario | `modes/_profile.md` | Conservar y refactorizar | Contiene personalización; debe migrarse a modelo universal de perfil. | `config/profile.yml`, `cv.md` | Medio | Alta | Refactorizar hacia estructura universal de perfil y objetivos. |
| Configuración de usuario | `config/profile.yml` | Conservar y refactorizar | Plantilla útil, pero dispersa junto a `_profile.md`. | `modes/_profile.md`, scripts | Medio | Alta | Consolidar con el perfil universal y documentar su uso. |
| CV principal | `cv.md` | Conservar | Fuente de verdad del candidato. | `templates/`, generación PDF, evaluación | Bajo | Alta | Mantener como input principal. |
| Configuración de portales | `portals.yml` | Conservar | Útil para escaneo, requiere mejorar formato y filtros. | `scan.mjs`, `validate-portals.mjs` | Medio | Media | Conservar y documentar mejor cómo personalizarlo. |
| Plantillas de documentos | `templates/` | Conservar | Generación de PDF/LaTeX reutilizable. | `generate-pdf.mjs`, `generate-latex.mjs` | Bajo | Media | Conservar como base de artefactos de exportación. |
| Generación de PDF | `generate-pdf.mjs` | Conservar y refactorizar | Útil, depende de Playwright y modelado de plantillas. | `templates/`, `package.json` | Medio | Media | Refactorizar para desacoplar de los prompts y añadir fallback. |
| Generación LaTeX | `generate-latex.mjs` | Conservar | Exportación alternativa válida. | `templates/` | Bajo | Baja | Conservar como opción secundaria. |
| Adaptadores ATS | `providers/` | Conservar y refactorizar | Útiles para extraer datos, necesitan mejor API y desacoplamiento. | `scan.mjs`, `check-liveness.mjs` | Medio | Media | Refactorizar en capa de extracción genérica. |
| Verificación de publicación | `check-liveness.mjs` | Conservar | Validación necesaria; requiere interfaz clara. | `liveness-core.mjs` | Medio | Alta | Conservar y reforzar con documentación de límites. |
| Escaneo de portales | `scan.mjs` | Conservar y posponer | Útil, pero no esencial para MVP universal. | `providers/`, `portals.yml` | Medio | Baja | Mantener como componente de segunda fase. |
| Tracker principal | `data/applications.md` | Conservar | Registro central de candidaturas. | `merge-tracker.mjs`, `reports/` | Bajo | Alta | Conservar como data store principal. |
| Pipeline pendiente | `data/pipeline.md` | Conservar | Inbox útil, pero puede integrarse mejor. | `scan.mjs`, scripts | Medio | Media | Conservar y adaptar a modelo de flujo. |
| Merge de tracker | `merge-tracker.mjs` | Conservar | Mantenimiento de entrada controlada. | `batch/tracker-additions/`, `data/applications.md` | Bajo | Media | Conservar si se mantiene el flujo de adición por lote. |
| Deduplicación tracker | `dedup-tracker.mjs` | Conservar | Importante para integridad de datos. | `data/applications.md` | Bajo | Media | Conservar y documentar su uso. |
| Normalizar estados | `normalize-statuses.mjs` | Conservar | Refuerza estados canónicos. | `templates/states.yml`, tracker | Bajo | Media | Conservar. |
| Verificar pipeline | `verify-pipeline.mjs` | Conservar | Valida integridad del tracker. | tracker scripts | Bajo | Media | Conservar. |
| Dashboard TUI | `dashboard/` | Posponer | Avanzado y técnico; buena opción de visualización futura. | `data/applications.md`, `reports/` | Medio | Baja | Posponer como opción de interfaz alternativa. |
| Skill Claude | `.claude/skills/career-ops/` | Conservar y refactorizar | Integración real, pero duplicada con otros asistentes. | `modes/` | Medio | Alta | Refactorizar hacia adaptador común. |
| Skill OpenCode | `.opencode/skills/` | Conservar y refactorizar | Integración real y casi idéntica a Claude. | `modes/` | Medio | Alta | Refactorizar junto con otros adaptadores. |
| Skill Qwen | `.qwen/skills/` | Conservar y refactorizar | Integración real y duplicada. | `modes/` | Medio | Alta | Refactorizar hacia un único adaptador de skill. |
| Documentación de asistentes | `AGENTS.md` | Conservar | Contrato de datos valioso. | docs, asistentes | Bajo | Media | Conservar y usar como base de políticas. |
| Documentación Claude | `CLAUDE.md` | Conservar | Especifica integración de Claude. | `.claude/` | Bajo | Baja | Conservar como documentación de plataforma. |
| Documentación OpenCode | `OPENCODE.md` | Conservar | Especifica integración de OpenCode. | `.opencode/` | Bajo | Baja | Conservar como documentación de plataforma. |
| Documentación Gemini | `GEMINI.md` | Conservar | Documenta soporte parcial de Gemini. | `gemini-eval.mjs` | Bajo | Baja | Conservar y alinear con integración real. |
| Evaluación Gemini | `gemini-eval.mjs` | Conservar y refactorizar | Evidencia de soporte Gemini; no está en el flujo principal. | `GEMINI.md` | Medio | Baja | Refactorizar como adaptador auxiliar de asistente. |
| Informes | `reports/` | Conservar | Fuente de evidencia cualitativa. | `data/applications.md`, modos | Bajo | Alta | Conservar como salida de evaluación. |
| Batch | `batch/` | Posponer | Proceso interno útil pero fuera del MVP inicial. | `merge-tracker.mjs` | Medio | Baja | Posponer y revisar para flujo futuro. |
| Preparación de entrevistas | `interview-prep/` | Posponer | Complemento valioso, no esencial al MVP. | `reports/`, `cv.md` | Medio | Baja | Posponer como fase 2. |

## 5. Componentes a conservar

- `cv.md`: fuente de verdad del candidato.
- `templates/`: plantillas de documento reutilizables.
- `data/applications.md`: tracker central de aplicaciones.
- `data/pipeline.md`: inbox de ofertas pendientes.
- `merge-tracker.mjs`, `dedup-tracker.mjs`, `normalize-statuses.mjs`, `verify-pipeline.mjs`: scripts de integridad del tracker.
- `check-liveness.mjs` y `liveness-core.mjs`: verificación de la vigencia de ofertas.
- `providers/`: adaptadores de extracción de ATS.
- `AGENTS.md`: contrato de datos y reglas de personalización.
- `GEMINI.md`, `CLAUDE.md`, `OPENCODE.md`: documentación de asistente útil como referencia.
- `reports/`: almacenamiento de resultados de evaluación.

## 6. Componentes a conservar y refactorizar

- `modes/_shared.md`: mantener la política y la ética, pero extraer el scoring en código y la lógica de requisitos.
- `modes/ofertas.md`: conservar la matriz de dimensiones, pero mover los pesos a una configuración paramétrica.
- `modes/_profile.md` y `config/profile.yml`: conservar la información de usuario, pero consolidar en un perfil universal y evitar redundancias.
- `generate-pdf.mjs`: mantener la capacidad de exportar PDF, desacoplando la generación de la dependencia directa de los prompts.
- `providers/`: conservar los adaptadores, but refactorizar hacia API genérica y mejores contratos.
- `.claude/skills/career-ops/`, `.opencode/skills/`, `.qwen/skills/`: conservar el soporte actual de skills, pero reemplazarlo con adaptadores comunes para minimizar duplicaciones.
- `gemini-eval.mjs`: conservar como evidencia de integración de Gemini, pero reestructurar para usar el mismo adaptador de asistente general en lugar de un script aislado.

## 7. Componentes a reescribir

- Motor de scoring: el modelo actual es prompt-driven y no reproducible. Debe reemplazarse por un motor de scoring determinista donde los pesos, criterios y resultados sean interpretables y auditables.
- Perfil universal: el perfil actual está fragmentado entre `config/profile.yml`, `modes/_profile.md` y el CV. Debe reescribirse como un modelo único de perfil, objetivos y metas laborales.
- Relación requisito-evidencia: debe crearse una estructura de datos que ligue cada requisito de la oferta con evidencia específica del CV y con la puntuación final.
- Adaptadores de asistentes: la lógica actual está duplicada en múltiples carpetas y basada en prompts. Debe reescribirse como una capa de adaptadores común, con un contracto único para cada asistente.
- Onboarding: el flujo actual es implícito y dependiente de `doctor.mjs` y archivos existentes. Debe reescribirse en un flujo guiado desacoplado y fácil de usar.
- Experiencia de usuario: la UX actual es técnica y terminal-first. Debe reescribirse para ofrecer un flujo más accesible y guiado, incluso si la primera versión sigue siendo CLI.

## 8. Componentes a eliminar o convertir en compatibilidad heredada

- Duplicaciones de asistentes: archivos específicos de `.claude/`, `.opencode/`, `.qwen/` deben migrarse a compatibilidad heredada cuando exista un adaptador común.
- Soporte de Codex actual documental: no hay carpeta `.codex/`; el soporte existente es más declaración que integración. Puede conservarse como compatibilidad heredada hasta que se implemente un adaptador real.
- Documentación redundante entre `AGENTS.md`, `CLAUDE.md`, `OPENCODE.md` y `GEMINI.md`: mantener solo la documentación base y convertir la duplicación en referencias.
- `batch/`: proceso de lote interno específico a la gestión actual; debería posponer y eventualmente migrar o eliminar si el nuevo flujo no lo requiere.
- Componentes demasiado específicos del autor o de uso interno actual, como scripts de prueba de compatibilidad de asistentes, si no son críticos para el MVP.

## 9. Componentes a posponer

- Dashboard web: el dashboard existente es una TUI y la versión web debe posponerse.
- Automatización de aplicaciones: envío automático y automatizaciones avanzadas de seguimiento.
- Escaneo masivo: `scan.mjs` y el escaneo completo de portales no son esenciales al MVP universal.
- Análisis avanzado de rechazos: `analyze-patterns.mjs` y análisis de patrones profundos se deben dejar para una fase posterior.
- Soporte multicuenta: no es necesario en la primera versión.
- Aplicación móvil: queda fuera del alcance inicial.

## 10. Alcance del MVP

El MVP debe incluir:
- Onboarding guiado con verificación de setup.
- Importación de CV desde `cv.md` o formatos equivalentes.
- Perfil universal consolidado.
- Definición de objetivos laborales y criterios de fit.
- Análisis de una oferta con score reproducible.
- Scoring reproducible y explicable.
- Trazabilidad requisito-evidencia estructurada.
- Adaptación de CV sin inventar experiencia.
- Exportación PDF basada en `templates/`.
- Tracker básico de candidaturas (`data/applications.md`).
- Integración inicial con Codex como asistente documentado y adaptable.
- Documentación de instalación clara.

## 11. Fuera del MVP

No se desarrollará todavía:
- Dashboard web.
- Envío automático de aplicaciones.
- Escaneo masivo y continuo de portales.
- Análisis avanzado de rechazos y patrones históricos.
- Integración multicuenta.
- Aplicación móvil.
- Internacionalización de UI más allá de documentación y prompts existentes.

## 12. Orden recomendado de implementación

1. Perfil universal y objetivos laborales.
2. Modelo de datos para requisito-evidencia.
3. Motor de scoring reproducible.
4. Refactorización de `modes/_shared.md` y `modes/ofertas.md` para separar policy de lógica.
5. Onboarding guiado y documentación de instalación.
6. Soporte inicial de adaptadores de asistentes comunes.
7. Conservación de `cv.md`, templates y generación de PDF.
8. Tracker básico y scripts de integridad.
9. Adaptadores ATS y verificación de publicaciones.
10. Revisión humana y validación de flujo.
11. Posponer dashboard avanzado y escaneo masivo para fases posteriores.

## 13. Riesgos y mitigaciones

- Pérdida de compatibilidad: generar adaptadores para asistentes actuales y mantener compatibilidad heredada con `.claude/`, `.opencode/`, `.qwen/` hasta migrar.
- Divergencia respecto al proyecto original: conservar las reglas de `AGENTS.md` y `modes/_shared.md` como referencia de políticas, pero no como implementación final.
- Lógica duplicada: centralizar prompts y adaptadores para evitar múltiples versiones del mismo comportamiento.
- Dependencia de asistentes: diseñar un núcleo independiente que pueda funcionar sin depender de un asistente específico.
- Privacidad: mantener el CV y perfil en local y documentar claramente qué datos se comparten con servicios externos.
- Errores de scoring: implementar scoring determinista y pruebas que validen consistencia entre ejecuciones.
- Mantenimiento multilenguaje: posponer la complejidad de locales adicionales hasta estabilizar el modelo universal.
- Complejidad del dashboard: tratar la TUI como una opción secundaria y no como interfaz principal.

## 14. Decisiones abiertas

- Si el MVP debe incluir una interfaz gráfica ligera o sólo un CLI guiado.
- Cómo estructurar exactamente el modelo de perfil universal sin duplicar `config/profile.yml` y `_profile.md`.
- Si el motor de scoring debe ser completamente determinista o un híbrido con validación de LLM.
- Hasta qué punto se deben mantener las integraciones de asistentes actuales como compatibilidad heredada.
- Cómo gestionar la importación de CV de formatos no Markdown en el MVP.
- Cuánto del actual `providers/` y `scan.mjs` se incorpora al MVP frente a posponerlo.
- Si `reports/` debe seguir siendo el principal repositorio de evidencia o trasladarse a un formato de datos estructurados.
