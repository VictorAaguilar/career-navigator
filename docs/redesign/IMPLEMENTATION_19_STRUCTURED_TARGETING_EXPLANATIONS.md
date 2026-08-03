# Implementación 19: Explicaciones deterministas de ubicación y trazabilidad

## Plan inicial

Este incremento añade una capa de explicación derivada para que la demo muestre dónde se encontró cada evidencia y qué bloque del currículum sería modificado por cada propuesta. No cambia matching, scoring, generación de propuestas, validación, decisiones humanas, aplicación de cambios, exportación ni DOCX.

El contrato se apoya en relaciones ya existentes:

- `Evidence.reference.experienceId` apunta al `ResumeBlock.blockId` que originó la evidencia.
- `RewriteProposal`, validación, decisión y cambio aplicado conservan `proposalId`, `validationId` y `blockId`.
- `ResumeDocument` sigue siendo el documento canónico vigente.
- `TailoringDemoState.analysis` se invalida cuando cambian `resumeText`, importación, modo estructurado/plano o categorías revisadas.

La implementación prevista es:

1. Crear `apps/web/src/app/tailoring-location-explanations.ts` con contratos puros para fuente, estado, warnings, motivos, índice y etiquetas visibles.
2. Construir un índice congelado desde `ResumeDocument` que relacione `sectionId` y `blockId` con ubicación humana.
3. En modo estructurado, traducir secciones a etiquetas españolas y bloques ordinales.
4. En modo plano, mostrar ubicaciones honestas por párrafo sin inventar secciones.
5. Enriquecer filas de presentación de requisitos y propuestas con explicaciones derivadas, sin almacenar una segunda copia del CV.
6. Mostrar las explicaciones en Requirements, Proposals, Review y Preview.
7. Añadir pruebas unitarias, de integración, SSR y E2E.
8. Actualizar la guía de usuario y el checklist de aceptación.

## Restricciones

Fuera de alcance:

- LLM, backend, API, persistencia, analytics, red u OCR.
- Nuevos formatos de archivo.
- Nuevas dependencias.
- Cambios en scoring, matching, propuesta, validación, aprobación, documento adaptado, DOCX o TailoringSession v1.

Las explicaciones son deterministas y no usan `Date`, `Date.now`, `performance.now`, `Math.random`, UUIDs, storage ni datos externos.

## Implementación Final

Archivos principales:

- `apps/web/src/app/tailoring-location-explanations.ts`
- `apps/web/src/app/tailoring-demo-pipeline.ts`
- `apps/web/src/components/stages/RequirementsStage.tsx`
- `apps/web/src/components/stages/ProposalsStage.tsx`
- `apps/web/src/components/stages/ReviewStage.tsx`
- `apps/web/src/components/stages/PreviewStage.tsx`
- `tests/unit/structured-targeting-explanations.test.ts`
- `tests/e2e/structured-targeting-flow.mjs`

La capa nueva es solo de presentación. Construye un índice congelado desde el `ResumeDocument` vigente y expone etiquetas humanas para requisitos, evidencias, targets y trazabilidad de preview.

## Contratos

Fuentes:

- `structured`
- `plain`

Estados:

- `resolved`
- `ambiguous`
- `unresolved`

Warnings:

- `TAILORING_LOCATION_APPROXIMATE_PLAIN_TEXT`
- `TAILORING_LOCATION_AMBIGUOUS_TARGET`
- `TAILORING_LOCATION_UNRESOLVED`
- `TAILORING_LOCATION_HEADING_HIDDEN`

Errores internos:

- `TAILORING_LOCATION_INDEX_INVALID`
- `TAILORING_LOCATION_DUPLICATE_ID`
- `TAILORING_LOCATION_NOT_FOUND`
- `TAILORING_LOCATION_AMBIGUOUS`
- `TAILORING_EXPLANATION_INVALID`

Motivos de targeting:

- `evidence_block_match`
- `structured_section_match`
- `existing_target_resolution`
- `plain_text_position`
- `ambiguous_target`
- `unresolved_target`

Los motivos visibles se generan únicamente desde esos códigos.

## Índice De Ubicaciones

`buildResumeLocationIndex(resumeDocument)` valida el documento, detecta IDs duplicados de forma defensiva y devuelve:

- `documentId`
- `profileId`
- `source`
- `sectionIds`
- `blockIds`
- `locationsByBlockId`
- `summary`

