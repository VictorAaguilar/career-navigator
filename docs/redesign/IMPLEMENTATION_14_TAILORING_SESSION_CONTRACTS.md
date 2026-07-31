# Implementation 14 - Tailoring Session Contracts

## Purpose

This increment adds a deterministic, ephemeral TailoringSession contract for the web shell. The session represents only where the person is inside the nine-stage workflow.

It does not store CV content, job offer content, files, evidence, matching, scoring, proposals, decisions, ResumeExportModel, DOCX data, Base64, personal data, backend state, LLM state, or persistence metadata.

## Contract

The version is:

```text
tailoring_session_v1
```

The public TypeScript contract is:

```ts
export type TailoringSession = Readonly<{
  version: typeof TAILORING_SESSION_VERSION;
  currentStageId: WorkflowStageId;
  furthestStageId: WorkflowStageId;
  transitionCount: number;
}>;
```

The session intentionally has no `sessionId`, `userId`, `profileId`, `offerId`, `createdAt`, `updatedAt`, timestamps, random IDs, payloads, or personal content.

## Initial State

`createTailoringSession()` returns:

```json
{
  "version": "tailoring_session_v1",
  "currentStageId": "start",
  "furthestStageId": "start",
  "transitionCount": 0
}
```

The returned object is frozen. Independent calls produce equivalent states and do not use Date, Date.now, performance.now, UUID, Math.random, crypto.randomUUID, or global counters.

## Stage Fields

`currentStageId` is the current visible workflow stage.

`furthestStageId` is the furthest workflow stage reached during the current local session. It lets the UI distinguish stages that were visited and then left behind.

`transitionCount` counts successful advance and back transitions. No-op transitions at the workflow boundaries do not increment it. Reset returns the initial contract with `transitionCount: 0`.

## Session Status

`getTailoringSessionStatus(session)` returns one of:

- `not_started`: current stage is `start` and `transitionCount` is `0`.
- `in_progress`: any other valid state except `download`; this includes returning to `start` after advancing.
- `ready_to_download`: current stage is `download`.

Visible labels are derived outside the session:

- `Sin iniciar`
- `En curso`
- `Preparada para descargar`

The labels are not stored inside TailoringSession.

## Stage Status

`getTailoringSessionStageStatus(session, stageId)` returns one of:

- `current`: the stage is `currentStageId`.
- `completed`: the stage position is before the current stage.
- `visited`: the stage position is after the current stage and not after `furthestStageId`.
- `upcoming`: the stage position is after `furthestStageId`.

For example, if the person reached `proposals` and went back to `requirements`, then `start`, `resume`, `job`, and `analysis` are completed; `requirements` is current; `proposals` is visited; and `review`, `preview`, and `download` are upcoming.

The session does not store a duplicated array of stage statuses.

## Actions And Reducer

The reducer supports exactly:

```ts
{ type: "advance" }
{ type: "back" }
{ type: "reset" }
```

`advance` uses the canonical workflow navigation helpers, advances exactly one stage, increments `transitionCount`, and updates `furthestStageId` only when the new current stage is beyond the previous furthest stage. `advance` at `download` is a no-op and may return the same reference.

`back` uses the canonical workflow navigation helpers, moves exactly one stage backward, increments `transitionCount`, and preserves `furthestStageId`. `back` at `start` is a no-op and may return the same reference.

`reset` returns the initial contract. Even if the input is already initial, the reducer returns a fresh equivalent initial session; this keeps reset deterministic and simple.

There is no `goto`, jump action, arbitrary payload, side effect, callback, or async operation.

## Runtime Validation

`isTailoringSession(value)` and `assertTailoringSession(value)` validate runtime values.

`assertTailoringSession` throws:

```ts
new Error("TAILORING_SESSION_INVALID")
```

Validation requires a non-null object, not an array, with exactly four properties: `version`, `currentStageId`, `furthestStageId`, and `transitionCount`.

It also requires the literal version, known workflow stage IDs, a non-negative integer transition count, `furthestStageId` not before `currentStageId`, and `transitionCount === 0` only when both stage IDs are `start`.

Validation rejects unknown IDs, unknown version, additional properties, incomplete objects, negative or decimal transition counts, `null`, arrays, strings, and states where the current stage is after the furthest stage. It does not modify or freeze the input value.

Invalid reducer actions throw:

```ts
new Error("TAILORING_SESSION_ACTION_INVALID")
```

Actions must be non-null objects, not arrays, with exactly one `type` property and no payload.

## Immutability

All newly created states are frozen. The reducer accepts mutable valid sessions and frozen valid sessions. It does not modify or freeze its input.

The current contract contains only primitive fields, so freezing the root object is sufficient. No nested mutable structures are shared.

## App Integration

`App` uses `useReducer` with `createTailoringSession` and `tailoringSessionReducer`.

TailoringSession is the only source of truth for workflow navigation. `currentStage`, progress, button state, and session status are derived from the session.

The UI still has no direct stage jumping and no visible reset button in this increment.

## SessionStatusBadge

`SessionStatusBadge` receives the derived session status and shows:

- `Sesión local`
- `Sin iniciar`, `En curso`, or `Preparada para descargar`

It does not show internal version, `transitionCount`, `furthestStageId`, or technical IDs.

## Stepper

The stepper remains informational. It renders no buttons, links, or direct navigation.

It now receives a stage status resolver and shows visible Spanish labels:

- `Actual`
- `Completada`
- `Visitada`
- `Pendiente`

The current stage keeps `aria-current="step"`.

## Privacy

The shell remains local and ephemeral. It does not use localStorage, sessionStorage, IndexedDB, cookies, URL state, backend calls, network calls, analytics, or authentication.

The visible privacy notice remains:

```text
Tus datos no se almacenan en esta versión.
```

## Tests

The unit tests cover:

- initial contract creation;
- runtime validation;
- stable validation errors;
- action validation;
- reducer transitions;
- no-op boundaries;
- reset;
- immutability;
- session status;
- stage status;
- full forward and reverse navigation;
- source checks for forbidden time, random, storage, and network APIs;
- static React rendering with `react-dom/server`.

No jsdom, Testing Library, router, backend, or browser automation dependency is added.

## Limitations

This increment still does not include CV content, job offer content, file input, matching, scoring, proposals, backend, LLM, DOCX generation from the UI, download behavior, persistence, analytics, or authentication.

The next increment is text input for CV and job offer content while keeping the data local and ephemeral.
