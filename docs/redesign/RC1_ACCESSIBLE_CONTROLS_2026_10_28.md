# Revisión de controles accesibles del 28 de octubre de 2026

## Alcance

Base: `ed0ce3c`. Revisión asistida por Codex de semántica accesible, asociaciones de errores y controles de revisión. Se utiliza Chrome mediante Playwright y su árbol de accesibilidad calculado por CDP. No se presenta como auditoría WCAG completa ni como prueba auditiva con lector de pantalla.

El ejecutable de Narrador está disponible en Windows. No se contó con una captura de voz que permitiera comprobar la pronunciación, el orden o el momento de sus anuncios. La disponibilidad del programa no demuestra compatibilidad auditiva; esa aceptación sigue pendiente.

## Hallazgos y correcciones

Los editores y botones de restauración tenían nombres repetidos sin indicar la propuesta. Las categorías de secciones tenían el mismo nombre, `Tipo de sección`. Ahora los nombres accesibles incluyen posición y contexto del requisito o sección, conservando el texto visible de los controles.

Los fieldsets de decisión reciben un nombre accesible que identifica la propuesta. Sus tres radios comparten un nombre de grupo nativo; cada propuesta tiene uno distinto. No se alteran los IDs ni las decisiones del motor. La navegación con flechas queda limitada al grupo correspondiente.

Los selectores de archivos de currículum y oferta ahora indican su invalidez al fallar e incluyen el mensaje de error específico en su descripción accesible. Limpiar la importación elimina esa asociación y restablece el estado válido. Los mensajes existentes conservan su rol de alerta.

El resumen de validación editable usa `role="status"` y `aria-atomic="true"`. Chrome lo expone como región viva `polite`, por lo que un cambio puede anunciarse sin mover el foco. Los resúmenes de propuestas de solo lectura no se convierten en regiones vivas. Se anuncian etiquetas de validación existentes, no una copia del currículum ni un volcado del candidato.

## Evidencia de navegador

El escenario `tests/e2e/accessible-review-scenario.mjs` se incorpora a los runners RC y Pages. Utiliza datos sintéticos y comprueba:

- errores reales de importación de PDF inválido y oferta vacía;
- propiedad AX `invalid=true` y descripción calculada que contiene el error específico;
- limpieza del error, retirada del mensaje y estado de invalidez restablecido;
- nombres accesibles contextualizados de dos categorías de sección;
- varios grupos de decisión y un editor/restaurador identificable por propuesta;
- nombres nativos de radio compartidos dentro del grupo y distintos entre grupos;
- selección con flecha derecha e independencia de otra propuesta;
- edición inválida, aprobación bloqueada y estado de validación rechazado;
- región AX de rol `status`, propiedad `live=polite` y `atomic=true`;
- descripción calculada del editor que incorpora la validación;
- restauración del texto, retirada de invalidez y aprobación habilitada.

La comprobación con CDP verifica lo que Chrome expone a tecnologías de asistencia. No demuestra que Narrador, NVDA u otro lector lo pronuncie correctamente. El escenario utiliza foco programático como preparación del caso de radios; el recorrido completo exclusivamente por teclado continúa cubierto por su escenario separado.

## Guion pendiente con lector real

Una persona revisora debe registrar lector, versión, navegador y resultado audible con datos sintéticos:

1. Recorrer Inicio y entrar mediante la confirmación de datos ficticios. Comprobar anuncio del título al cambiar de etapa.
2. Provocar un error de importación y volver al selector. Escuchar el mensaje y la descripción del control; comprobar que desaparecen al limpiar.
3. Detectar varias secciones y distinguir sus selectores por el contexto anunciado.
4. Llegar a Revisión y distinguir los editores y grupos de decisión, incluso al usar listas de controles del lector.
5. Elegir decisiones con flechas y comprobar que otra propuesta mantiene su selección.
6. Introducir Markdown en una edición: escuchar la validación y comprobar que no se pierde el foco y que Aceptar queda deshabilitado.
7. Restaurar y comprobar la actualización del estado; terminar, descargar y reiniciar.

No registrar esta parte como aprobada hasta que exista evidencia auditiva real. También siguen pendientes contraste, ampliación de texto, navegación virtual y una auditoría completa de accesibilidad.

## Verificación del incremento

`npm.cmd run release:check` terminó con código 0: 1117 tests en 24 archivos, typechecks raíz y web, build, presupuesto de bundle, audit de producción con cero vulnerabilidades, E2E RC y Pages con el nuevo escenario accesible y artefacto Pages correcto. El nuevo escenario añade comprobaciones de navegador, no nuevos casos unitarios a ese contador. No se modificaron dependencias, navegación ni motores del núcleo.
