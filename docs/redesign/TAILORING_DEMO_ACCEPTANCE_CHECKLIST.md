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

## Automatización

- [ ] `npm test` pasa.
- [ ] `npm run typecheck` pasa.
- [ ] `npm run web:typecheck` pasa.
- [ ] `npm run web:build` pasa.
- [ ] `npm audit --omit=dev` informa cero vulnerabilidades de producción.
- [ ] `npm run web:e2e` pasa cuando Chromium está instalado.
