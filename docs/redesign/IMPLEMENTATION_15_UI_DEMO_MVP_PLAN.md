# Implementation 15 - Tailoring UI Demo MVP

## Objetivo

Este incremento convierte el shell web de nueve etapas en una demostración local y funcional del flujo de adaptación de currículum. La demo permite pegar texto de currículum y oferta, analizar requisitos, revisar evidencias, generar propuestas deterministas, aceptar/rechazar/editar propuestas, aplicar únicamente aprobaciones explícitas, previsualizar el currículum adaptado y descargar un DOCX.

No implementa backend, persistencia, carga de archivos, OCR, parsing avanzado, LLM, cuentas, nube, analytics ni garantía de empleo.

## Arquitectura

La navegación sigue teniendo una única fuente de verdad: `TailoringSession` v1 con `version`, `currentStageId`, `furthestStageId` y `transitionCount`. No se añadió contenido del CV ni de la oferta a `TailoringSession`.

El estado superior `TailoringDemoState` vive en memoria y contiene:

- `session`;
- `resumeText`;
- `jobText`;
- `analysis`;
- `reviewDecisions`;
- `appliedResult`;
- `docx`;
- `visibleError`.

El reducer `tailoringDemoReducer` delega `advance` y `back` en `tailoringSessionReducer`, invalida derivados cuando cambian las entradas, recalcula validación al editar propuestas y rechaza acciones runtime desconocidas con `TAILORING_DEMO_ACTION_INVALID`.

## Flujo Completo

1. `start`: presenta alcance, privacidad, ausencia de IA generativa y revisión humana.
2. `resume`: textarea accesible para currículum, contador, límite y limpieza explícita.
3. `job`: textarea accesible para oferta, contador, límite y limpieza explícita.
4. `analysis`: ejecuta análisis determinista local.
5. `requirements`: muestra requisitos cubiertos, parciales y no cubiertos con evidencias.
6. `proposals`: muestra original, propuesta, requisito, evidencia y validación.
7. `review`: permite aceptar, rechazar, editar y restaurar cada propuesta.
8. `preview`: muestra el resultado real de aplicar aprobaciones.
9. `download`: genera y descarga `curriculum-adaptado.docx` bajo acción explícita del usuario.

## Parsing Determinista

El currículum se divide por líneas no vacías. Cada bloque conserva texto, orden, Unicode, acentos, mayúsculas y puntuación. Los IDs son posicionales y estables, por ejemplo `resume_block_001` y `evidence_001`.

No se infieren cargos, empresas, fechas, logros ni habilidades no presentes. Los valores neutrales como `No inferido` se usan solo donde el schema requiere una estructura y no se presentan como hechos profesionales.

La oferta se divide por líneas, bullets y frases. Se normalizan espacios únicamente para extraer requisitos legibles. La deduplicación es estable por texto normalizado. Los requisitos reciben IDs posicionales como `requirement_001`.

## Pipeline Reutilizado

La demo reutiliza contratos y funciones reales cuando son compatibles con navegador:

- `buildResumeDocument`;
- `EvidenceSchema`, `ProfileSchema`, `OfferSchema`;
- `matchRequirement`;
- `JobMatchResultSchema`;
- `scoreTraceabilityResult`;
- `buildTailoringPlan`;
- `resolveTailoringTargets`;
- `buildRewriteProposals`;
- `buildRewriteGenerationRequests`;
- `validateRewriteCandidates`;
- `buildRewriteReviewDecisions`;
- `applyApprovedRewrites`;
- `buildResumeExportModel`.

`evaluateJobRequirements` no se importa en la UI porque genera `generatedAt` con la hora actual. En su lugar, la demo reutiliza `matchRequirement` por cada requisito y ensambla un `JobMatchResult` compatible con schema sin usar la hora del sistema. El campo legacy `generatedAt` queda con un valor fijo no temporal requerido por el contrato de matching; no se muestra ni participa en scoring, proposals, preview o exportación.

## Matching y Scoring

El matching de la demo usa la función real `matchRequirement`. Los parsers estructuran señales visibles del texto como `competencyOrTool`, `associatedCompetency` y `tags` para que el matcher pueda aplicar sus reglas existentes. Solo hay evidencia positiva cuando el `evidenceId` existe realmente en la entrada parseada. Si no hay coincidencia, el requisito queda como `not_met` y no obtiene evidencia.

El scoring lo realiza `scoreTraceabilityResult`, por lo que se mantiene el contrato reproducible del núcleo: mismas entradas producen la misma salida.

## Propuestas y Anti-Invención

Las propuestas nacen únicamente de acciones positivas del `TailoringPlan` con evidencia válida y de resoluciones de targeting sobre bloques existentes. El candidato determinista puede reordenar oraciones del bloque original para priorizar una oración con más tokens del requisito; si no hay una reorganización segura, conserva el texto original.