No almacena texto completo de bloques, secciones ni `resumeText`. Solo conserva ordinals, kind de sección, IDs internos para relación interna y encabezado seguro cuando corresponde.

## Modo Estructurado

Las etiquetas visibles usan las categorías existentes:

- `Experiencia · bloque 2`
- `Habilidades · bloque 1`
- `Formación · bloque 1`
- `Otra sección: Publicaciones · bloque 1`

Los encabezados originales solo se muestran cuando son breves y no contienen email, teléfono ni URL. En secciones de contacto no se muestran encabezados originales.

## Modo Plano

El modo plano no inventa categorías. Usa:

- `Texto del currículum · párrafo 1`
- `Texto del currículum · párrafo 2`

Cada ubicación plana incluye `TAILORING_LOCATION_APPROXIMATE_PLAIN_TEXT` y una advertencia visible: la ubicación es aproximada porque se utiliza análisis de texto plano.

## Evidencias Y Requisitos

Cada requisito muestra `Ubicación de la evidencia` cuando existen `matchedEvidenceIds` reales.

Si no hay evidencia:

```text
No se encontró evidencia en el currículum.
```

No se crea ubicación para requisitos no cubiertos. Las coincidencias parciales mantienen su estado y solo muestran ubicaciones de evidencias realmente enlazadas.

## Targets Y Propuestas

Cada propuesta muestra:

- `Ubicación objetivo`
- requisito relacionado;
- evidencia usada;
- motivos deterministas;
- advertencias cuando la ubicación es aproximada.

La ubicación objetivo se resuelve desde la resolución de targeting y el `blockId` ya producido por el pipeline. No se recalcula matching, scoring ni propuestas.

## Trazabilidad De Preview

`applyTailoringDemoReview` devuelve `traceabilityRows` derivados junto a `reviewDecisionBatch`, `applicationResult` y `exportModel`.

Cada fila conserva:

- `validationId` y `proposalId` solo para relación interna;
- decisión visible: `Aceptada`, `Editada y aceptada`, `Rechazada` o `Cambios solicitados`;
- resultado: `Cambio aplicado` o `No aplicado`;
- requisito relacionado;
- ubicación visible;
- texto antes y después cuando hay cambio aplicado.

Las propuestas rechazadas no aparecen como cambios aplicados. Pueden figurar en `Cambios no aplicados`.

## Integración UI

Requirements:

- muestra evidencia y ubicación;
- muestra ausencia sin inventar bloque;
- mantiene `Cubierto`, `Parcial` y `No cubierto`.

Proposals:

- muestra ubicación objetivo;
- muestra `Por qué se propone aquí`;
- conserva texto original, texto propuesto, evidencia y validación.

Review:

- reutiliza la misma ubicación de Proposals;
- la edición no cambia el target.

Preview:

- muestra `Cambios aplicados`;
- muestra `Cambios no aplicados` cuando corresponde;
- no modifica `ResumeExportModel` ni DOCX.

## Invalidación

El índice vive en `DemoAnalysisResult`. Se invalida junto con `analysis` cuando cambian:

- `resumeText`;
- importación;
- modo estructurado/plano;
- categoría de sección;
- confirmación estructural;
- oferta laboral.

No existe un índice separado persistido fuera del análisis vigente.

## Privacidad

La implementación no registra CV, oferta, evidencia, headings, propuestas ni ubicaciones. No usa storage, red, backend, analytics ni LLM.

Los IDs internos nunca se muestran como texto visible. El DOCX y el `ResumeExportModel` no contienen metadatos de ubicación.

## Pruebas

Cobertura añadida:

- contratos y errores estables;
- índice estructurado;
- índice plano;
- encabezado `other` seguro;
- encabezado sensible oculto;
- duplicados de `sectionId` y `blockId`;
- evidencia resuelta, no referenciada y obsoleta;
- targets exactos, planos, ambiguos y no resueltos;
- regresión de matching, scoring, propuestas, validación y export model;
- trazabilidad de preview para aceptadas, editadas y rechazadas;
- SSR de Requirements, Proposals, Review y Preview;
- privacidad y determinismo;
- E2E estructurado de targeting con descarga DOCX.

Comandos nuevos:

```bash
npm run web:e2e:targeting
npm run web:e2e:targeting:headed
```
