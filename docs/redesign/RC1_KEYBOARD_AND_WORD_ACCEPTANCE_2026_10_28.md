# Aceptación de teclado y Word del 28 de octubre de 2026

## Alcance y resultado

Revisión asistida por Codex sobre la base `3a82df9`, con datos sintéticos. Se corrige un defecto de foco al reiniciar y se amplía el E2E de teclado a las nueve etapas. Se verifica además una muestra DOCX de una página en Microsoft Word de escritorio. Estos resultados no equivalen a una auditoría WCAG completa ni a compatibilidad universal de documentos.

## Defecto de foco reproducido

Tras completar el flujo y pulsar `Nueva adaptación`, la versión publicada dejaba `document.activeElement` en `BODY`, sin ID. El botón que tenía el foco desaparecía al remontar la sesión.

El mismo caso en Vite de desarrollo dejaba el foco en `H2#stage-title`: React StrictMode repetía el efecto inicial y ocultaba el problema. Por ello, la regresión se verifica sobre `vite preview`, también con la base de GitHub Pages.

La corrección distingue entre carga inicial, cambio de etapa y reinicio explícito. La carga inicial conserva el acceso mediante el skip link, los cambios de etapa enfocan su título y una sesión reiniciada enfoca el título de Inicio. No se añade una segunda fuente de verdad para la navegación ni se conserva información de la sesión anterior.

## Cobertura de teclado

El escenario de RC emplea Tab, Enter, Espacio y flechas; no usa clics ni llamadas a `focus()` para recorrer este escenario. Comprueba:

- skip link como primer control y destino en el contenido principal;
- confirmación de datos ficticios y comienzo;
- introducción de texto, detección y confirmación de estructura;
- selección de categoría mediante flechas;
- oferta, análisis, evidencias, propuestas y revisión;
- selección de rechazo con flecha derecha en los grupos de radio;
- aplicación de decisiones y vista previa;
- retroceso y avance conservando la sesión;
- descarga con nombre esperado y validación del ZIP/OOXML;
- nueva adaptación, foco en Inicio y confirmación desmarcada;
- segunda entrada a Currículum con texto vacío.

Se mantiene además el escenario de reinicio mediante clic para comprobar el foco con ambas modalidades. Esta ampliación no valida un lector de pantalla, todos los atajos del navegador, ni el diálogo nativo de selección de archivos mediante teclado.

## DOCX abierto en Word

Entorno: Windows y Microsoft Word 16.0.20527.20088. Se abrió la muestra sintética `curriculum-adaptado.docx`, generada tras la corrección de encabezados, desde una carpeta temporal local. SHA-256 del archivo revisado:

```text
89576C8F0894A473CFD9CE048651DBCD54EDD0D7DBDB212116E1FBBE8D67898B
```

La inspección se realizó en Vista protegida, sin habilitar edición ni cambiar ajustes de seguridad. Word abrió el documento sin solicitar reparación. La interfaz mostró Página 1 de 1 y el contenido completo de esa página fue legible:

- PERFIL PROFESIONAL y su párrafo;
- EXPERIENCIA con React, TypeScript, Vitest y Git;
- HABILIDADES con React, TypeScript y Git.

Los encabezados aparecen una sola vez. Se observaron acentos correctos, separación entre secciones y ausencia de solapes, texto cortado o IDs técnicos visibles en esta muestra. El texto accesible de Word coincidió con el contenido sintético esperado. Se cerró la ventana de prueba sin editar el archivo.

Resultado: compatibilidad básica de apertura y lectura aprobada con limitaciones para esta muestra en esta versión de Word. La muestra incluye una aprobación sin cambio textual y dos rechazos: no demuestra la representación visual de una reescritura editada. Siguen pendientes documentos largos, paginación de múltiples páginas, otros lectores y una ronda con contenido editado aprobado.

## Pendientes de aceptación

- Prueba con lector de pantalla y auditoría manual completa de accesibilidad.
- Muestras DOCX largas y con ediciones aprobadas en Word.
- LibreOffice, Google Docs, Firefox y Safari siguen sin aprobación adicional en esta ronda.
- El uso con datos reales sigue sin estar aprobado.

No se interpreta el resultado como cierre completo del producto. La evidencia permite cerrar el defecto de reinicio y demostrar lectura básica de un DOCX real, manteniendo explícitos los límites anteriores.

## Verificación técnica

`npm.cmd run release:check` finalizó con código 0: 1115 tests en 23 archivos, typechecks raíz y web, build, presupuesto de bundle, audit de producción con cero vulnerabilidades, E2E RC y Pages con Chrome y comprobación del artefacto Pages. El escenario de teclado ampliado se ejecutó en ambas variantes de build. `git diff --check` pasó. No se añadieron dependencias ni se modificaron los motores de matching, scoring o exportación.
