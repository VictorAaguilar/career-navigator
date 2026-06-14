# AUDIT 01: Evaluación, asistentes y dashboard

## 1. Resumen ejecutivo

Hechos confirmados:
- La lógica de evaluación está principalmente en prompts, especialmente en `modes/oferta.md` y `modes/_shared.md`.
- Las integraciones de asistentes comparten instrucciones duplicadas en `.claude/skills/career-ops/SKILL.md`, `.opencode/skills/career-ops/SKILL.md` y `.qwen/skills/career-ops/SKILL.md`.
- Codex está presente solo como referencia documental; no existe una carpeta `.codex/` ni un `SKILL.md` específico para Codex en el repositorio.
- El dashboard es una aplicación TUI escrita en Go (`dashboard/main.go`) usando Bubble Tea, no una aplicación web.

Inferencias:
- El proyecto depende de la inteligencia del modelo para adjudicar scores y recomendaciones más que de un motor de scoring determinista.
- La lógica de asistentes está duplicada por portabilidad, no por necesidad de comportamiento distinto.

Decisiones provisionales:
- Este informe considera el dashboard como opción avanzada, no como la interfaz principal para usuarios no técnicos.

## 2. Alcance de la auditoría

Se revisaron estos archivos y carpetas:
- `modes/oferta.md`
- `modes/ofertas.md`
- `modes/_shared.md`
- `.claude/skills/career-ops/`
- `.opencode/skills/` 
- `.qwen/skills/`
- `AGENTS.md`
- `CLAUDE.md`
- `OPENCODE.md`
- `GEMINI.md`
- `gemini-eval.mjs`
- `dashboard/`
- `data/applications.md`
- `data/pipeline.md`
- scripts relacionados con el tracker (`merge-tracker.mjs`, `dedup-tracker.mjs`, `normalize-statuses.mjs`, `verify-pipeline.mjs`)

## 3. Lógica de evaluación individual

Hechos confirmados:
- La evaluación individual sigue 7 bloques en `modes/oferta.md` y `modes/_shared.md`:
  - A: Role Summary
  - B: Match with CV
  - C: Level and Strategy
  - D: Comp and Demand
  - E: Customization Plan
  - F: Interview Plan
  - G: Posting Legitimacy
- El sistema de scoring individual es de 1 a 5, definido en `modes/_shared.md`.
- Umbrales de recomendación en `modes/_shared.md`:
  - 4.5+ → aplicar inmediatamente
  - 4.0-4.4 → buen encaje, vale la pena aplicar
  - 3.5-3.9 → decente, aplicar solo si hay razón específica
  - < 3.5 → recomendar no aplicar
- El bloque G es separable del score numérico y sirve como evaluación de legitimidad de la publicación.
- Las reglas éticas principales están en `modes/_shared.md`: no inventar experiencia, no enviar aplicaciones sin revisión, siempre usar tracker, no modificar `cv.md`, etc.
- El uso de arquetipos está definido en `modes/_shared.md`: 6 arquetipos de oferta que guían la priorización de pruebas y la redacción.

Qué está en prompts y qué en scripts:
- Prompts: definición de bloques A-G, criterios de evaluación, umbrales, ética, arquetipos, recomendaciones de redacción y output.
- Scripts: no hay motor de scoring matemático explícito para la evaluación individual; los scripts apoyan en validaciones de setup (`doctor.mjs`) y generación de artefactos, pero la decisión del score en sí depende de prompts.

Inferencias:
- El cálculo real del score 1-5 es una mezcla de instrucción en prompt y razonamiento del modelo, no una fórmula independiente.
- El bloque de legitimidad G está diseñado como una evaluación cualitativa separada, no como parte del score numérico.

## 4. Comparación de múltiples ofertas

