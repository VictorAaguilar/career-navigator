# Revisión de aceptación RC1 del 28 de octubre de 2026

## Resultado

Decisión de esta ronda: `requiere_correcciones` para cerrar la aceptación completa del producto. La demo sintética sigue siendo utilizable. Esta revisión asistida por Codex no sustituye pruebas con usuarios, lector de pantalla o lectores DOCX reales.

Base revisada: `175b700`. Sitio revisado: https://victoraaguilar.github.io/career-navigator/. Correcciones verificadas también en servidor local. Entorno Windows, Playwright con canal Chrome, versión de navegador 156.0.8078.73. Datos exclusivamente sintéticos.

## Recorrido y evidencia

Se completaron las nueve etapas: confirmación de datos ficticios, texto de CV, detección y confirmación de estructura, oferta, análisis, evidencias, propuestas, revisión, vista previa y descarga. Se aceptó una propuesta sin cambio textual y se rechazaron dos. No se interpreta la aceptación como una mejora real del CV: el candidato aceptado conservaba el texto original.

El CV contiene tres secciones (PERFIL PROFESIONAL, EXPERIENCIA y HABILIDADES), experiencia en React, TypeScript, Vitest y Git. La oferta requiere React, TypeScript, Git y Docker. El resultado muestra 75/100 y Docker sin evidencia; no se añade Docker al currículum.

Se capturaron las nueve etapas a 320, 375, 768, 1024 y 1440 px (45 vistas por recorrido). Las comprobaciones geométricas no detectaron desbordamiento horizontal del documento. Esto no demuestra por sí solo ausencia de solapes ni accesibilidad.

Se inspeccionaron visualmente muestras de Inicio en escritorio, estructura a 320 px, oferta y revisión a 375 px, análisis a 768 px, evidencias a 1024 px, propuestas y vista previa a 1440 px y descarga a 375 px. No se declara una inspección visual individual de las 45 capturas ni aprobación de toda la matriz manual.

Capturas y resultados de la última pasada local disponibles en `C:/Users/tester/AppData/Local/Temp/career-qa-2026-10-28/`. Son evidencia temporal local, no artefactos versionados ni enlaces públicos. `results.json` registra navegador, viewports, ausencia de errores de página y nombre de descarga. El harness de esta ronda también es temporal.

## Hallazgos corregidos

1. Las descripciones de ocho etapas todavía hablaban del shell y de funciones futuras. En Descargar se afirmaba que no se generaban documentos justo encima del botón funcional. Se actualizaron para describir el flujo actual.
2. Inicio afirmaba que no existía carga de archivos. Se aclaró el procesamiento local de archivos importados.
3. La etiqueta Currículum se partía entre líneas en el stepper móvil. Se amplió el ancho de cada etapa de 9 a 11 rem; la comprobación visual posterior muestra la palabra completa.

No se cambiaron IDs, orden de etapas, navegación, contratos, motores ni dependencias.

## Pendientes y límites

| Área | Resultado de la ronda | Acción para cerrar |
| --- | --- | --- |
| Flujo sintético principal | Completa análisis, decisiones y descarga | Mantener E2E de regresión |
| Responsive | Corregida etiqueta móvil; muestras revisadas | Revisar visualmente toda la matriz con usuarios |
| Encabezados duplicados | Corregido en esta rama para encabezado inicial coincidente | Mantener pruebas de conservación literal y recuento de párrafos |
| Stepper móvil | Corregido el seguimiento de la etapa actual | Mantener E2E al avanzar y redimensionar |
| Accesibilidad | Inspección accesible y E2E de teclado; sin auditoría completa | Validación con lector de pantalla y revisión humana |
| DOCX | Descarga y contenido OOXML comprobados | Abrir en Word o LibreOffice y revisar todas las páginas |
| Firefox y Safari | No revisados | Mantener fuera de matriz aprobada |
| Datos personales reales | No aprobados | Cerrar condiciones de producto y privacidad |

### Reproducción de encabezados duplicados

Reproducción inicial en `175b700`: pegar `EXPERIENCIA` seguido de una línea de experiencia y confirmar la estructura. La vista previa añadía un título de sección y repetía el encabezado como bloque original. También ocurría con PERFIL PROFESIONAL y HABILIDADES; la extracción de `word/document.xml` confirmó la repetición.

Corrección posterior en esta rama: cuando el primer bloque es `heading` y su texto efectivo coincide literalmente con la etiqueta de sección, se presenta una vez como título. El bloque permanece en los documentos original, adaptado y de exportación, con sus IDs y trazabilidad. No se deduplican párrafos, títulos posteriores ni variantes de mayúsculas o espacios. La vista previa y el renderer comparten el predicado.

El resumen DOCX incorpora el contador obligatorio `reusedSectionHeadings` y conserva igualdades exactas entre secciones, bloques originales y párrafos emitidos. Se probaron secciones mixtas, secciones con solo un encabezado, Unicode, espacios, tabulaciones, saltos de línea, XML escapado, inmutabilidad y determinismo.

El stepper desplaza solo su área horizontal al avanzar o redimensionar para revelar la etapa actual. No cambia el foco ni permite navegación directa. Las capturas posteriores de Descargar a 375 px y Evidencias a 320 px muestran la etapa actual visible.

### DOCX y lectores reales

Se descargó `curriculum-adaptado.docx`, un ZIP con 22 entradas. La primera pasada contenía encabezados repetidos; la nueva descarga tras la corrección contiene cada encabezado una sola vez y conserva el texto sintético. Se intentó renderizar con el renderer de documentos del entorno; falló porque `soffice.exe` no está disponible. No se instaló software ni se sustituyó el lector. El archivo no se ha validado visualmente en Word, LibreOffice ni Google Docs. La inspección de XML no equivale a comprobar apertura, paginación o tipografía.

## Verificación automatizada

`npm.cmd ci` completó la instalación bloqueada. El audit completo de instalación informó nueve vulnerabilidades del árbol total; no se ejecutó audit fix ni se actualizaron dependencias.

La validación final `npm.cmd run release:check` sobre las correcciones, incluidos encabezados y seguimiento móvil, terminó con código 0: 1115 tests en 23 archivos, typechecks raíz y web, build, presupuesto de bundle, audit de producción con cero vulnerabilidades, E2E RC, E2E Pages y artefacto Pages (`PAGES_ARTIFACT_OK 10 files`). Se añadieron 14 pruebas unitarias de regresión y comprobaciones E2E de ausencia de encabezados repetidos y visibilidad de la etapa actual. El public smoke de la base publicada también pasó (`assets=2 attempts=1`); las nuevas correcciones aún requieren integración y despliegue. El audit total de instalación y el audit de producción tienen alcances diferentes; no se afirma que el árbol de desarrollo esté libre de vulnerabilidades.

El servidor local usado para las capturas se detuvo al terminar. El gate limpia el build temporal; las evidencias de esta ronda quedan fuera del repositorio en la ruta temporal indicada.

La ronda no aumenta por sí sola el porcentaje estimado de preparación. Tras corregir encabezados duplicados y seguimiento móvil, sigue pendiente validar el DOCX en un lector real y cerrar la revisión manual de accesibilidad antes de declarar completada la aceptación del producto.