La demo no añade métricas, fechas, empresas, títulos, certificaciones ni habilidades ausentes. Las ediciones manuales se vuelven a validar con `validateRewriteCandidates`; una propuesta rechazada por validación no puede aprobarse.

## Revisión Humana

No hay aprobación automática. Cada validación requiere una decisión explícita:

- `approved`;
- `rejected`;
- `changes_requested`.

La aplicación se hace con `buildRewriteReviewDecisions` y `applyApprovedRewrites`. Solo `approvedSelections` llegan al documento adaptado. Las propuestas rechazadas o con cambios solicitados no se aplican.

## Preview y Export Model

La preview usa `ApprovedRewriteApplicationResult.adaptedDocument`. El `ResumeExportModel` se construye desde el mismo `applicationResult`, de modo que preview y descarga derivan del mismo resultado aprobado.

No se renderizan campos técnicos como `proposalId`, `requestId`, `applicationId` o IDs de evidencia.

## DOCX

La arquitectura elegida es browser-first y sin backend. El renderer Node existente sigue intacto y sus pruebas continúan pasando, pero depende de `Packer.toBuffer` y `Buffer`. Para evitar divergencia de formato, el constructor puro `buildResumeExportModelDocxDocument` vive en el renderer existente y se reutiliza tanto desde Node como desde el adaptador web. La diferencia queda limitada al empaquetado: `Packer.toBuffer` y normalización ZIP en Node; `Packer.toBlob` en navegador.

El adaptador web se carga con `import()` solo cuando el usuario pulsa descargar, para no incluir `docx` en el bundle inicial. El resultado se devuelve con forma `DocxRenderResult` y metadatos del contrato existente. La descarga visible usa el nombre neutro y estable `curriculum-adaptado.docx`.

## Privacidad

El contenido se mantiene en memoria del navegador. No se usa `localStorage`, `sessionStorage`, IndexedDB, cookies, analytics, logging del CV/oferta, red ni proveedores LLM. Al recargar la página se pierde el estado.

## Accesibilidad

La UI usa labels visibles, `aria-describedby`, `aria-invalid`, `aria-live`, botones con nombres claros, encabezados jerárquicos, foco visible y un único `aria-current="step"` en el stepper. El stepper no permite navegación directa.

## Límites

- CV: 24.000 caracteres.
- Oferta: 16.000 caracteres.
- Bloques de CV: 80.
- Requisitos: 30.
- Propuestas: 12.
- Edición de propuesta: 1.200 caracteres.

Los límites producen errores visibles y seguros; no se trunca contenido silenciosamente.

## Invalidación

Cambiar `resumeText` o `jobText` invalida análisis, requisitos derivados, propuestas, decisiones, preview, export model y DOCX. Esto evita descargar documentos generados con entradas anteriores.

## Errores

Los errores visibles están en español y no incluyen el texto completo del CV, la oferta ni propuestas editadas. Los códigos internos son estables y siguen el estilo del repositorio.

## Pruebas

La suite `tests/unit/tailoring-ui-demo.test.ts` cubre:

- estado inicial e inmutabilidad;
- acciones inválidas;
- guardas de navegación;
- reset;
- aceptación de estados congelados sin mutar entrada;
- invalidación de derivados;
- parsing de CV y oferta;
- límites;
- análisis determinista;
- matching/scoring con contratos reales;
- propuestas basadas en bloques existentes;
- revalidación de ediciones;
- restauración de propuesta;
- bloqueo de aprobación para candidatos rechazados por validación;
- aplicación exclusiva de aprobaciones;
- preview y export model desde el mismo documento;
- generación DOCX inspeccionando `word/document.xml` y comparándolo con el renderer Node;
- SSR sin DOM test environment;
- ausencia de APIs prohibidas en módulos nuevos.

## Cómo Ejecutar

```bash
npm.cmd run web:dev
```

Después abre la URL local indicada por Vite.

## Comandos de Verificación

```bash
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run web:typecheck
npm.cmd run web:build
npm.cmd audit --omit=dev
git diff --check
git status --short
```

## Limitaciones

- Parsing superficial por líneas/frases.
- Sin entrada PDF/DOCX.
- Sin OCR.
- Sin LLM.
- Sin backend local.
- Sin persistencia ni cuentas.
- Sin navegación directa desde el stepper.
- El empaquetado web no aplica la normalización ZIP determinista del renderer Node; la estructura visual del documento sí comparte el mismo constructor.

## Siguiente Fase Recomendada

Valorar si merece la pena mover también la normalización ZIP a una utilidad compatible con navegador. No es necesario para la demo local, porque el contenido visual ya comparte el constructor DOCX real y la descarga depende de una acción explícita del usuario.