Hechos confirmados:
- `modes/ofertas.md` define una matriz de comparación con 10 dimensiones y sus pesos:
  - North Star alignment: 25 %
  - CV match: 15 %
  - Level: 15 %
  - Estimated compensation: 10 %
  - Growth trajectory: 10 %
  - Remote quality: 5 %
  - Company reputation: 5 %
  - Tech stack modernity: 5 %
  - Time-to-offer speed: 5 %
  - Cultural signals: 5 %
- `modes/ofertas.md` está claramente orientado a ranking y comparación cuantitativa entre múltiples ofertas.

Diferencias clave:
- `modes/oferta.md`: evaluación cualitativa de una sola oferta con bloques A-G y un score 1-5.
- `modes/ofertas.md`: comparación de múltiples ofertas con dimensiones y pesos explícitos.
- `modes/_shared.md`: contiene reglas generales, ética, scoring global 1-5 y lógica de legitimidad; sirve como base común para ambos modos.

Inferencias:
- `modes/_shared.md` actúa como la capa de política y reglas compartidas, mientras que `modes/oferta.md` y `modes/ofertas.md` son modos de uso específicos.

## 5. Limitaciones del sistema de scoring actual

Hechos confirmados e inferencias:
- Dependencia del razonamiento del modelo: los scores están definidos en prompts, no en un motor independiente reproducible.
- Ausencia de un motor de puntuación independiente: no hay un algoritmo matemático centralizado en código que calcule el score 1-5 para la evaluación individual.
- Dificultad para reproducir el mismo resultado: distintos asistentes o distintas ejecuciones pueden producir variaciones aunque el prompt sea igual.
- Posibilidad de respuestas diferentes entre asistentes: la lógica de prompts es compartida, pero cada plataforma puede interpretar y ejecutar las instrucciones de manera distinta.
- Pesos específicos del perfil original: el sistema prioriza arquetipos, ética y reglas del autor documentadas en `modes/_shared.md` y `AGENTS.md`.
- Falta de trazabilidad automática requisito-evidencia: la evaluación describe correspondencias entre JD y CV, pero no hay un sistema automatizado que estructure esa trazabilidad como datos vinculados.

## 6. Integraciones con asistentes

### Claude

Hechos confirmados:
- Archivo principal: `.claude/skills/career-ops/SKILL.md`.
- El router determina modos y carga `modes/_shared.md` + `modes/{mode}.md` para muchos modos.
- Usa el mismo prompt de contenido compartido que OpenCode y Qwen.
- Lógica específica: ninguna evidente en el `SKILL.md`, es un enrutador común.

### OpenCode

Hechos confirmados:
- Archivo principal: `.opencode/skills/career-ops/SKILL.md`.
- Contenido casi idéntico al de Claude.
- `OPENCODE.md` es un wrapper que importa `AGENTS.md`.
- Lógica específica: ninguna notable en el prompt; se usa para que OpenCode cargue las mismas instrucciones.

### Qwen

Hechos confirmados:
- Archivo principal: `.qwen/skills/career-ops/SKILL.md`.
- Contenido casi idéntico a Claude/OpenCode.
- Lógica específica: ninguna en el repo; comparte el mismo enrutamiento y reglas.

### Gemini

Hechos confirmados:
- `GEMINI.md` importa `AGENTS.md` y no agrega lógica propia.
- `gemini-eval.mjs` es una integración real de evaluación con API de Gemini.
- No se halló `.gemini/` en el repositorio actual.
- `CLAUDE.md` documenta el soporte para Gemini y menciona `.gemini/commands/*.toml`, pero no hay esos archivos en el workspace inspeccionado.

### Codex

Hechos confirmados:
- Codex aparece en documentación (`README.md`, `AGENTS.md`, etc.).
- No existe carpeta `.codex/` en el repositorio.
- No hay `SKILL.md` específico para Codex.
- El soporte actual parece depender de `AGENTS.md` y de la capacidad general de cualquier asistente para leer el repositorio.

