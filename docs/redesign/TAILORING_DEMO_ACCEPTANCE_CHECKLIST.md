# Tailoring Demo Acceptance Checklist

Checklist para validar el MVP end-to-end antes de incorporar LLM, backend o despliegue.

## Navegación

- [ ] Solo una etapa aparece como actual. Automatizado: `npm run web:e2e`, `npm run web:e2e:structure`.
- [ ] El stepper no permite navegación directa. Automatizado: `tests/unit/tailoring-session-contracts.test.ts`.
- [ ] `Continuar` permanece bloqueado cuando falta información obligatoria. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] `Anterior` permite volver sin perder datos de la sesión actual. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] El foco se mueve al título de cada etapa al avanzar o retroceder. Manual.

## Entrada De Datos

- [ ] El campo de currículum conserva el texto pegado. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] DOCX válido importa texto localmente. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] PDF válido importa texto seleccionable localmente. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] PDF multipágina conserva orden de páginas. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] PDF sin texto muestra ausencia de OCR. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] PDF protegido se clasifica con error seguro. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] DOCX inválido se rechaza. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Tipos renombrados se rechazan por firma. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] Archivo demasiado grande se rechaza antes de procesar. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Texto superior a 24.000 caracteres queda editable pero bloquea avanzar. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Editar después de importar invalida análisis y estructura. Automatizado: `tests/unit/resume-file-import.test.ts`, `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Seleccionar dos archivos rápidamente conserva solo el último resultado. Manual; contrato protegido por contador local en `useTailoringDemoController`.
- [ ] El campo de oferta conserva el texto pegado. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Los contadores de caracteres se actualizan al escribir. Automatizado: `npm run web:e2e`.
- [ ] No se muestran datos pegados dentro de mensajes de error. Automatizado: `tests/unit/tailoring-acceptance-hardening.test.ts`.

## Parsing Estructural

- [ ] Reconoce `Contacto`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Reconoce `Perfil profesional`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Reconoce `Experiencia`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Reconoce `Formación`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Reconoce `Habilidades`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Reconoce `Idiomas`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Reconoce `Certificaciones`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Reconoce `Proyectos`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Reconoce aliases españoles. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Reconoce aliases ingleses. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Documento sin encabezados produce `STRUCTURED_RESUME_NO_HEADINGS`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Encabezado desconocido queda como `Otra`. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Secciones repetidas se conservan separadas. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.
- [ ] Cambiar manualmente una categoría conserva texto y orden. Automatizado: `tests/unit/structured-resume-parsing.test.ts`, `npm run web:e2e:structure`.
- [ ] Confirmar estructura permite avanzar. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`, `npm run web:e2e:structure`.
- [ ] Elegir parser plano permite avanzar. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`, `npm run web:e2e`.
- [ ] Cambiar `resumeText` invalida estructura. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`, `npm run web:e2e:structure`.
- [ ] Cambiar una categoría invalida confirmación y análisis. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Importar DOCX permite detectar y confirmar estructura. Automatizado: `npm run web:e2e:import`.
- [ ] Importar PDF deja texto editable para detectar estructura. Automatizado: `tests/unit/resume-file-import.test.ts`; revisión visual manual recomendada.
- [ ] No se inventa texto, cargos, empresas, fechas ni habilidades. Automatizado: `tests/unit/structured-resume-parsing.test.ts`.

## Análisis

