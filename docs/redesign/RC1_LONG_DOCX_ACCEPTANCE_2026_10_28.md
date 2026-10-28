# Aceptación de DOCX largo con edición aprobada

## Resultado y alcance

Ronda asistida por Codex del 28 de octubre de 2026, sobre la base `a535a5e`. Se generó una muestra sintética desde el sitio público y se abrió en Microsoft Word 16.0.20527.20088 para Windows, en Vista protegida, sin habilitar edición ni modificar la seguridad. Word abrió el archivo sin solicitar reparación y mostró cuatro páginas.

Resultado: aprobado con limitaciones para esta muestra de cuatro páginas y esta versión de Word. No equivale a soporte de cualquier documento, lector o plantilla de origen.

## Fixture reproducible

`tests/e2e/long-docx-scenario.mjs` contiene una muestra compartida por E2E y pruebas unitarias. Incluye tres secciones, 72 párrafos numerados de proyectos sintéticos y un párrafo objetivo con dos frases. La oferta requiere React y TypeScript. No contiene datos personales ni añade competencias a las evidencias.

Texto original objetivo:

```text
Desarrollo con React y TypeScript. Pruebas con Vitest.
```

Edición manual aprobada:

```text
Pruebas con Vitest. Desarrollo con React y TypeScript.
```

La edición cambia el orden de las dos frases existentes. Se aprueba explícitamente esa propuesta y se rechazan las restantes. Se verifica el estado visible `Decisión: Editada y aceptada`.

## Comprobaciones automáticas

El escenario recorre las nueve etapas de la aplicación. Compara los 78 textos de la vista previa (títulos y párrafos) contra el fixture esperado, en orden, y repite la comparación con los textos de `word/document.xml` del archivo descargado. Comprueba el nombre de descarga, la presencia de la edición y la ausencia de la secuencia original reemplazada. Esta extracción está limitada al fixture sin metacaracteres XML ni controles en línea; no se presenta como parser OOXML general.

Los casos unitarios adicionales comprueban:

- aplicación de la edición aprobada, un bloque reescrito y conservación de los 72 párrafos;
- conservación del original cuando la edición se rechaza;
- ausencia de mutación del resultado de análisis y determinismo de la aplicación repetida.

El escenario se ejecuta tanto en `web:e2e:rc` como en `web:e2e:pages`; utiliza las descargas temporales y limpieza del runner existente. La copia abierta en Word se generó por el mismo escenario desde el sitio publicado, con Chrome 156.0.8078.73, sin errores de página.

## Inspección en Word

Archivo local de evidencia: `C:/Users/tester/AppData/Local/Temp/career-long-docx-VeZ8xp/long-edited-curriculum.docx`. No está versionado ni es un enlace público. SHA-256:

```text
80B6E1CF23A155F82F098908A999BD6A10E4BFEF6E7CC7494B32860988DF9DF5
```

Se inspeccionó la primera página a zoom 100 %, incluida la frase editada, los encabezados y los primeros proyectos. Después se revisó la composición de las cuatro páginas con vista de página completa (35 %): no se observaron solapes, desbordamiento de márgenes o encabezados duplicados. La última página conserva los proyectos 070, 071 y 072, seguidos de FORMACIÓN y su texto.

La comparación automatizada demuestra conservación exacta del contenido del fixture. La revisión a 35 % comprueba composición general; no se afirma haber corregido o leído visualmente cada palabra de las páginas intermedias a 100 %. El texto accesible de Word confirmó el cierre del documento. No se guardaron modificaciones en el archivo.

## Verificación técnica

`npm.cmd run release:check` finalizó con código 0: 1117 tests en 24 archivos, typechecks raíz y web, build, presupuesto de bundle, audit de producción con cero vulnerabilidades, E2E RC, E2E Pages y comprobación del artefacto Pages. No se modificaron módulos de producción ni dependencias: el incremento añade cobertura de aceptación y evidencia documental.

## Límites restantes

- Auditoría con lector de pantalla y accesibilidad manual completa.
- Otros lectores y versiones de Word, fuentes y configuraciones regionales.
- Importación de documentos complejos, límites máximos y casos adicionales de paginación.
- Aprobación para tratamiento de datos reales, que sigue fuera del alcance de esta RC.

Las rondas de una página y cuatro páginas reducen el riesgo de exportación, pero no cierran por sí solas la aceptación completa del producto.
