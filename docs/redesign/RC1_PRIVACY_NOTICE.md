# RC1 Privacy Notice

Nota de privacidad para la Release Candidate pública del CV Tailoring Agent.

## Estado De La RC

RC1 es una demo pública de evaluación con datos sintéticos.

No está aprobada para CV reales, ofertas privadas, datos personales, datos sensibles, producción pública ni uso multiusuario.

La pantalla inicial debe mostrar un aviso visible equivalente a:

```text
Modo demo público: no pegues datos reales, CV personales ni ofertas confidenciales.
```

## Qué Procesa

La demo puede procesar localmente en el navegador:

- texto pegado de currículum;
- archivos DOCX/PDF seleccionados por la persona usuaria;
- texto pegado de una oferta;
- archivos TXT/Markdown de oferta;
- decisiones manuales de revisión;
- descarga local de `curriculum-adaptado.docx`.

## Qué No Hace

RC1 no incorpora:

- backend;
- cuentas;
- autenticación;
- almacenamiento persistente;
- analítica;
- telemetría de producto;
- llamadas LLM;
- OCR;
- subida de archivos a un servidor de producto.

## Alcance De La Privacidad Local

Los datos introducidos viven en memoria de la pestaña durante la sesión de navegador.

La demo no guarda sesiones. Para descartar el estado en memoria, cerrar o recargar la pestaña.

El DOCX descargado se genera localmente y queda bajo control de la persona usuaria después de descargarlo.

## Sitio Público

GitHub Pages es público. Aunque la RC usa `noindex,nofollow` y `robots.txt` con `Disallow: /`, esos mecanismos no son controles de acceso.

Por tanto:

- no usar datos reales;
- no pegar información sensible;
- no subir archivos personales reales;
- no considerar la URL pública como entorno privado.

## Antes De Datos Reales

Antes de permitir datos reales debe existir:

- política de privacidad publicada;
- decisión explícita sobre persistencia o ausencia de persistencia;
- explicación visible y revisada sobre archivos, textos y descargas;
- criterio de borrado o cierre de sesión;
- revisión legal o de producto según corresponda.
