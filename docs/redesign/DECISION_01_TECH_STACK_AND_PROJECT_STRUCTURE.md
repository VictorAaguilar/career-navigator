# DECISION 01: Stack tecnológico y estructura del proyecto

## 1. Contexto

El proyecto original de Career-Ops es principalmente Node.js, con numerosos scripts `.mjs` en la raíz y en `providers/`. El `package.json` actual define dependencias Node clave como `@google/generative-ai`, `dotenv`, `js-yaml` y `playwright@1.58.1`. Playwright ya es una parte establecida del proyecto para generación de PDF y scraping. El dashboard existente está desarrollado en Go y es una TUI independiente en `dashboard/`.

El nuevo núcleo debe ser reproducible, testeable y desacoplado de los prompts. Codex será el primer adaptador del MVP, pero el diseño no debe quedar bloqueado en un solo asistente.

## 2. Requisitos técnicos del MVP

- Ejecución local en la máquina del usuario.
- Soporte explícito para Windows, macOS y Linux.
- Tipado estático o validación de datos robusta.
- Lectura y escritura de YAML, JSON y Markdown.
- Generación de PDF.
- CLI sencilla y accesible.
- Pruebas automatizadas desde el principio.
- Arquitectura modular y con fronteras claras.
- Bajo coste de instalación y dependencias manejables.
- Compatibilidad progresiva con el proyecto original.
- Facilidad para contribuir y entender el código.
- Privacidad local como prioridad.

## 3. Alternativas evaluadas

### Opción A: Node.js + JavaScript moderno

- Compatibilidad con Career-Ops: alta, porque el repositorio actual ya usa Node y `.mjs`.
- Curva de aprendizaje: baja para desarrolladores JavaScript.
- Tipado: nativo débil; requiere validación con librerías externas.
- Validación de esquemas: buena con Ajv, Zod, etc.
- Testing: maduro con Jest, Vitest, AVA.
- CLI: buena con Commander, Yargs.
- PDF: compatible con Playwright ya existente.
- Mantenimiento: razonable, pero con riesgo de errores de tipo.
- Portabilidad: alta en los tres OS.
- Integración con asistentes: alta, Node es estándar para adaptadores de LLM.
- Riesgo de migración: bajo a medio, buena reutilización de scripts.
- Interfaz local futura: viable, pero se beneficiaría de tipado más fuerte.

### Opción B: Node.js + TypeScript

- Compatibilidad con Career-Ops: alta, puede reutilizar los mismos scripts y módulos con migración gradual.
- Curva de aprendizaje: moderada, pero ampliamente aceptada.
- Tipado: fuerte, tráfico de datos más seguro.
- Validación de esquemas: excelente con Zod, TypeBox, Ajv.
- Testing: excelente, con soporte de Vitest/Jest y tipos en las pruebas.
- CLI: buena y más robusta con tipado.
- PDF: compatible con Playwright.
- Mantenimiento: superior a JS puro gracias a tipos.
- Portabilidad: alta.
- Integración con asistentes: alta.
- Riesgo de migración: bajo, aunque se requiere configuración TS y posible refactor.
- Interfaz local futura: buena base, más fácil escalar.

### Opción C: Python

- Compatibilidad con Career-Ops: baja, requiere reescritura significativa de scripts existentes.
- Curva de aprendizaje: buena para muchos desarrolladores, pero no para los que ya conocen Node.
- Tipado: mejorable con `typing`, pero no tan integrado como TypeScript.
- Validación de esquemas: buena con Pydantic, Marshmallow.
- Testing: excelente con pytest.
- CLI: buena con Click, Typer.
- PDF: viable, pero Playwright en Python añade complejidad diferente.
- Mantenimiento: alto si el equipo domina Python, pero fragmenta el stack.
- Portabilidad: alta en los tres OS.
- Integración con asistentes: posible, pero la base actual Node se pierde.
- Riesgo de migración: alto, porque no es compatible con los scripts `.mjs` existentes.
- Interfaz local futura: viable, pero no aprovecha el proyecto actual.

### Opción D: Arquitectura híbrida Node.js + Python

