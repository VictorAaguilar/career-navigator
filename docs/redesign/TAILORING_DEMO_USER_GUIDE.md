# Tailoring Demo User Guide

Esta guía describe cómo probar la demo local del CV Tailoring Agent sin subir archivos, sin cuenta, sin backend y sin llamadas a LLM.

## Alcance

La demo permite:

- pegar texto de currículum;
- importar un currículum DOCX;
- importar un PDF con texto seleccionable;
- detectar una estructura revisable del currículum;
- cambiar la categoría de secciones detectadas;
- confirmar estructura o continuar con análisis de texto plano;
- pegar texto de oferta laboral;
- ejecutar un análisis determinista local;
- revisar requisitos y evidencias encontradas;
- ver la ubicación de cada evidencia en el currículum;
- comparar propuestas sugeridas;
- ver qué bloque del currículum es objetivo de cada propuesta;
- aprobar, rechazar o editar propuestas;
- generar una vista previa;
- revisar qué cambios aprobados se aplicaron y cuáles no;
- descargar un DOCX desde el navegador.

La demo no permite todavía:

- importar archivos de oferta laboral;
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
2. Pega el texto del currículum o importa un DOCX/PDF en la etapa `Currículum`.
3. Pulsa `Detectar estructura`.
4. Revisa las secciones detectadas.
5. Cambia `Tipo de sección` si una categoría no es correcta.
6. Pulsa `Confirmar estructura` o `Usar análisis de texto plano`.
7. Pega el texto de la oferta laboral.
8. Ejecuta el análisis determinista.
9. Revisa requisitos y evidencias.
10. Revisa las propuestas.
11. Aprueba, rechaza o edita cada propuesta.
12. Genera la vista previa.
13. Descarga el DOCX.

## Revisión Estructural

La detección estructural agrupa líneas existentes del currículum. No crea cargos, empresas, fechas, habilidades, certificaciones ni texto nuevo.

Categorías reconocidas:

- Contacto
- Perfil profesional
- Experiencia
- Formación
- Habilidades
- Idiomas
- Certificaciones
- Proyectos
- Otra

La confianza visible puede ser:

- `Confianza alta`: encabezado conocido detectado de forma directa.
- `Confianza media`: variante segura de un encabezado conocido.
- `Confianza baja`: encabezado desconocido o sección que requiere revisión.

La confianza no es una certeza factual. Solo indica cuán conservadora fue la detección del encabezado.

El textarea sigue siendo el único editor del contenido. Las tarjetas permiten cambiar categorías, no editar texto duplicado.

Si necesitas corregir contenido, edita el textarea. Al editar, la estructura confirmada se invalida y debes detectar de nuevo o elegir texto plano.

Si no hay encabezados seguros, la demo muestra una advertencia y permite usar el parser plano anterior.

Las secciones desconocidas se conservan como `Otra`. Las secciones repetidas se conservan separadas y en orden.

## Casos Esperados

Si el currículum está vacío, la demo no avanza desde la etapa de currículum.

No se puede avanzar desde `Currículum` hasta confirmar una estructura o elegir explícitamente `Usar análisis de texto plano`.

Si importas un archivo, el texto extraído aparece en el mismo textarea. Debes revisarlo y corregirlo antes de continuar.

Importar otro archivo invalida cualquier estructura detectada o confirmada previamente.

El formato visual del archivo no se conserva. La demo extrae texto, párrafos y señales básicas; no replica columnas, colores, imágenes ni diseño exacto.

Los PDFs escaneados no están soportados. Si no hay texto seleccionable, la demo muestra que esta versión no incluye OCR y permite pegar el contenido manualmente.

Los PDFs protegidos con contraseña o dañados muestran un error seguro. No se muestran rutas, contenido del CV ni mensajes internos.

Límites de importación:

- archivo máximo: 8 MiB;
- PDF máximo: 50 páginas;
- DOCX máximo: 200 entradas internas;
- XML DOCX máximo: 8 MiB;
- texto extraído máximo: 120.000 caracteres;
- texto para continuar el análisis: 24.000 caracteres.

Si el texto importado supera 24.000 caracteres, queda editable en el textarea, pero debes reducirlo antes de continuar.

