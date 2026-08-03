# Tailoring Demo Acceptance Checklist

Checklist para validar el MVP end-to-end antes de incorporar subida de archivos, LLM, backend o despliegue.

## Navegación

- [ ] Solo una etapa aparece como actual.
- [ ] El stepper no permite navegación directa.
- [ ] `Continuar` permanece bloqueado cuando falta información obligatoria.
- [ ] `Anterior` permite volver sin perder datos de la sesión actual.
- [ ] El foco se mueve al título de cada etapa al avanzar o retroceder.

## Entrada De Datos

- [ ] El campo de currículum conserva el texto pegado.
- [ ] DOCX válido importa texto localmente. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] PDF válido importa texto seleccionable localmente. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] PDF multipágina conserva orden de páginas. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] PDF sin texto muestra ausencia de OCR. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] PDF protegido se clasifica con error seguro. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] DOCX inválido se rechaza. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Tipos renombrados se rechazan por firma. Automatizado: `tests/unit/resume-file-import.test.ts`, `npm run web:e2e:import`.
- [ ] Archivo demasiado grande se rechaza antes de procesar. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Texto superior a 24.000 caracteres queda editable pero bloquea avanzar. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Editar después de importar invalida análisis previo. Automatizado: `tests/unit/resume-file-import.test.ts`.
- [ ] Seleccionar dos archivos rápidamente conserva solo el último resultado. Manual; contrato protegido por contador local en `useTailoringDemoController`.
- [ ] El campo de oferta conserva el texto pegado.
- [ ] Los contadores de caracteres se actualizan al escribir.
- [ ] No se muestran datos pegados dentro de mensajes de error.

## Análisis

- [ ] Una oferta con requisitos concretos genera resultados revisables.
- [ ] Una oferta sin requisitos extraíbles muestra un error seguro.
- [ ] Un requisito no cubierto no genera evidencia positiva.
- [ ] Un requisito desconocido no genera afirmaciones positivas.
- [ ] El orden de resultados es estable.

## Propuestas Y Revisión

- [ ] Las propuestas muestran texto original y texto sugerido.
- [ ] Cada propuesta puede aprobarse, rechazarse o editarse.
- [ ] Una edición inválida muestra revisión o rechazo.
- [ ] Una edición rechazada no puede aprobarse.
- [ ] Si no hay propuestas aplicables, se puede generar vista previa sin cambios.
- [ ] Si todas las propuestas se rechazan, la vista previa conserva el texto original.

## Vista Previa Y DOCX

- [ ] La vista previa muestra el currículum resultante.
- [ ] El botón de descarga solo aparece cuando hay vista previa.
- [ ] La descarga usa el nombre `curriculum-adaptado.docx`.
- [ ] El DOCX descargado no contiene IDs internos visibles.
- [ ] El DOCX descargado se puede abrir con un lector compatible.

## Accesibilidad Y Responsive

- [ ] Hay un único `aria-current="step"`.
- [ ] Los campos tienen etiquetas accesibles.
- [ ] Los mensajes de error usan `role="alert"`.
- [ ] Las áreas editables exponen ayuda y estado de validación.
- [ ] La interfaz es usable en móvil, tablet y escritorio.

## Privacidad

- [ ] No hay llamadas de red de producto.
- [ ] No hay `localStorage`.
- [ ] No hay `sessionStorage`.
- [ ] No hay cookies.
- [ ] No hay timestamps, UUIDs ni `Math.random` en el flujo de demo.
- [ ] No se registran CV u oferta en consola.
- [ ] No se registran nombres de archivo ni texto importado. Automatizado: `tests/unit/resume-file-import.test.ts`.

## Automatización

- [ ] `npm test` pasa.
- [ ] `npm run typecheck` pasa.
- [ ] `npm run web:typecheck` pasa.
- [ ] `npm run web:build` pasa.
- [ ] `npm audit --omit=dev` informa cero vulnerabilidades de producción.
- [ ] `npm run web:e2e` pasa con un canal soportado de Playwright.
- [ ] `npm run web:e2e:import` pasa con DOCX, PDF, PDF sin texto y archivo inválido.
- [ ] `npm run web:e2e:import:headed` abre el navegador elegido y completa el flujo de importación.
- [ ] `npm run web:e2e:headed` abre el navegador elegido en modo visible y completa el flujo.
- [ ] El fallback automático intenta `chromium`, luego `chrome`, luego `msedge`.
- [ ] `PLAYWRIGHT_BROWSER_CHANNEL` acepta únicamente `chromium`, `chrome` o `msedge`.
- [ ] El E2E informa el canal usado con `E2E_BROWSER_CHANNEL=<canal>`.
- [ ] El E2E no requiere `chromium-headless-shell`.

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
