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

Pendiente de completar al final del incremento.
