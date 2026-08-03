# Implementation 18: Structured Resume Parsing

## Resultado

Este incremento añade una revisión estructural conservadora del currículum dentro de la demo web del CV Tailoring Agent.

El flujo final es:

1. La persona pega o importa un currículum DOCX/PDF como antes.
2. `resumeText` conserva exactamente el texto original y sigue siendo la entrada canónica.
3. La persona pulsa `Detectar estructura`.
4. El navegador crea un `StructuredResumeDraft` derivado y revisable.
5. La persona puede cambiar el tipo de cada sección con un `select` nativo.
6. La persona confirma la estructura o elige explícitamente `Usar análisis de texto plano`.
7. El análisis recibe un único `ParsedResumeInput` vigente:
   - estructurado confirmado mediante `buildParsedResumeFromStructuredDraft`;
   - plano mediante `parseResumeText`.
8. Matching, scoring, targeting, propuestas, preview y DOCX consumen el mismo `ResumeDocument` resuelto.

No se añade backend, storage, red, OCR, LLM, router ni dependencias.

## Arquitectura

Archivos principales:

- `apps/web/src/app/structured-resume-parsing.ts`
- `apps/web/src/app/tailoring-demo-state.ts`
- `apps/web/src/app/tailoring-demo-pipeline.ts`
- `apps/web/src/components/stages/ResumeStage.tsx`
- `tests/unit/structured-resume-parsing.test.ts`
- `tests/e2e/structured-resume-flow.mjs`

`TailoringSession` no cambia. `session.currentStageId` sigue siendo la única fuente de verdad de navegación.

`TailoringDemoState` añade solo el artefacto derivado:

```ts
resumeStructure: {
  status: "idle" | "detected" | "confirmed" | "error";
  mode: "structured" | "plain" | null;
  draft: StructuredResumeDraft | null;
  warnings: readonly StructuredResumeWarningCode[];
  errorCode: StructuredResumeErrorCode | null;
}
```

## Contratos

El contrato de revisión es específico de UI y no sustituye al modelo canónico del dominio.

Tipos creados:

- `StructuredResumeDraft`
- `StructuredResumeSection`
- `StructuredResumeLine`
- `StructuredResumeSectionKind`
- `StructuredResumeConfidence`
- `StructuredResumeWarningCode`
- `StructuredResumeParseMode`
- `StructuredResumeReviewStatus`
- `StructuredResumeParseResult`

El draft almacena secciones y líneas necesarias para revisión. No almacena timestamps, UUIDs, embeddings, probabilidades, inferencias ni una segunda copia completa de `resumeText`.

## Tipos De Sección

El conjunto público de revisión es:

- `contact`
- `summary`
- `experience`
- `education`
- `skills`
- `languages`
- `certifications`
- `projects`
- `other`

Las etiquetas visibles se derivan con `STRUCTURED_RESUME_SECTION_LABELS`:

- Contacto
- Perfil profesional
- Experiencia
- Formación
- Habilidades
- Idiomas
- Certificaciones
- Proyectos
- Otra

## Vocabulario Y Normalización

Los aliases están centralizados en `STRUCTURED_RESUME_ALIASES`.

Incluyen variantes conservadoras en español e inglés para contacto, perfil, experiencia, formación, habilidades, idiomas, certificaciones y proyectos.

La normalización para comparación hace únicamente:

- `trim`;
- colapso de espacios;
- eliminación de `:` final;
- minúsculas;
- clave auxiliar sin diacríticos.

El texto visible y el texto de salida no se normalizan ni se reescriben.

## Detección

Una línea puede ser encabezado si cumple reglas conservadoras:

- no está vacía;
- no supera 72 caracteres;
- no supera 8 palabras;
- no es bullet;
- no es URL, email, teléfono ni fecha aislada;
- no termina como oración;
- no parece una lista de tecnologías;
- no parece un cargo frecuente como `Senior Frontend Developer`.

Aliases exactos producen `high`.

Variantes seguras como `Experiencia relevante` producen `medium`.

Encabezados desconocidos solo entran como `other` con `low` cuando tienen formato fuerte, por ejemplo mayúsculas o dos puntos final.

No hay fuzzy matching amplio ni Levenshtein.

## Confianza

La confianza es cualitativa:

- `high` -> `Confianza alta`
- `medium` -> `Confianza media`
- `low` -> `Confianza baja`

No representa certeza factual ni probabilidad de contratación.

## Casos Especiales

Contacto:

- un encabezado explícito se clasifica como `contact`;
- un bloque inicial antes del primer encabezado se clasifica como `contact` solo si contiene señales visibles de contacto;
- no se extraen nombre, teléfono ni email como campos separados.

Sin encabezados:

