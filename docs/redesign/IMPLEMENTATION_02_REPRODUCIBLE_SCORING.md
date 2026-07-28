# IMPLEMENTATION 02: Reproducible Scoring

## Objetivo

Este documento describe la implementación del tercer incremento del MVP: un motor determinista y reproducible de scoring de compatibilidad entre un perfil y una oferta.

El scoring se basa únicamente en el resultado del motor requisito–evidencia y no utiliza IA, prompts, embeddings, internet ni heurísticas ocultas.

## Arquitectura

El motor de scoring vive en `src/core/scoring/` y consume los resultados de trazabilidad de `src/core/matching/`.

Componentes principales:

- `types.ts`: define los modelos de resultados de scoring y detalle por requisito.
- `scoring.ts`: implementa las funciones puras del motor.
- `index.ts`: exporta las funciones públicas.

## Modelo de resultado

### Resultado general de scoring

`ScoringResult` incluye:

- `jobId`
- `profileId`
- `score` (0–100)
- `scoreScale` (`0-100`)
- `classification`
- `requirementScores`
- `mandatoryRequirementSummary`
- `optionalRequirementSummary`
- `confidence`
- `strengths`
- `gaps`
- `unknowns`
- `warnings`
- `generatedAt`
- `scoringVersion`

### Resultado individual por requisito

`RequirementScore` incluye:

- `requirementId`
- `requirementStatus`
- `mandatory`
- `weight`
- `rawContribution`
- `normalizedContribution`
- `penalty`
- `confidence`
- `explanation`

## Fórmula de scoring

1. Normaliza cada peso a 0–100.
2. Calcula una contribución base:
   - `met`: `base = weight * (mandatory ? 1.2 : 1)`
   - `partially_met`: `0.5 * base`
   - `not_met`: `0`
   - `unknown`: `0.5 * base * confidence`
3. Aplica penalizaciones obligatorias:
   - `not_met` obligatorio: 15 puntos.
   - `not_met` obligatorio por certificación: 20 puntos.
   - `unknown` obligatorio: 5 puntos.
4. Normaliza la contribución final a 0–100.
5. Agrega todas las contribuciones normalizadas y divide por el potencial total de requisitos.
6. Convierte el resultado en la escala 0–100.

La puntuación final es `clamp(0, 100, (sum(normalizedContribution) / totalPotential) * 100)`.

## Pesos

- El peso provisional del requisito se normaliza a 0–100.
- Los requisitos obligatorios reciben un multiplicador de 1.2 sobre el peso base.
- Si el requisito no tiene peso explícito, se usa 50.
- Si todos los requisitos carecen de peso, se aplica el valor por defecto 50 para cada uno.
- Si no hay requisitos, el score es 0 y se clasifica como `insufficient_information`.

## Penalizaciones

- `mandatory not_met`: penalización de 15 puntos.
- `certificación regulatoria obligatoria ausente`: penalización de 20 puntos.
- `unknown` obligatorio: penalización de 5 puntos.
- `not_met` opcional no penaliza con la fórmula de requisitos, pero aparece en gaps.
- `unknown` no se trata como `not_met` automáticamente; reduce confianza, no suma puntos.

## Clasificación

Los umbrales son:

- `excellent_match`: 85–100
- `strong_match`: 70–84
- `moderate_match`: 50–69
- `weak_match`: 1–49
- `insufficient_information`: cuando hay pocos datos, demasiados unknown, o score < 1

Además, si más del 50% de los requisitos son `unknown`, el resultado se clasifica como `insufficient_information`.

## Confianza global

La confianza global se calcula con:

- porcentaje de requisitos con estado conocido (`met`, `partially_met`, `not_met`)
- promedio de confianza de cada requisito
- penalización por ratio de `unknown`

Fórmula:

```text
confidence = averageConfidence * knownRatio * (1 - unknownRatio * 0.3)
```

El resultado se limita entre 0 y 1.

## Strengths, gaps y unknowns

- `strengths`: requisitos `met` con confianza >= 0.7.
- `gaps`: requisitos `not_met` y `partially_met` obligatorios.
- `unknowns`: requisitos `unknown`.

## Ejemplos conceptuales

- Todos los requisitos `met` con alta confianza → `excellent_match`.
- Requisito obligatorio `not_met` → fuerte gap y score reducido.
- Muchos `unknown` → clasificación `insufficient_information`.

## Limitaciones actuales

- No se calcula ranking entre ofertas.
- No se generan recomendaciones directas.
- No se usa información de perfil adicional más allá del matching.
- Las penalizaciones son iniciales y pueden necesitar ajuste con datos reales.

## Cómo ejecutar las pruebas

```bash
npm run typecheck
npm test
```

## Siguiente incremento recomendado

Agregar un adaptador que use `scoreTraceabilityResult` para producir recomendaciones de acción y una interfaz de salida estructurada. También conviene revisar los umbrales con casos reales de usuarios.
