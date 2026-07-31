# Implementation 16 - Tailoring Acceptance Hardening

## Plan Inicial

Objetivo: endurecer el MVP end-to-end de Tailoring UI sin añadir capacidades de producto nuevas. El alcance se centra en mantenibilidad, accesibilidad, estados vacíos, navegación, DOCX, pruebas de aceptación y documentación para usuarios no técnicos.

## Hallazgos Iniciales

- `App.tsx` concentra layout, controlador, nueve etapas y componentes compartidos. Tamaño inicial: 549 líneas.
- La descarga DOCX ya usa importación dinámica y constructor compartido con el renderer Node.
- `TailoringSession` permanece como fuente única de navegación.
- El reducer de demo invalida derivados al cambiar CV u oferta.
- Hay cobertura unitaria y SSR, pero faltan pruebas explícitas de etapas extraídas, foco, oferta sin requisitos, cero coincidencias, error DOCX inyectable y object URL revocado.
- Playwright está declarado en el proyecto, pero el navegador Chromium no estaba instalado en la auditoría anterior.

## Fases

1. Refactorizar `App.tsx` en etapas y componentes compartidos.
2. Crear un controlador/hook para navegación, descarga y foco de etapa.
3. Endurecer guardas y estados vacíos, especialmente oferta sin requisitos y cero propuestas.
4. Añadir estados de procesamiento sin retardos artificiales.
5. Ampliar pruebas unitarias, SSR y DOCX.
6. Intentar pruebas de navegador con Playwright existente si Chromium está disponible o puede instalarse.
7. Crear guía de usuario y checklist de aceptación.
8. Ejecutar validación completa y publicar la rama.

## Decisiones

- No se añade backend, storage, LLM, router, gestor de estado ni framework CSS.
- No se modifican `TailoringSession` ni sus contratos.
- El estado local solo se permite para foco o detalles de presentación no pertenecientes al dominio.
- Si Playwright no puede ejecutar navegador, se mantiene la cobertura pura/SSR y se documenta la limitación.

## Resultado Final

El incremento endurece la demo end-to-end sin añadir capacidades de producto nuevas.

- `App.tsx` queda como coordinador de alto nivel y delega el detalle de cada etapa.
- La lógica de navegación, descarga DOCX y foco vive en `useTailoringDemoController`.
- Las nueve etapas se renderizan desde componentes independientes.
- El título de etapa recibe foco programático al cambiar de paso.
- Los campos de texto exponen contador y descripción accesible.
- La revisión de propuestas expone ayuda, estado de validación y bloqueo de aprobación para candidatos rechazados.
- El análisis rechaza ofertas sin requisitos extraíbles con un mensaje seguro que no copia CV ni oferta.
- Los requisitos sin evidencia no generan acciones positivas.
- La vista previa puede generarse sin cambios cuando no hay propuestas aplicables.
- La descarga DOCX revoca el object URL después de disparar la descarga.
- Se añade un flujo E2E con Playwright existente, sin instalar nuevas dependencias.
- Se documentan una guía de usuario y una checklist manual de aceptación.

## Archivos Principales

- `apps/web/src/App.tsx`
- `apps/web/src/app/use-tailoring-demo-controller.ts`
- `apps/web/src/app/tailoring-demo-constants.ts`
- `apps/web/src/app/tailoring-demo-parsers.ts`
- `apps/web/src/app/tailoring-demo-state.ts`
- `apps/web/src/components/stages/*`
- `tests/unit/tailoring-acceptance-hardening.test.ts`
- `tests/e2e/tailoring-demo-flow.mjs`
- `docs/redesign/TAILORING_DEMO_USER_GUIDE.md`
- `docs/redesign/TAILORING_DEMO_ACCEPTANCE_CHECKLIST.md`

## Pruebas Añadidas

La cobertura añadida verifica:

- render independiente de las nueve etapas;
- foco accesible del título de etapa;
- ausencia de estado paralelo `currentStageId`;
- error seguro para oferta sin requisitos;
- cero coincidencias sin evidencia inventada;
- cero propuestas con vista previa sin cambios;
- revocación de object URL en descarga DOCX;
- ausencia de storage, red, LLM y logging en los nuevos módulos de UI;
- flujo de navegador con análisis, revisión, vista previa y descarga DOCX.

## Limitaciones

La demo sigue siendo local y en memoria. No incluye subida de archivos, backend, OCR, LLM, autenticación, almacenamiento ni persistencia.