- se devuelve una única sección `other`;
- se emite `STRUCTURED_RESUME_NO_HEADINGS`;
- se puede confirmar esa sección o elegir análisis de texto plano.

Secciones desconocidas:

- conservan encabezado, contenido, orden y posición;
- se clasifican como `other`;
- reciben advertencia de revisión.

Secciones repetidas:

- se conservan separadas y en orden;
- no se fusionan automáticamente.

## ResumeDocument

`buildParsedResumeFromStructuredDraft` construye:

- `Profile`;
- `Evidence[]`;
- `ResumeDocument`;
- bloques usados por la demo.

`buildResumeDocumentFromStructuredDraft`:

- conserva orden de secciones y bloques;
- conserva Unicode y texto literal de líneas;
- crea IDs deterministas por posición: `section-000`, `section-000-block-000`;
- convierte encabezados en bloques `heading` sin `evidenceIds`;
- enlaza evidencias solo a líneas de cuerpo;
- valida con `buildResumeDocument`;
- devuelve salida congelada por el builder del dominio.

Mapeo hacia `ResumeSectionKind`:

- `contact` -> `header`
- `summary` -> `summary`
- `experience` -> `experience`
- `education` -> `education`
- `skills` -> `skills`
- `languages` -> `languages`
- `certifications` -> `certifications`
- `projects` -> `projects`
- `other` -> `other`

## Pipeline

`runTailoringDemoAnalysis` mantiene el parser plano.

`runTailoringDemoAnalysisWithParsedResume` recibe el `ParsedResumeInput` resuelto y ejecuta el mismo pipeline existente.

El reducer decide antes del análisis:

- `mode === "structured"` -> usa el draft confirmado;
- `mode === "plain"` -> usa `parseResumeText(resumeText)`;
- sin modo -> error seguro.

No se duplican condiciones estructurales dentro de matching, scoring, proposals, review, preview ni export.

El scoring no cambia por la mera existencia de estructura. Sigue basándose en evidencias.

Targeting sí puede beneficiarse del `kind` real de sección porque `resolveTailoringTargets` ya usa compatibilidad de secciones.

## Invalidación

Se invalida estructura y derivados cuando:

- cambia `resumeText`;
- se limpia el currículum;
- empieza o termina una importación de archivo;
- falla una importación;
- cambia la categoría de una sección.

Se conserva la estructura al navegar hacia atrás mientras `resumeText` no cambie.

`reset_demo` limpia todo.

## Interfaz

La etapa `Currículum` mantiene:

- importación DOCX/PDF;
- textarea;
- contador;
- límites;
- mensajes de privacidad.

Añade `Estructura del currículum` con:

- botón `Detectar estructura`;
- resumen con `aria-live`;
- tarjetas de sección;
- etiqueta `Tipo de sección`;
- selector nativo;
- confianza en español;
- warnings visibles;
- botones `Confirmar estructura`, `Usar análisis de texto plano` y `Revisar nuevamente`.

No muestra JSON, IDs técnicos ni nombres internos de acciones.

## Accesibilidad Y Responsive

La UI usa:

- `section` con título;
- `fieldset` y `legend`;
- labels visibles;
- `aria-live`;
- `role="alert"` en errores;
- foco programático al resumen tras detectar;
- controles nativos por teclado.

Las tarjetas se apilan y rompen texto largo en móvil. No se añade framework CSS.

## Privacidad Y Determinismo

El incremento no usa:

- `Date.now`;
- `Math.random`;
- `crypto.randomUUID`;
- storage del navegador;
- red;
- analytics;
- LLM;
- OCR;
- logs de contenido.

Los errores visibles no incluyen contenido del CV, emails, teléfonos, rutas ni stack traces.

## Pruebas

Cobertura añadida:

- contratos y constantes;
- aliases y normalización;
- falsos positivos de encabezados;
- conservación literal de líneas;
- secciones repetidas/desconocidas;
- documento sin encabezados;
- contacto inicial;
- cambio manual de categoría;
- validación runtime;
- construcción de `ResumeDocument`;
- integración con pipeline estructurado/plano;
- invalidación por edición;
- SSR del panel;
- E2E estructurado, plano y de invalidación.

Scripts E2E:

```bash
npm run web:e2e:structure
npm run web:e2e:structure:headed
```

Usan `PLAYWRIGHT_BROWSER_CHANNEL` y el fallback existente `chromium -> chrome -> msedge`.

## Limitaciones

- No extrae campos de contacto.
- No detecta empresas, cargos ni fechas estructuradas.
- No interpreta experiencia implícita.
- No corrige texto.
- No reordena secciones.
- No procesa PDFs escaneados.
- Encabezados ambiguos se conservan como `other` o requieren revisión humana.

