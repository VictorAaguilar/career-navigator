# Implementation 13 - Tailoring UI Shell

## Purpose

This increment adds the first web interface foundation for the CV Tailoring Agent. It creates a React and TypeScript shell that lets a person move through the future tailoring workflow without running the real pipeline yet.

The shell is intentionally visual and non-functional: it contains navigation, stage placeholders, accessibility basics, responsive layout, and tests for the workflow contracts.

## Architecture

The web app lives in a separate npm workspace:

```text
apps/web
```

The root project remains the Node-oriented domain and CLI workspace. The web app has its own TypeScript configuration with DOM libraries, so the root `tsconfig.json` does not need to include browser-specific settings.

The intended future layout is:

```text
apps/web
apps/api
src/core
src/schemas
```

Only `apps/web` is created in this increment.

## Why A Separate Workspace

The existing project combines Node CLI scripts, a TypeScript domain core, and a Go TUI dashboard. A separate workspace keeps the browser app isolated from Node-only scripts and avoids mixing DOM settings into the root TypeScript configuration.

It also prepares a clean path for a future `apps/api` Node backend that can own LLM calls, DOCX generation, file parsing, API keys, and security boundaries.

## Workflow Stages

The shell defines exactly nine stages in canonical order:

1. `start`
2. `resume`
3. `job`
4. `analysis`
5. `requirements`
6. `proposals`
7. `review`
8. `preview`
9. `download`

The visible stage labels and titles are:

1. Inicio - Comienza una nueva adaptación
2. Currículum - Introduce tu experiencia profesional
3. Oferta - Añade la oferta laboral objetivo
4. Análisis - Analiza requisitos y compatibilidad
5. Evidencias - Revisa requisitos y evidencias encontradas
6. Propuestas - Compara las mejoras sugeridas
7. Revisión - Aprueba, rechaza o edita cada propuesta
8. Vista previa - Revisa el currículum adaptado
9. Descargar - Genera y descarga el documento DOCX

Each stage has:

- `id`
- `shortLabel`
- `title`
- `description`
- `position`

The stage data is deeply readonly in TypeScript and deeply frozen at runtime. It does not contain timestamps, random IDs, generated IDs, user data, or pipeline data.

## Navigation

Pure helpers live in:

```text
apps/web/src/app/workflow-navigation.ts
```

They expose:

- `getWorkflowStage(stageId)`
- `getWorkflowStageIndex(stageId)`
- `getPreviousWorkflowStage(stageId)`
- `getNextWorkflowStage(stageId)`
- `canNavigateBackward(stageId)`
- `canNavigateForward(stageId)`

Invalid runtime IDs throw the stable error:

```text
WORKFLOW_STAGE_NOT_FOUND
```

The shell buttons move exactly one step at a time. `Anterior` is disabled on `start`, and `Continuar` is disabled on `download`. The stepper is informational in this increment and does not support direct jumping.

## Ephemeral State

`App` stores only the current stage ID. Reloading the page returns to `Inicio`.

The shell does not store:

- CV content
- job offer text
- evidence
- proposals
- decisions
- Base64
- personal data
- session data

It does not use `localStorage`, `sessionStorage`, cookies, IndexedDB, query parameters, backend calls, or persistence.

## Privacy

The UI displays:

```text
Tus datos no se almacenan en esta versión.
```

Each placeholder also explains what will happen later and how the future data should remain private. No real CV, offer, evidence, generated text, provider metadata, IDs, API keys, or DOCX content is present.

## Accessibility

The shell uses semantic elements:

- `header`
- `nav`
- `main`
- `section`
- `footer`

The current step uses:

```text
aria-current="step"
```

Progress is visible as `Paso X de 9` and sits in a polite live region. Buttons are real buttons with clear disabled states and `focus-visible` styling.

## Responsive Design

Desktop layout uses a lateral stepper and a main stage panel. Mobile layout switches the stepper to a horizontal compact navigation area and stacks the content.

The CSS uses:

- CSS variables
- system fonts
- sufficient contrast
- responsive breakpoints
- `prefers-reduced-motion`
- no external images
- no external fonts
- no CSS framework

## Components

The shell components are:

- `AppHeader`
- `WorkflowStepper`
- `WorkflowNavigation`
- `StagePlaceholder`

The app separates:

- stage contracts
- pure navigation logic
- visual components

## Scripts

Root scripts:

```bash
npm.cmd run web:dev
npm.cmd run web:build
npm.cmd run web:typecheck
```

Workspace scripts:

```bash
npm.cmd run dev --workspace @career-navigator/web
npm.cmd run build --workspace @career-navigator/web
npm.cmd run typecheck --workspace @career-navigator/web
npm.cmd run preview --workspace @career-navigator/web
```

## Tests

The root Vitest suite includes:

```text
tests/unit/tailoring-ui-shell.test.ts
```

It covers:

- exact stage count and order
- unique IDs
- unique positions
- positions `1..9`
- non-empty visible text
- runtime freezing
- stage lookup
- invalid ID behavior
- first and last boundary behavior
- next and previous navigation
- forward/backward availability
- no mutation of the stage constant
- complete forward and reverse navigation
- absence of Date, random, UUID, network APIs, and locale comparison in navigation logic
- static rendering of `App` with `react-dom/server`

No `jsdom`, Testing Library, CSS framework, icon library, or browser automation dependency is added.

## Limitations

This increment does not include:

- real CV input
- real job offer input
- file upload
- parsing
- matching
- scoring
- tailoring pipeline orchestration
- backend/API
- LLM calls
- API keys
- persistence
- DOCX generation from the UI
- download behavior
- analytics
- authentication

## Next Increments

Recommended next steps:

1. Add UI session contracts without persistence.
2. Add text-only CV and job offer input screens.
3. Add a deterministic demo orchestrator with synthetic data.
4. Add matching and scoring views.
5. Add proposal review and explicit decisions.
6. Add ResumeExportModel preview.
7. Add Node API integration for DOCX generation and download.
8. Add provider-backed generation behind a backend boundary.
9. Add DOCX/PDF parsers outside the initial UI MVP.
