# AUDIT 00: Mapa del Repositorio

## 1. Resumen ejecutivo

Este documento presenta un mapeo inicial del repositorio `career-navigator` con foco en los componentes principales, los flujos de uso, las integraciones de asistentes de IA y los riesgos para su conversión en una herramienta universal. Se basa en el análisis de la estructura actual del proyecto sin ejecutar scripts ni modificar archivos existentes.

## 2. Objetivo de esta auditoría

El objetivo es documentar la arquitectura actual del proyecto, identificar componentes reutilizables y críticos, y señalar riesgos técnicos relevantes antes de proponer cualquier reescritura o refactorización.

## 3. Arquitectura actual del repositorio

Hechos confirmados:
- Es un proyecto Node.js con soporte adicional en Go (`dashboard/`).
- El sistema está organizado en varios dominios: scripts operativos (`*.mjs`), configuración de usuario (`config/`, `templates/`, `data/`), prompts y modos (`modes/`), integraciones de asistente (`.claude/`, `.opencode/`, `.qwen/`), y datos/resultados (`reports/`, `output/`).
- El flujo principal está pensado para ejecutarse dentro de un AI coding CLI y apoyarse en prompts de `modes/`.

Inferencia:
- No hay un único ejecutable monolítico; el proyecto utiliza scripts Node y prompts que se orquestan desde un asistente.

## 4. Mapa de carpetas y archivos principales

Hechos confirmados:
- `package.json`: dependencias y scripts.
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `OPENCODE.md`, `GEMINI.md`: documentación de uso.
- `doctor.mjs`: validación de setup.
- `scan.mjs`, `scan-ats-full.mjs`: escaneo de portales.
- `generate-pdf.mjs`, `generate-latex.mjs`, `build-cv-latex.mjs`: generación de CV/PDF/LaTeX.
- `merge-tracker.mjs`, `dedup-tracker.mjs`, `normalize-statuses.mjs`, `verify-pipeline.mjs`, `tracker.mjs`: gestión de tracker.
- `templates/`: `cv-template.html`, `cv-template.tex`, `cover-letter-template.html`, `portals.example.yml`, `states.yml`.
- `config/profile.example.yml`: plantilla de configuración de usuario.
- `data/`: tracker e inbox, incluido `data/applications.md`, `data/pipeline.md`, `data/scan-history.tsv`.
- `reports/`: informes generados por oferta.
- `batch/`: `batch-prompt.md`, `tracker-additions/`, `batch-runner.sh`.
- `providers/`: adaptadores ATS y plataformas de empleo.
- `modes/`: prompts de evaluación, aplicación, escaneo, PDF, entrevista y más, con locales `ar/`, `de/`, `fr/`, `ja/`, `pt/`, `ru/`, `tr/`, `ua/`.
- `.claude/skills/career-ops/`, `.opencode/skills/`, `.qwen/skills/`: integración de asistentes.

## 5. Flujo principal de funcionamiento

Hechos confirmados:
- El repositorio se usa con un AI CLI (Claude Code, OpenCode, Gemini, Qwen, Codex).
- El primer paso es ejecutar `node doctor.mjs --json` para comprobar el setup.
- Los usuarios deben tener `cv.md`, `config/profile.yml`, `modes/_profile.md` y `portals.yml`.
- El asistente interpreta prompts en `modes/` y probablemente lanza scripts Node para resultados.

Inferencia:
- El flujo principal es conversacional: el usuario abre el CLI y pide operaciones como `/career-ops`, `/career-ops scan`, `/career-ops oferta`.

## 6. Flujo de análisis de una oferta

Hechos confirmados:
- `modes/oferta.md` contiene el modo de evaluación de ofertas.
- `modes/_shared.md` comparte lógica entre modos.
- `modes/ofertas.md` compara múltiples ofertas.
- `check-liveness.mjs` y `liveness-core.mjs` verifican si una oferta sigue activa.
- `providers/` contiene adaptadores que probablemente extraen datos de sistemas como Greenhouse, Ashby o Lever.

Inferencia:
- El análisis incluye un scoring A-F, verificación de legitimidad y generación de un informe en `reports/`.
- La oferta se valida con datos de `cv.md`, perfil del usuario y la lógica del prompt.

## 7. Flujo de generación de CV, carta y PDF

Hechos confirmados:
- `generate-pdf.mjs` genera PDF mediante Playwright.
- `generate-latex.mjs` y `build-cv-latex.mjs` gestionan exportación LaTeX.
- `templates/cv-template.html` y `templates/cover-letter-template.html` son las plantillas HTML principales.
- `templates/cv-template.tex` es la plantilla LaTeX.
- `fonts/` alberga los recursos tipográficos.

Inferencia:
- El sistema adapta el CV desde `cv.md` a un documento HTML personalizado y luego lo renderiza con Playwright.
- La carta y el PDF se generan como artefactos derivados del mismo pipeline de plantillas.

## 8. Flujo del tracker de candidaturas

