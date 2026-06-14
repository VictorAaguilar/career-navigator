# IMPLEMENTATION 01: Requirement–Evidence Matching

## Objetivo

Este documento describe la implementación del segundo incremento del MVP: el motor determinista de trazabilidad entre los requisitos de una oferta y las evidencias de un perfil.

El motor no calcula aún una puntuación global de compatibilidad. Su objetivo es:

- relacionar cada requisito de la oferta con la evidencia disponible;
- producir un estado claro de cumplimiento;
- documentar el porqué de cada decisión;
- evitar inferencias no justificadas o dependencias de IA.

## Arquitectura del motor

El motor se encuentra en `src/core/matching/` y está separado de los esquemas de datos (`src/schemas/`).

Componentes principales:

- `types.ts`: define los modelos de resultado de trazabilidad.
- `matcher.ts`: implementa las reglas de comparación y el motor de evaluación.
- `index.ts`: exporta las funciones públicas del módulo.

El motor es determinista porque:

- usa reglas explícitas de normalización de texto;
- no llama a servicios externos;
- no utiliza prompts ni modelos de lenguaje;
- solo se apoya en datos estructurados validados.

## Modelos de trazabilidad

### Resultado por requisito

Cada requisito produce un `RequirementMatchResult` con:

- `requirementId`: identificador del requisito.
- `status`: uno de `met`, `partially_met`, `not_met`, `unknown`.
- `matchedEvidenceIds`: IDs de las evidencias relevantes.
- `matchStrength`: uno de `exact`, `strong`, `partial`, `none`, `unknown`.
- `confidence`: valor entre 0 y 1.
- `explanation`: explicación legible de la decisión.
- `missingInformation`: lista de datos explícitos que faltan.
- `warnings`: advertencias sobre la calidad o verificación de la evidencia.

#### Significado de los estados

- `met`: existe evidencia explícita que respalda el requisito con un ajuste suficiente.
- `partially_met`: hay evidencia relacionada, pero falta un aspecto clave (nivel, años, nivel de idioma, etc.).
- `not_met`: no hay evidencia suficiente que respalde el requisito.
- `unknown`: no hay suficiente información para decidir con certeza, aunque exista evidencia relacionada.

### Resultado general de trazabilidad

`JobMatchResult` agrupa todos los resultados de los requisitos de una oferta:

- `jobId`
- `profileId`
- `requirementMatches`
- `totalRequirements`
- `metRequirements`
- `partiallyMetRequirements`
- `notMetRequirements`
- `unknownRequirements`
- `generatedAt`
- `warnings`

## Reglas deterministas iniciales

### Coincidencia por competencia o herramienta

El motor compara requisitos y evidencias mediante:

- coincidencia exacta normalizada (ignorando mayúsculas, espacios y puntuación simple);
- coincidencia por etiquetas (`tags` de la evidencia);
- coincidencia por competencia asociada (`associatedCompetency` de la evidencia).

No se utiliza similitud semántica ni embeddings.

### Nivel requerido

Se utiliza el siguiente orden de niveles:

- Requisito: `basic` < `intermediate` < `advanced` < `expert` < `unspecified`.
- Evidencia: `beginner` < `intermediate` < `advanced` < `expert` < `master` < `unspecified`.

Un requisito no se considera `met` si la evidencia tiene un nivel claramente inferior; en ese caso se devuelve `partially_met`.

### Años de experiencia

El motor solo utiliza información explícita disponible. Si un requisito pide años de experiencia y la evidencia no la declara explícitamente, el resultado es `partially_met` con `missingInformation`.

No se deduce duración a partir de niveles como `junior`, `mid` o `senior`.

### Idiomas

Para requisitos de idioma, el motor compara el idioma requerido con los idiomas declarados en el perfil y, cuando existe, con evidencias de certificación de idioma.

No se asume que un idioma nativo equivalga a una certificación.

### Formación y certificaciones

- Solo se considera cumplido un requisito de certificación si existe evidencia tipo `certification` que coincida explícitamente.
- Solo se considera cumplido un requisito de formación si existe evidencia tipo `education` que coincida explícitamente.
- Una certificación no se satisface con una competencia genérica.
- Un curso no satisface automáticamente un título académico.

### Ubicación y autorización laboral

Este incremento no infiere permisos de trabajo ni disponibilidad de reubicación. Si no hay información explícita, el requisito queda en `unknown` o `not_met` según corresponda.

## Fuerza de coincidencia

La escala utilizada es:

- `exact`: coincidencia directa normalizada con evidencia y nivel suficiente.
- `strong`: coincidencia mediante etiquetas o competencia asociada normalizada.
- `partial`: evidencia relacionada, pero faltan detalles importantes.
- `none`: no hay evidencia relevante para el requisito.
- `unknown`: no se puede decidir con certeza por falta de información.

## Cálculo de confianza

La confianza se basa en reglas explícitas:

- parte de la `confidence` declarada en la evidencia;
- añade un bono si la evidencia está verificada;
- mejora con coincidencias `exact` o `strong`;
- penaliza la falta de información explícita.

La confianza siempre se normaliza a un valor entre 0 y 1.

## Limitaciones actuales

- No hay puntuación global de compatibilidad.
- El motor no realiza similitud semántica ni usa IA.
- La evaluación de años de experiencia solo se considera `partially_met` si falta información explícita.
- El motor sigue siendo conservador frente a requisitos de certificación y educación.

## Ejemplos conceptuales

- Requisito respaldado por evidencia explícita: `met`.
- Requisito con evidencia disponible pero nivel inferior: `partially_met`.
- Requisito sin evidencia relacionada: `not_met`.
- Requisito de idioma declarado en el perfil sin nivel explícito: `partially_met`.

## Cómo ejecutar las pruebas

```bash
npm run typecheck
npm test
```

## Próximo incremento recomendado

Agregar la capa de scoring global sobre `JobMatchResult`, y luego construir adaptadores que consuman este motor para generar recomendaciones y sintesis para el usuario.