- [ ] Una oferta con requisitos concretos genera resultados revisables. Automatizado: `npm run web:e2e`, `npm run web:e2e:structure`.
- [ ] Una oferta sin requisitos extraíbles muestra un error seguro. Automatizado: `tests/unit/tailoring-acceptance-hardening.test.ts`.
- [ ] Un requisito no cubierto no genera evidencia positiva. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`, `npm run web:e2e:structure`.
- [ ] Un requisito no cubierto muestra `No se encontró evidencia en el currículum.` sin ubicación inventada. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] Un requisito desconocido no genera afirmaciones positivas. Automatizado: `tests/unit/tailoring.test.ts`.
- [ ] El orden de resultados es estable. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Scoring no cambia por mera existencia de estructura. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Las ubicaciones de evidencia estructurada muestran sección y bloque. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] Las ubicaciones de evidencia en `Otra` muestran encabezado seguro cuando existe. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] Las ubicaciones de texto plano muestran párrafo y advertencia aproximada. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] Las explicaciones de ubicación no modifican scoring ni matching. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.

## Propuestas Y Revisión

- [ ] Las propuestas muestran texto original y texto sugerido. Automatizado: `npm run web:e2e`.
- [ ] Las propuestas muestran `Ubicación objetivo`. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] Las propuestas muestran `Por qué se propone aquí`. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] Los targets exactos se explican desde evidencia y resolución existente. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] Los targets aproximados muestran advertencia en modo plano. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] Los targets no resueltos no eligen un bloque arbitrario. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] Cada propuesta puede aprobarse, rechazarse o editarse. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Una edición inválida muestra revisión o rechazo. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Una edición rechazada no puede aprobarse. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] Una propuesta editada y aceptada conserva el mismo target. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] Una propuesta rechazada no figura como aplicada. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] Si no hay propuestas aplicables, se puede generar vista previa sin cambios. Automatizado: `tests/unit/tailoring-acceptance-hardening.test.ts`.
- [ ] Si todas las propuestas se rechazan, la vista previa conserva el texto original. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.

## Vista Previa Y DOCX

- [ ] La vista previa muestra el currículum resultante. Automatizado: `npm run web:e2e`, `npm run web:e2e:structure`.
- [ ] La vista previa muestra cambios aplicados con ubicación y requisito relacionado. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] La vista previa separa cambios no aplicados de cambios aplicados. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] El botón de descarga solo aparece cuando hay vista previa. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] El botón visible dice `Descargar currículum adaptado`. Automatizado: `tests/unit/release-candidate-stabilization.test.ts`.
- [ ] La descarga usa el nombre `curriculum-adaptado.docx`. Automatizado: `npm run web:e2e`, `npm run web:e2e:rc`.
- [ ] El DOCX descargado no contiene IDs internos visibles. Automatizado: `npm run web:e2e`, `npm run web:e2e:structure`.
- [ ] El DOCX descargado no contiene metadata de ubicación de UI. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.
- [ ] El DOCX del Release Candidate contiene los cambios aprobados y excluye propuestas rechazadas. Automatizado: `npm run web:e2e:rc`.
- [ ] El DOCX descargado se puede abrir con un lector compatible. Manual.

## Accesibilidad Y Responsive

- [ ] Hay un único `aria-current="step"`. Automatizado: `npm run web:e2e`, `npm run web:e2e:structure`.
- [ ] Los campos tienen etiquetas accesibles. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Los mensajes de error usan `role="alert"`. Automatizado: `tests/unit/tailoring-acceptance-hardening.test.ts`.
- [ ] El panel estructural usa `fieldset`, `legend`, labels visibles y `aria-live`. Automatizado: `tests/unit/resume-file-import.test.ts`; revisión manual recomendada.
- [ ] Las áreas editables exponen ayuda y estado de validación. Manual.
- [ ] La interfaz no produce overflow horizontal general en 320 px, 375 px, 768 px, 1024 px y 1440 px. Automatizado: `npm run web:e2e:rc`; revisión visual manual recomendada.
- [ ] Las ubicaciones rompen línea y no causan scroll horizontal general en móvil. Manual.
- [ ] Las advertencias de ubicación se entienden sin depender de color ni iconos. Automatizado parcialmente: `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] El flujo básico puede avanzar por teclado hasta confirmar estructura. Automatizado: `npm run web:e2e:rc`; auditoría WCAG manual pendiente.

## Privacidad