Duplicación de instrucciones:
- `.claude/skills/career-ops/SKILL.md`, `.opencode/skills/career-ops/SKILL.md` y `.qwen/skills/career-ops/SKILL.md` replican el mismo router y reglas.
- `AGENTS.md`, `CLAUDE.md`, `OPENCODE.md`, `GEMINI.md` comparten contenido, con `OPENCODE.md` y `GEMINI.md` delegando al mismo documento base.

Nivel real de integración:
- Claude/OpenCode/Qwen: integración de skill presente y real en el repo.
- Gemini: integración parcial con `gemini-eval.mjs` y documentación; falta evidencia de comandos nativos `.gemini/`.
- Codex: soporte declarativo/documental, no integración de carpeta o skill específica.

## 7. Situación específica de Codex

Hechos confirmados:
- Codex es mencionado en documentación en `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/SETUP.md`.
- No existe una carpeta `.codex/` en la raíz del repositorio.
- No hay un `SKILL.md` específico para Codex ni archivos de comandos dedicados.
- El soporte actual parece depender de las instrucciones generales de `AGENTS.md` y de la expectativa de que Codex pueda leer el repositorio como un agente genérico.

No se afirma que Codex esté completamente integrado; la evidencia indica que su soporte es más documental que técnico.

## 8. Arquitectura del dashboard

Hechos confirmados:
- El dashboard es una TUI construida con Go y Bubble Tea (`github.com/charmbracelet/bubbletea`).
- Punto de entrada: `dashboard/main.go`.
- Archivos principales:
  - `dashboard/main.go`
  - `dashboard/internal/data/career.go`
  - `dashboard/internal/model/career.go`
  - `dashboard/internal/ui/screens/pipeline.go`
  - `dashboard/internal/ui/screens/viewer.go` (implícito por la estructura, aunque no leído completo)
  - `dashboard/internal/theme`
- Lee `data/applications.md` desde la raíz o `data/applications.md`.
- Enriquecer datos con reportes: `LoadReportSummary` extrae campos de `reports/{...}.md`.
- Enriquecer datos con archivos batch: `batch/batch-input.tsv`, `batch/batch-state.tsv` y `data/scan-history.tsv`.
- Actualiza estados de candidaturas con `UpdateApplicationStatus`, que reescribe `applications.md` o `data/applications.md`.

Inferencias:
- El dashboard no actúa como fuente de verdad para pipeline pendiente; su foco es el tracker y el estado de aplicaciones.

## 9. Relación entre dashboard, tracker y pipeline

Hechos confirmados:
- `data/applications.md`: tracker principal de candidaturas.
- `data/pipeline.md`: lista de ofertas pendientes para procesar.
- `reports/`: informes de evaluación generados por la herramienta.
- `tracker*.mjs`: scripts de mantenimiento, normalización y deduplicación (`merge-tracker.mjs`, `dedup-tracker.mjs`, `normalize-statuses.mjs`, `verify-pipeline.mjs`).
- `dashboard`: interfaz TUI de visualización y cambio de estados basada en el tracker.

Diferencias claras:
- `data/applications.md` es el registro de aplicaciones evaluadas.
- `data/pipeline.md` es un inbox de URLs aún no procesadas.
- `reports/` contiene el detalle de cada evaluación.
- Los scripts `tracker*.mjs` mantienen la integridad del tracker pero no son la UI.
- El dashboard complementa al tracker ofreciendo vista, filtros y edición de estado, pero no reemplaza los scripts de mantenimiento.

## 10. Limitaciones para usuarios no técnicos

Hechos confirmados e inferencias:
- Dependencia de terminal: `dashboard` es una TUI que requiere terminal.
- Navegación por teclado: Bubble Tea y el código de `pipeline.go` muestran navegación con teclas `j/k`, `enter`, `q`, `s`, `f`, etc.
- Necesidad de conocer archivos Markdown/YAML para editar `data/applications.md`, `data/pipeline.md`, `config/profile.yml` y `modes/_profile.md`.
- Ausencia de formularios guiados o asistentes visuales directos en el repositorio.
- Ausencia de interfaz web en `dashboard/`; no hay servidor HTTP ni frontend web evidenciado.
- Dificultad para comprender errores y estados internos porque el tracker y los scripts requieren conocimiento de formatos específicos y estados canónicos.