Hechos confirmados:
- `data/applications.md` es el tracker de candidaturas.
- `data/pipeline.md` mantiene URLs pendientes.
- `data/scan-history.tsv` deduplica escaneos.
- `batch/tracker-additions/` recibe entradas TSV temporales.
- `merge-tracker.mjs` integra adiciones al tracker.
- `dedup-tracker.mjs` elimina duplicados.
- `normalize-statuses.mjs` unifica los estados del tracker.
- `verify-pipeline.mjs` valida la integridad del flujo.
- `templates/states.yml` define estados canónicos.

Inferencia:
- El tracker es un sistema estricto de registros con adiciones controladas por lotes y revisión de integridad.

## 9. Integraciones con asistentes de IA

Hechos confirmados:
- `.claude/skills/career-ops/` para Claude Code.
- `.opencode/skills/` para OpenCode.
- `.qwen/skills/` para Qwen.
- `GEMINI.md` documenta soporte para Gemini CLI.
- `CLAUDE.md`, `OPENCODE.md`, `AGENTS.md` contienen reglas y guías de personalización.

Inferencia:
- La integración de Gemini existe en documentación, pero no se ve un directorio `.gemini/` presente.
- El proyecto espera que el asistente use el contenido de `modes/` para ejecutar acciones.

## 10. Dependencias y tecnologías utilizadas

Hechos confirmados:
- Node.js (JavaScript) es la base del proyecto.
- Go se usa para `dashboard/`.
- Dependencias declaradas en `package.json`:
  - `@google/generative-ai`
  - `dotenv`
  - `js-yaml`
  - `playwright@1.58.1`
- Tecnologías adicionales presentes:
  - Markdown, YAML, HTML/CSS, LaTeX.
  - Playwright para PDF y scraping.
- Scripts de mantenimiento y comandos disponibles en `package.json`.

## 11. Configuraciones específicas del autor original

Hechos confirmados:
- `package.json` atribuye el proyecto a Santiago Fernández de Valderrama.
- El README y `CLAUDE.md` enfatizan que el autor usó el sistema para evaluar 740+ ofertas y generar 100+ CVs.
- `AGENTS.md` define un contrato de datos entre capa de usuario y capa del sistema.
- El autor separa archivos de usuario (`cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`) de archivos de sistema (`modes/_shared.md`, prompts, scripts).

Inferencia:
- El diseño está muy orientado a personalizar por usuario y a mantener intacta la lógica central actualizable.

## 12. Componentes que parecen reutilizables

Inferencia basada en estructura:
- `generate-pdf.mjs` y `templates/cv-template.html`: generación de documentos reutilizable.
- `providers/`: adaptadores ATS podrían convertirse en una capa de extracción genérica.
- `modes/`: prompts y modos pueden reutilizarse como motores de interacción.
- `merge-tracker.mjs`, `dedup-tracker.mjs`, `normalize-statuses.mjs`: lógica de integridad de tracker reutilizable.
- `doctor.mjs`: validación de setup reusable.

## 13. Componentes que probablemente requieren reescritura

Inferencia:
- Integraciones de asistentes específicas (`.claude/`, `.opencode/`, `.qwen/`) necesitan abstracción para ser universales.
- `modes/` con múltiples archivos de prompt y locales puede ser difícil de mantener; requiere consolidación.
- Flujos de scraping y verificación basados en Playwright/MCP pueden necesitar capa de abstracción para otros entornos.
- `batch/` y el modelo de TSV para tracker-additions parecen muy acoplados a un proceso interno actual.

## 14. Riesgos técnicos para convertir el sistema en una herramienta universal

Inferencia:
- Alta dependencia de AI CLIs y de prompts específicos limita la portabilidad.
- Dependencia de Playwright + MCP para validación de ofertas complica la ejecución en entornos sin navegador.
- Mezcla de lógica de dominio (ofertas, CV, tracker) y orquestación conversacional puede hacer difícil desacoplar componentes.
- Ausencia de un backend/API central significa que el sistema está diseñado más como conjunto de scripts conversacionales que como plataforma universal.
- El soporte multilenguaje y multi-modo está disperso y puede generar inconsistencias.

## 15. Preguntas pendientes para la siguiente fase de auditoría

1. ¿Cuáles son los límites exactos de `.claude/skills/career-ops/`, `.opencode/skills/` y `.qwen/skills/`?
2. ¿Existe un archivo de comandos Gemini fuera del repositorio o se genera dinámicamente?
3. ¿Cómo se orquesta exactamente la ejecución de scripts desde los prompts de `modes/`?
4. ¿Qué información concreta contiene `config/profile.yml` y `modes/_profile.template.md` en el uso real?
5. ¿El dashboard Go es solo visualización o también actúa como backend?
6. ¿Hay tests automatizados para los flujos de oferta, CV y tracker?
7. ¿Qué partes del scraping de ofertas son específicas de ATS vs genéricas?

---

**Ruta del archivo creado:** `docs/redesign/AUDIT_00_REPOSITORY_MAP.md`

**Resumen breve:** Documento de auditoría inicial en español que describe la estructura, componentes, flujos y riesgos técnicos del repositorio `career-navigator`, distinguiendo hechos confirmados, inferencias y preguntas.

**Confirmación:** No se modificó ningún archivo existente, solo se creó el documento nuevo solicitado.
