# Tailoring Demo User Guide

Esta guía describe cómo probar la demo local del CV Tailoring Agent sin subir archivos, sin cuenta, sin backend y sin llamadas a LLM.

## Alcance

La demo permite:

- pegar texto de currículum;
- pegar texto de oferta laboral;
- ejecutar un análisis determinista local;
- revisar requisitos y evidencias encontradas;
- comparar propuestas sugeridas;
- aprobar, rechazar o editar propuestas;
- generar una vista previa;
- descargar un DOCX desde el navegador.

La demo no permite todavía:

- subir archivos DOCX o PDF;
- leer archivos con OCR;
- usar un LLM;
- guardar sesiones;
- enviar datos a una API;
- crear cuentas;
- persistir información personal.

## Cómo Ejecutarla

Instala el proyecto con las dependencias bloqueadas:

```bash
npm ci
```

Arranca la aplicación web:

```bash
npm run web:dev
```

Abre la URL que muestre Vite, normalmente:

```text
http://localhost:5173/
```

## Flujo Manual

1. Pulsa `Comenzar`.
2. Pega el texto del currículum.
3. Pega el texto de la oferta laboral.
4. Ejecuta el análisis determinista.
5. Revisa requisitos y evidencias.
6. Revisa las propuestas.
7. Aprueba, rechaza o edita cada propuesta.
8. Genera la vista previa.
9. Descarga el DOCX.

## Casos Esperados

Si el currículum está vacío, la demo no avanza desde la etapa de currículum.

Si la oferta está vacía, la demo no avanza desde la etapa de oferta.

Si la oferta no contiene requisitos extraíbles, el análisis muestra un error seguro y no repite el contenido privado pegado por el usuario.

Si hay requisitos sin evidencia, se muestran como brechas. No se inventa evidencia positiva.

Si no hay propuestas aplicables, la vista previa se genera sin cambios.

Si una edición contiene un patrón rechazado por la validación, no puede aprobarse.

## Privacidad

La interfaz muestra el aviso:

```text
Tus datos no se almacenan en esta versión.
```

La demo mantiene el estado en memoria del navegador. No usa `localStorage`, `sessionStorage`, cookies, red, backend, telemetría ni persistencia.

## Prueba E2E

La prueba de navegador se ejecuta con:

```bash
npm run web:e2e
```

También existe modo visible:

```bash
npm run web:e2e:headed
```

El script levanta Vite en `127.0.0.1:5174`, usa datos sintéticos, descarga el DOCX en un directorio temporal del sistema y elimina ese directorio al terminar.
