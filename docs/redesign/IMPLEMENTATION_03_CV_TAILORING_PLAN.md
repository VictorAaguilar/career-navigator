# IMPLEMENTATION 03: CV Tailoring Plan

## Proposito

Este incremento introduce el primer nucleo del CV Tailoring Agent: un planificador determinista que convierte resultados de matching y scoring en un `TailoringPlan` estructurado.

El planificador no reescribe el CV. Decide que evidencias pueden destacarse, que requisitos quedan sin cubrir y que informacion debe confirmar el usuario antes de permitir cualquier adaptacion.

## Archivos principales

- `src/schemas/tailoring.ts`: contratos Zod publicos del plan.
- `src/core/tailoring/planner.ts`: funcion pura `buildTailoringPlan`.
- `src/core/tailoring/index.ts`: exports del modulo de dominio.
- `tests/unit/tailoring.test.ts`: pruebas unitarias del contrato y del comportamiento determinista.

## Firma publica

```ts
export function buildTailoringPlan(input: BuildTailoringPlanInput): TailoringPlan
```

`BuildTailoringPlanInput` contiene:

- `offer: Offer`
- `profile: Profile`
- `evidences: Evidence[]`
- `jobMatchResult: JobMatchResult`
- `scoringResult: ScoringResult`

## Relacion con matching y scoring

El planificador consume:

- `JobMatchResult` desde `src/core/matching`, especialmente `requirementMatches`.
- `ScoringResult` desde `src/core/scoring`, para incluir `score`, `confidence` y `classification` en el resumen del plan.
- `Offer`, `Profile` y `Evidence[]` desde `src/schemas`.

El matching decide si cada requisito esta `met`, `partially_met`, `not_met` o `unknown`. El scoring calcula compatibilidad global. El planner no recalcula esos contratos: valida que sean coherentes y los transforma en acciones, gaps y revisiones.

## Invariantes de input

Antes de generar el plan, `buildTailoringPlan` valida:

- `offer.id === jobMatchResult.jobId`
- `profile.id === jobMatchResult.profileId`
- `scoringResult.jobId === offer.id === jobMatchResult.jobId`
- `scoringResult.profileId === profile.id === jobMatchResult.profileId`
- no hay `requirementId` duplicados en `requirementMatches`
- no hay `requirementId` duplicados en `requirementScores`
- matching y scoring contienen exactamente el mismo conjunto de `requirementId`
- cada `requirementStatus` de scoring coincide con el `status` del matching correspondiente

Si una invariante falla, la funcion lanza un `Error` con un codigo estable:

- `TAILORING_INPUT_JOB_ID_MISMATCH`
- `TAILORING_INPUT_PROFILE_ID_MISMATCH`
- `TAILORING_INPUT_DUPLICATE_MATCH`
- `TAILORING_INPUT_DUPLICATE_SCORE`
- `TAILORING_INPUT_REQUIREMENT_SET_MISMATCH`
- `TAILORING_INPUT_REQUIREMENT_STATUS_MISMATCH`

## Reglas anti-invencion

- `TailoringAction` representa solo acciones positivas respaldadas por evidencia.
- Los tipos de accion permitidos son `highlight_evidence`, `prioritize_section` y `retain_content`.
- `record_gap` y `request_confirmation` no son acciones validas.
- Una accion positiva nunca se genera ni valida sin `requirementIds`.
- Una accion positiva nunca se genera ni valida sin `evidenceIds`.
- Los `evidenceIds` deben existir en el arreglo de evidencias recibido.
- `not_met` genera exclusivamente un item en `TailoringPlan.gaps`.
- `unknown` genera exclusivamente un item en `TailoringPlan.reviewItems`.
- `met` y `partially_met` solo generan acciones si el matching trae evidencia real y valida.
- El plan no incluye `beforeText`, `afterText` ni texto reescrito del CV.
- La salida no incluye timestamps ni metadatos temporales.

## Tratamiento de evidenceIds

Para cada match, el planner:

1. deduplica `matchedEvidenceIds`;
2. ordena las evidencias de forma estable;
3. separa IDs validos e invalidos segun `Evidence[]`;
4. usa solo IDs validos para acciones positivas;
5. agrega un warning determinista por cada ID invalido;
6. si todos los IDs son invalidos, no genera accion positiva y crea un `reviewItem`.

Las referencias inexistentes nunca se aceptan silenciosamente como soporte.

## Estrategia de IDs

Los IDs son deterministas y derivan solo de datos estables de entrada. Se construyen con serializacion canonica, componentes etiquetados y `encodeURIComponent`:

- Acciones: `action|offer=<...>|profile=<...>|requirement=<...>|status=<...>|type=<...>|evidence=<...>`
- Gaps: `gap|offer=<...>|profile=<...>|requirement=<...>|status=<...>`
- Revisiones: `review|offer=<...>|profile=<...>|requirement=<...>|status=<...>|reason=<...>`

Las `evidenceIds` se deduplican y ordenan antes de construir el ID. La serializacion evita ambiguedades con guiones, barras, dos puntos, pipes u otros separadores. No se usan hashes, UUID, contadores globales, `Date`, `Date.now`, `Math.random`, llamadas de red ni modelos de lenguaje.

## Regla de orden

El resultado no depende del orden de entrada. El planner ordena copias internas y no muta los arreglos recibidos.

- `actions`: por `requirementId` ascendente.
- `gaps`: por `requirementId` ascendente.
- `reviewItems`: por `requirementId` ascendente.
- `warnings`: orden lexicografico ascendente.
- `evidenceIds` dentro de cada accion: deduplicados y en orden ascendente.

Dos inputs semanticamente equivalentes con distinto orden deben producir resultados `deepEqual`.

## Fuera de alcance

- Reescritura de resumen, bullets, experiencia o skills.
- Generacion de DOCX, PDF, HTML o LaTeX.
- Interfaz de usuario, CLI, dashboard o adaptadores de asistentes.
- Extraccion de requisitos desde texto libre.
- Extraccion de evidencias desde `cv.md`.
- Validacion semantica con modelos de lenguaje.
- Persistencia del plan en disco.

## Ejemplo JSON

```json
{
  "offerId": "offer-1",
  "profileId": "profile-1",
  "summary": {
    "totalRequirements": 2,
    "supportedRequirements": 1,
    "partiallySupportedRequirements": 0,
    "unsupportedRequirements": 1,
    "unknownRequirements": 0,
    "actionCount": 1,
    "gapCount": 1,
    "reviewItemCount": 0,
    "score": 75,
    "confidence": 0.8,
    "classification": "strong_match"
  },
  "actions": [
    {
      "actionId": "action|offer=offer-1|profile=profile-1|requirement=req-python|status=met|type=highlight_evidence|evidence=evidence-python",
      "type": "highlight_evidence",
      "targetSection": "skills",
      "requirementIds": ["req-python"],
      "evidenceIds": ["evidence-python"],
      "reason": "Requirement \"req-python\" is supported by matched evidence with exact match strength.",
      "supportStatus": "supported",
      "priority": "high"
    }
  ],
  "gaps": [
    {
      "gapId": "gap|offer=offer-1|profile=profile-1|requirement=req-tableau|status=not_met",
      "requirementId": "req-tableau",
      "reason": "Requirement \"req-tableau\" is not supported by candidate evidence and must not be claimed in the CV.",
      "priority": "high",
      "supportStatus": "unsupported",
      "missingInformation": []
    }
  ],
  "reviewItems": [],
  "warnings": []
}
```