## 11. Componentes reutilizables

Potencialmente reutilizables:
- Estructura de modos (`modes/` con `oferta.md`, `ofertas.md`, `_shared.md` y otros modos).
- Reglas de ética y políticas compartidas en `modes/_shared.md` y `AGENTS.md`.
- Plantillas de documento en `templates/` (`cv-template.html`, `cv-template.tex`, `cover-letter-template.html`).
- Lógica de verificación de ofertas en `check-liveness.mjs` / `liveness-core.mjs`.
- Proveedores ATS en `providers/`.
- Generación de PDF con `generate-pdf.mjs` + Playwright.
- Scripts de tracker (`merge-tracker.mjs`, `dedup-tracker.mjs`, `normalize-statuses.mjs`, `verify-pipeline.mjs`).
- Parser de dashboard en `dashboard/internal/data` y `dashboard/internal/model`.

## 12. Componentes que requieren reescritura

Probablemente necesitan reescritura:
- Motor de scoring: el sistema actual se basa en prompts y no en cálculo reproducible.
- Modelo de perfil: personalización del usuario está dispersa entre `config/profile.yml`, `modes/_profile.md`, `cv.md` y `article-digest.md`.
- Adaptadores de asistentes: `.claude/`, `.opencode/`, `.qwen/` y la ausencia de `.codex/` apuntan a reescritura para un adaptador común.
- Integración específica de Codex: debe ser añadida si se quiere soporte real.
- Onboarding: `doctor.mjs` y los archivos de configuración son útiles, pero el flujo no está desacoplado de las instrucciones de prompt.
- Interfaz de usuario: el dashboard TUI es avanzado pero insuficiente para usuarios no técnicos; se necesitaría una UI más amigable.
- Relación requisito-evidencia: falta un modelo estructurado que vincule JD, requerimiento, evidencia de CV y score.
- Configuración de pesos: los pesos están fijados en prompts y no son fácilmente parametrizables en un motor común.

## 13. Decisiones preliminares

Decisiones provisionales:
1. Separar la lógica de evaluación de los prompts.
2. Crear un modelo de datos universal.
3. Crear un motor de scoring reproducible.
4. Crear adaptadores para cada asistente.
5. Añadir una integración propia para Codex.
6. Mantener la TUI como opción avanzada.
7. Diseñar posteriormente una interfaz más amigable.
8. Mantener siempre revisión humana antes de enviar candidaturas.

Aclara:
- Estas decisiones son provisionales y no constituyen la arquitectura definitiva.
- Se basan en los límites observados en los archivos revisados.

## 14. Preguntas pendientes

- ¿Dónde están los archivos `.gemini/commands/*.toml` si el README los menciona?
- ¿Existe un flujo real de ejecución de prompts fuera de los SKILL.md que no está en el repo?
- ¿La lógica de `gemini-eval.mjs` se considera parte del soporte Gemini oficial o una herramienta auxiliar?
- ¿Qué mecanismo usa el sistema para mantener actualizado `modes/_profile.md` cuando el usuario personaliza su perfil?
- ¿Hay tests automatizados que validen la consistencia de `modes/oferta.md` y `modes/ofertas.md` entre asistentes?
- ¿Se planea abstraer `providers/` como una API externa o mantenerlos como adaptadores embebidos?
- ¿El dashboard está pensado para usuarios finales o solo para el equipo técnico de mantenimiento?

---

Ruta del archivo creado: `docs/redesign/AUDIT_01_SCORING_ASSISTANTS_DASHBOARD.md`