- Compatibilidad con Career-Ops: media, mezcla los dos mundos.
- Curva de aprendizaje: alta para el equipo, más complejo.
- Tipado: bueno en ambos si se usa TS y Pydantic.
- Validación de esquemas: buena, pero con dos implementaciones.
- Testing: duplicado de esfuerzos en dos ecosistemas.
- CLI: viable, pero más complejo de orquestar.
- PDF: posible con Playwright desde Node o Python.
- Mantenimiento: más costoso por dual stack.
- Portabilidad: buena, pero hay más piezas.
- Integración con asistentes: posible en ambos ecosistemas.
- Riesgo de migración: alto, porque convive con dos stacks.
- Interfaz local futura: factible, pero requiere integración extra.

### Opción E: Mantener Go para el núcleo

- Compatibilidad con Career-Ops: baja, ya que la mayor parte es Node.js.
- Curva de aprendizaje: moderada para Go, pero menos común en este repositorio.
- Tipado: fuerte y seguro.
- Validación de esquemas: aceptable con Go structs y librerías como `go-playground/validator`.
- Testing: muy bueno en Go.
- CLI: bueno con Cobra, pero requeriría reescribir todo el núcleo.
- PDF: complejo; Playwright es compatible, pero el ecosistema PDF en Go es menos directo.
- Mantenimiento: bueno si el equipo domina Go, pero no aprovecha la base actual.
- Portabilidad: alta.
- Integración con asistentes: posible, pero no habitual para LLM adaptadores.
- Riesgo de migración: alto, debido a la reescritura masiva.
- Interfaz local futura: viable, pero necesitaría más trabajo en marcos web/JS.

## 4. Matriz comparativa

| Opción | Reutilización existente | Seguridad de tipos | Facilidad de instalación | Capacidad de pruebas | Mantenibilidad | Velocidad de desarrollo | Compatibilidad con Playwright | Compatibilidad multiplataforma | Integración con Codex | Escalabilidad |
|---|---|---|---|---|---|---|---|---|---|---|
| A Node.js + JS | 5 | 2 | 5 | 4 | 3 | 4 | 5 | 5 | 5 | 4 |
| B Node.js + TS | 5 | 4 | 4 | 5 | 5 | 4 | 5 | 5 | 5 | 5 |
| C Python | 2 | 3 | 4 | 5 | 3 | 3 | 4 | 5 | 3 | 4 |
| D Node.js + Python | 3 | 4 | 2 | 4 | 2 | 2 | 4 | 4 | 4 | 4 |
| E Go | 2 | 5 | 3 | 4 | 4 | 3 | 4 | 5 | 3 | 4 |

Justificación rápida:
- Reutilización existente: Node obtiene la máxima puntuación porque el repositorio actual es ya Node/`.mjs`.
- Seguridad de tipos: TypeScript y Go destacan por tipado fuerte; JavaScript puro queda detrás.
- Facilidad de instalación: Node.js y Python son comparables, pero un solo stack es más simple.
- Capacidad de pruebas: Node y Python son maduros; TypeScript suma tipos.
- Mantenibilidad: TypeScript gana por claridad de datos, Go por seguridad de tipos.
- Velocidad de desarrollo: JS/TS permite iterar rápido sin reescritura masiva.
- Compatibilidad con Playwright: Node es ideal, Python soporta Playwright pero el proyecto ya usa Node.
- Compatibilidad multiplataforma: todas son buenas, pero un solo ecosistema reduce fricción.
- Integración con Codex: Node es natural para adaptadores basados en prompts y CLI.
- Escalabilidad: TypeScript ofrece mayor confianza estructural para crecer.

## 5. Recomendación

Opción principal recomendada: **Node.js + TypeScript**.

Razones:
- Reutilización progresiva del código y scripts actuales.
- Mejora de tipado y validación sin forzar un stack completamente nuevo.
- Reducción de duplicación mediante esquemas y fronteras claras.
- Facilita la contribución para desarrolladores JS/TS.
- Permite migrar gradualmente los `.mjs` existentes.
- Soporta bien Playwright y la generación de PDF.
- Es adecuado para construir un motor de scoring reproducible, porque los tipos ayudan a definir el modelo de datos.

No se elige sólo por popularidad; se elige porque maximiza compatibilidad con el proyecto original, soporta el nuevo núcleo independiente y mantiene un camino de migración manejable.

## 6. Lenguaje y runtime

