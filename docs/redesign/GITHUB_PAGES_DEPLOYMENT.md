# GitHub Pages Deployment

## Propósito

Este documento describe cómo publicar la Release Candidate web de Career Navigator como sitio estático de prueba en GitHub Pages.

URL esperada:

```text
https://victoraaguilar.github.io/career-navigator/
```

El entorno es público, pero sigue siendo una Release Candidate local-first. Usa datos ficticios durante la evaluación.

## Rama Y Base Path

- Repositorio: `VictorAaguilar/career-navigator`
- Rama que despliega: `universal-redesign`
- Base path de Pages: `/career-navigator/`
- Base local de desarrollo: `/`

La base de Vite se controla con:

```text
CAREER_NAVIGATOR_BASE_PATH
```

Valores esperados:

- ausente: `/`
- Pages: `/career-navigator/`

## Activación Manual De Pages

La rama no cambia Settings mediante API.

Pasos manuales:

1. Abrir GitHub.
2. Ir a `Settings`.
3. Ir a `Pages`.
4. En `Build and deployment`, seleccionar `Source: GitHub Actions`.
5. Guardar.
6. Ejecutar el workflow o hacer merge/push a `universal-redesign`.

## Workflow

Archivo:

```text
.github/workflows/deploy-pages.yml
```

Eventos:

- `pull_request` hacia `universal-redesign`: valida, no despliega.
- `push` a `universal-redesign`: valida, construye y despliega.
- `workflow_dispatch`: despliega solo si se ejecuta desde `refs/heads/universal-redesign`.

Jobs:

1. `validate-and-build`
2. `deploy`
3. `public-smoke`

## Validaciones Previas

El job de build ejecuta:

```bash
npm ci
npm test
npm run typecheck
npm run web:typecheck
npm run web:build
npm run web:bundle:check
npm run web:pages:artifact-check
npm run web:e2e:pages
npm run web:bundle:check
npm run web:pages:artifact-check
npm audit --omit=dev
```

Chrome debe estar disponible en el runner. El workflow comprueba:

```bash
google-chrome --version
```

No descarga navegadores durante CI.

## Artifact

Solo se sube:

```text
apps/web/dist
```

No se suben:

- repositorio completo;
- `node_modules`;
- `test-results`;
- `playwright-report`;
- DOCX descargados;
- PDF importados;
- archivos personales;
- `.env`;
- `.git`;
- sourcemaps.

## Permisos

Permisos globales:

```yaml
contents: read
```

Solo el job `deploy` tiene:

```yaml
contents: read
pages: write
id-token: write
```

No se usan secrets, PAT, claves SSH, custom domain ni tokens personalizados.

## Acciones

El workflow usa acciones oficiales pinneadas por SHA:

- `actions/checkout`
- `actions/setup-node`
- `actions/configure-pages`
- `actions/upload-pages-artifact`
- `actions/deploy-pages`

No usa `pull_request_target`, `curl | sh`, instalación global npm ni herramientas de despliegue como `gh-pages`.

## Public Smoke

Después del deploy, `tests/release/github-pages-smoke.mjs` valida la URL devuelta por `actions/deploy-pages`.

Comprueba:

- HTTPS;
- origen esperado;
- path `/career-navigator/`;
- respuesta 200 del HTML;
- título `Career Navigator`;
- entry JS;
- CSS;
- assets bajo el mismo origen;
- ausencia de referencias `/assets/...` desde raíz;
- ausencia de scripts o estilos externos.

El smoke tiene reintentos limitados para propagación de Pages. Un 404 final es fallo.

## Diagnóstico

### Assets 404

Síntoma: HTML carga, pero JS/CSS falla.

Revisar:

- `CAREER_NAVIGATOR_BASE_PATH=/career-navigator/`;
- `npm run web:build`;
- que `index.html` use `/career-navigator/assets/...`;
- que no aparezca `src="/assets/...` ni `href="/assets/...`.

### Pages No Habilitado

Síntoma: workflow construye pero no hay URL pública.

Revisar `Settings -> Pages -> Source: GitHub Actions`.

### Environment Bloqueado

Síntoma: job `deploy` queda pendiente.

Revisar reglas del environment `github-pages`.

### Navegador Ausente

Síntoma: falla `google-chrome --version`.

El runner no descarga navegadores. Reintenta cuando el runner GitHub tenga Chrome disponible o ajusta el entorno de CI aprobado.

### Audit Fallido

Solo se bloquea por vulnerabilidades de producción:

```bash
npm audit --omit=dev
```

No ejecutes `npm audit fix` desde este workflow.

### Bundle Fallido

Revisar si PDF.js, `pdf.worker`, JSZip o DOCX pasaron al bundle inicial. No subas presupuestos sin investigar la causa.

## Privacidad

La app publicada conserva:

- procesamiento en navegador;
- ausencia de backend;
- ausencia de storage;
- ausencia de analytics;
- ausencia de telemetría;
- ausencia de LLM;
- ausencia de OCR;
- descarga DOCX mediante Blob local.

No se declara cumplimiento legal ni privacidad absoluta.

## Deshabilitar Despliegue

Opciones seguras:

- deshabilitar Pages desde `Settings -> Pages`;
- cambiar temporalmente el source si hace falta cortar exposición;
- revertir el commit problemático en `universal-redesign`.

No subir `dist` a Git ni publicar manualmente ramas `gh-pages`.