Si la oferta está vacía, la demo no avanza desde la etapa de oferta.

Si la oferta no contiene requisitos extraíbles, el análisis muestra un error seguro y no repite el contenido privado pegado por el usuario.

Si hay requisitos sin evidencia, se muestran como brechas. No se inventa evidencia positiva.

Si no hay propuestas aplicables, la vista previa se genera sin cambios.

Si una edición contiene un patrón rechazado por la validación, no puede aprobarse.

## Ubicaciones Y Trazabilidad

La demo muestra explicaciones deterministas para ayudar a revisar el análisis:

- `Ubicación de la evidencia`: indica en qué sección y bloque se encontró la evidencia que respalda un requisito.
- `Ubicación objetivo`: indica qué bloque sería modificado por una propuesta.
- `Por qué se propone aquí`: muestra motivos derivados del targeting determinista, no texto generado.
- `Cambios aplicados`: lista los cambios aprobados que terminaron en la vista previa.
- `Cambios no aplicados`: lista propuestas rechazadas o con cambios solicitados cuando corresponde.

En modo estructurado, las ubicaciones usan secciones revisadas como:

```text
Experiencia · bloque 2
Habilidades · bloque 1
Otra sección: Publicaciones · bloque 1
```

`Sección` es la categoría revisada del currículum. `Bloque` es la posición de la línea o párrafo dentro de esa sección, contando también el encabezado cuando forma parte del documento revisado.

En modo de texto plano, la demo no conoce categorías reales. Por eso muestra ubicaciones aproximadas:

```text
Texto del currículum · párrafo 3
```

Una ubicación aproximada significa que el bloque procede del parser plano. Debe revisarse antes de aceptar un cambio.

`Ubicación no disponible` significa que no existe un enlace seguro entre evidencia, target y bloque del `ResumeDocument` vigente. En ese caso no se elige un bloque arbitrario.

Las ubicaciones no modifican la puntuación, el estado `Cubierto`/`Parcial`/`No cubierto`, la validación anti-invención, las decisiones humanas, la vista previa ni el DOCX. Tampoco garantizan contratación ni preferencia del reclutador; solo explican el rastro técnico de la demo.

## Privacidad

La interfaz muestra el aviso:

```text
Tus datos no se almacenan en esta versión.
```

La demo mantiene el estado en memoria del navegador. No usa `localStorage`, `sessionStorage`, cookies, red, backend, telemetría ni persistencia. Los archivos importados se procesan desde sus bytes locales y no se suben a terceros.

## Prueba E2E

La prueba de navegador se ejecuta con:

```bash
npm run web:e2e
```

También existe modo visible:

```bash
npm run web:e2e:headed
```

El flujo de importación se prueba con:

```bash
npm run web:e2e:import
```

Y en modo visible:

```bash
npm run web:e2e:import:headed
```

El flujo de revisión estructural se prueba con:

```bash
npm run web:e2e:structure
```

Y en modo visible:

```bash
npm run web:e2e:structure:headed
```

El flujo de ubicaciones y trazabilidad se prueba con:

```bash
npm run web:e2e:targeting
```

Y en modo visible:

```bash
npm run web:e2e:targeting:headed
```

Los scripts levantan Vite en puertos locales, usan datos sintéticos, descargan el DOCX en un directorio temporal del sistema y eliminan ese directorio al terminar.

El E2E intenta canales de Playwright en este orden: `chromium`, `chrome`, `msedge`. No requiere `chromium-headless-shell`.

Para forzar un canal concreto en PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSER_CHANNEL="chrome"
npm.cmd run web:e2e
Remove-Item Env:PLAYWRIGHT_BROWSER_CHANNEL -ErrorAction SilentlyContinue
```

Los valores permitidos son `chromium`, `chrome` y `msedge`.

Si Chromium completo no está instalado en Windows, instálalo con:

```bash
npx.cmd --no-install playwright install --no-shell chromium
```

Como alternativa, instala Google Chrome o Microsoft Edge y selecciona `chrome` o `msedge` con `PLAYWRIGHT_BROWSER_CHANNEL`.