- Lenguaje provisional: TypeScript.
- Versión mínima de Node.js: 18.x, idealmente 20.x.
- Runtime: Node.js con módulos ECMAScript (ESM).
- Formato de módulos: `import`/`export` ESM.
- Gestor de paquetes: `npm` por compatibilidad con el repositorio actual; `pnpm` o `yarn` son opcionales.
- Estrategia de compatibilidad con scripts `.mjs`: mantener el soporte ESM y permitir una migración incremental de `.mjs` a `.ts` o a compilado JS, conservando scripts existentes en package.json como wrappers temporales.

## 7. Librerías o categorías necesarias

Dependencias necesarias para el MVP:
- Validación de esquemas: `zod` o `ajv`.
- YAML: `js-yaml` (ya usada en el proyecto).
- CLI: `commander`, `yargs` o `@oclif/core`.
- Testing: `vitest` o `jest`.
- Markdown: `remark`, `markdown-it` o `unified`.
- PDF: `playwright` como dependencia existente y preferida.
- Configuración: `dotenv` y lectura de YAML.
- Almacenamiento local: `fs/promises` nativo, opcional `fs-extra`.
- Logging: `pino` o un wrapper ligero de consola.

Dependencias opcionales:
- Validación de datos extendida: `superstruct`.
- Markdown avanzado: `remark-preset-lint`.
- CLI interactiva: `enquirer`.
- Parsing de CV adicional: `unified` plugins específicos.

Dependencias heredadas:
- `@google/generative-ai` para integraciones basadas en LLM, si se conserva.
- `playwright` para generación de PDF.
- `js-yaml` como ya existe.

## 8. Estructura inicial propuesta

- `src/`
  - `core/`
    - `profile/` — lógica del perfil universal.
    - `evidence/` — modelo y gestión de evidencia.
    - `jobs/` — modelo de ofertas y normalización.
    - `requirements/` — clasificación de requisitos.
    - `matching/` — emparejamiento requisito-evidencia.
    - `scoring/` — motor de scoring reproducible.
    - `recommendations/` — generación de recomendaciones estructuradas.
    - `applications/` — tracker y estado de candidaturas.
  - `schemas/` — definiciones de datos y validaciones compartidas.
  - `services/` — orquestadores que conectan core con infraestructuras.
  - `adapters/`
    - `codex/` — adaptador inicial para Codex.
    - `legacy/` — compatibilidad con scripts y formatos antiguos.
  - `interfaces/`
    - `cli/` — comandos y flujos de usuario.
  - `infrastructure/`
    - `storage/` — lectura/escritura de disco.
    - `config/` — carga de configuración.
    - `logging/` — logging e instrumentación.
- `tests/`
  - `unit/`
  - `integration/`
  - `fixtures/`
- `config/`
- `data/`
- `templates/`
- `docs/`

Responsabilidades:
- `core/`: lógica de negocio pura.
- `schemas/`: contratos de datos y validaciones.
- `services/`: casos de uso y orquestación.
- `adapters/`: conectores de asistentes y compatibilidad.
- `interfaces/`: experiencia de usuario final.
- `infrastructure/`: implementación concreta de I/O.

## 9. Límites entre módulos

Regla propuesta:
- `interfaces` y `adapters` pueden importar de `services`.
- `services` puede importar de `core` y `schemas`.
- `core` puede importar de `schemas`.
- `infrastructure` implementa contratos usados por `services` y `adapters`, pero `core` no depende de `infrastructure`.

Diagrama conceptual:

```
interfaces/adapters
        ↓
     services
        ↓
       core
        ↓
     schemas
```

- `core` es independiente y no debe conocer almacenamiento, CLI o adaptadores.
- `services` actúa como capa de aplicación que conecta el núcleo con la infraestructura.
- `adapters` traducen entre asistentes y `services`.
- `infrastructure` implementa lectura de archivos, config y logging, sin invadir `core`.

## 10. Estrategia de migración

- Mantener los scripts `.mjs` originales como wrappers y legacy mientras el nuevo núcleo se construye.
- Introducir `adapters/legacy/` que lean formatos antiguos (`cv.md`, `config/profile.yml`, `data/applications.md`).
- Ofrecer importadores que conviertan guiones actuales en el nuevo modelo interno.
- Reutilizar `generate-pdf.mjs` y las plantillas existentes en una capa heredada hasta que el nuevo generador sea estable.
- Conservar el tracker existente con una capa de compatibilidad que permita la coexistencia de `data/applications.md` antiguo y un formato nuevo si se decide.
- No reescribir todo de una vez; migrar por fases: primero datos/formatos, luego motor, luego CLI y adaptadores.