- [ ] No hay llamadas de red de producto. Automatizado: `npm run web:e2e:import`, `npm run web:e2e:structure`, `npm run web:e2e:targeting`.
- [ ] No hay `localStorage`. Automatizado: `tests/unit/resume-file-import.test.ts`, `tests/unit/structured-resume-parsing.test.ts`.
- [ ] No hay `sessionStorage`. Automatizado: `tests/unit/resume-file-import.test.ts`, `tests/unit/structured-resume-parsing.test.ts`.
- [ ] No hay cookies. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`.
- [ ] No hay timestamps, UUIDs ni `Math.random` en el flujo de demo. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`, `tests/unit/structured-resume-parsing.test.ts`, `tests/unit/structured-targeting-explanations.test.ts`.
- [ ] No se registran CV u oferta en consola. Automatizado: `tests/unit/tailoring-ui-demo.test.ts`, `npm run web:e2e:structure`.
- [ ] No se registran nombres de archivo ni texto importado. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] No se muestran IDs técnicos como texto visible en trazabilidad. Automatizado: `tests/unit/structured-targeting-explanations.test.ts`, `npm run web:e2e:targeting`.

## Automatización

- [ ] `npm test` pasa.
- [ ] `npm run typecheck` pasa.
- [ ] `npm run web:typecheck` pasa.
- [ ] `npm run web:build` pasa.
- [ ] `npm run web:bundle:check` pasa y mantiene PDF.js, `pdf.worker`, JSZip y DOCX fuera del bundle inicial.
- [ ] `npm audit --omit=dev` informa cero vulnerabilidades de producción.
- [ ] `npm run web:e2e` pasa con un canal soportado de Playwright.
- [ ] `npm run web:e2e:import` pasa con DOCX, PDF, PDF sin texto y archivo inválido.
- [ ] `npm run web:e2e:structure` pasa con flujo estructurado, parser plano e invalidación.
- [ ] `npm run web:e2e:structure:headed` abre el navegador elegido y completa el flujo estructurado.
- [ ] `npm run web:e2e:targeting` pasa con flujo estructurado, trazabilidad y DOCX.
- [ ] `npm run web:e2e:targeting:headed` abre el navegador elegido y completa el flujo de trazabilidad.
- [ ] `npm run web:e2e:rc` pasa contra `vite preview`.
- [ ] `npm run web:e2e:rc:headed` abre el navegador elegido y completa el flujo RC.
- [ ] `npm run release:check` pasa tras `npm ci`.
- [ ] El fallback automático intenta `chromium`, luego `chrome`, luego `msedge`.
- [ ] `PLAYWRIGHT_BROWSER_CHANNEL` acepta únicamente `chromium`, `chrome` o `msedge`.
- [ ] El E2E informa el canal usado con `E2E_BROWSER_CHANNEL=<canal>`.
- [ ] El E2E no requiere `chromium-headless-shell`.

## Release Candidate

- [ ] Chrome queda aprobado para RC1 con `PLAYWRIGHT_BROWSER_CHANNEL=chrome`.
- [ ] Microsoft Edge queda aprobado para RC1 con `PLAYWRIGHT_BROWSER_CHANNEL=msedge`.
- [ ] Chromium completo queda soportado por el runner, pero requiere instalación manual si el entorno no lo tiene disponible.
- [ ] Firefox no queda aprobado en RC1.
- [ ] Safari no queda probado en RC1.
- [ ] `apps/web/dist` está ignorado y no se comitea.
- [ ] `test-results` y `playwright-report` están ignorados o eliminados antes del commit.
- [ ] `docs/redesign/LOCAL_INSTALLATION_AND_VALIDATION.md` describe instalación, validación y limpieza.
- [ ] `docs/redesign/RELEASE_CANDIDATE_READINESS.md` describe estados aprobados, pendientes y fuera de alcance.
- [ ] `docs/redesign/RELEASE_NOTES_RC1.md` lista garantías, limitaciones y riesgos pendientes.

Si falta Chromium completo en Windows, instálalo con:

```bash
npx.cmd --no-install playwright install --no-shell chromium
```

También puede usarse Google Chrome o Microsoft Edge instalado mediante:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
npm.cmd run web:e2e
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```