## 11. Estrategia de pruebas

- Pruebas unitarias del scoring: verificar cálculos reproducibles y condiciones de borde.
- Pruebas de validación de esquemas: asegurar que `profile`, `job`, `evidence` y `application` son válidos.
- Pruebas requisito-evidencia: validar matching y detección de carencias.
- Pruebas de importación: cargar CVs, perfiles y ofertas en estructuras internas.
- Pruebas de compatibilidad: asegurar que los datos heredados de Career-Ops se pueden convertir.
- Fixtures de perfiles y ofertas: ejemplos reales de casos de uso.
- Pruebas que garanticen que no se inventa experiencia: verificar que las recomendaciones sólo usan evidencia disponible.

## 12. Configuración del usuario

Propuesta de separación:
- Configuración pública de ejemplo: `config/profile.example.yml` y `config/*.example.yml`.
- Datos personales: `config/profile.yml`, `cv.md` o archivos de perfil locales.
- Secretos: `.env` o `config/.env` para claves de API y credenciales.
- Datos generados: `data/`, `output/`, `reports/`, `batch/`.
- Archivos para `.gitignore`: `config/profile.yml`, `.env`, `data/*` generado, `output/*`, `reports/*`, `batch/*`.

## 13. Compatibilidad con Codex

Conceptualmente:
- Qué deberá leer Codex: la documentación de los comandos, el esquema de entrada/salida y los ejemplos de forma estructurada.
- Qué comandos podrá ejecutar: análisis de oferta, adaptación de CV, resumen de perfil, exportación de PDF.
- Qué salidas debe producir: JSON estructurado y texto complementario, no solo texto libre.
- Qué lógica nunca debe residir únicamente en el prompt: scoring, matching requisito-evidencia, validación de datos y decisiones críticas.
- Cómo comprobar que el adaptador usa el núcleo real: el adaptador Codex debe delegar en el motor `core` y comparar resultados con casos de prueba automatizados, no calcular el score por sí mismo en el prompt.

## 14. Decisiones provisionales

- Recomendación provisional: implementar el MVP en Node.js + TypeScript.
- Propuesta provisional: usar ESM y `npm`.
- Propuesta provisional: conservar Playwright para PDF y `js-yaml` para YAML.
- Propuesta provisional: mantener los scripts `.mjs` como wrappers durante la migración.
- Propuesta provisional: CLI sencilla como MVP principal.

Estas decisiones deben validarse con prototipos y pruebas antes de implementar.

## 15. Decisiones abiertas

- ¿Debe la primera iteración incluir un formato JSON/estructurado para `reports/`?
- ¿Qué nivel de compatibilidad con el dashboard Go es necesario si no se usa en el MVP?
- ¿Hasta qué punto el adaptador Codex debe soportar sesiones conversacionales frente a comandos unitarios?
- ¿Debería el nuevo tracker conservar exactamente `data/applications.md` o migrar a un formato más estructurado?
- ¿Qué estrategia de migración se usa para `modes/_shared.md` y `modes/oferta.md`?
- ¿Es suficiente TypeScript para la validación o se requiere Pydantic-like schema runtime adicional?

## 16. Primer incremento de implementación

Candidatos:
- esquemas de perfil;
- modelo de evidencia;
- modelo de oferta;
- motor de scoring;
- CLI;
- adaptador Codex.

Recomendación: comenzar por **esquemas de perfil, evidencia y oferta** junto con los importadores/normalizadores básicos.

¿Por qué?
- Son una base mínima y verificable.
- Permiten construir el núcleo de datos sin depender de la interfaz.
- Son necesarios antes de un motor de scoring.
- Hacen posible validar compatibilidad con los datos existentes y los formatos heredados.
- Permiten crear pruebas iniciales de importación y validación sin construir aún la CLI ni el adaptador.

Primer incremento recomendado:
- Definir `schemas/` y `core/` para `profile`, `evidence` y `job`.
- Implementar un importador de `cv.md`/`config/profile.yml` heredado para el nuevo esquema.
- Escribir pruebas unitarias de validación y fixtures.

Esto deja el scoring y la CLI para el siguiente incremento, con una base de datos de entrada ya estable.
