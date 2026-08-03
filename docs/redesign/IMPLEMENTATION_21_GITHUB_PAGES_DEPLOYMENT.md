# Implementación 21: GitHub Pages Deployment

## Estado Base

La rama `feature/github-pages-rc-deployment` parte de la Release Candidate ya integrada en `universal-redesign`.

Validación base local antes de modificar:

- rama correcta y árbol limpio;
- `origin` apunta a `VictorAaguilar/career-navigator`;
- `npm ci` correcto;
- `npm test`: 22 archivos, 995 tests superados;
- `npm run typecheck` correcto;
- `npm run web:typecheck` correcto;
- `npm run web:build` correcto;
- `npm run web:bundle:check` correcto;
- `npm audit --omit=dev`: cero vulnerabilidades de producción.

Baseline local:

- HTML inicial: `818` bytes;
- JavaScript inicial: `423532` bytes;
- CSS inicial: `12649` bytes.

## Arquitectura De Despliegue

GitHub Pages publicará únicamente `apps/web/dist` como project site:

```text
https://victoraaguilar.github.io/career-navigator/
```

El desarrollo local conserva base `/`. El build para Pages usa base `/career-navigator/` mediante `CAREER_NAVIGATOR_BASE_PATH`, validada por una función pura compartida con Vite.

## Riesgos

- Un base path incorrecto puede generar referencias `/assets/...` rotas bajo Pages.
- Un workflow demasiado permisivo podría desplegar código de PR o ramas feature.
- Un artifact mal delimitado podría subir archivos que no pertenecen a `apps/web/dist`.
- El smoke público debe validar propagación sin ocultar 404 finales.
- GitHub Pages requiere activación manual del source `GitHub Actions`.

## Plan

1. Añadir resolución validada de base path.
2. Adaptar scripts Pages y bundle checker a `/career-navigator/`.
3. Añadir artifact check portable.
4. Parametrizar el E2E RC para ejecutar bajo subdirectorio.
5. Añadir public smoke sin dependencias.
6. Crear workflow seguro de Pages con acciones pinneadas.
7. Añadir pruebas unitarias de configuración, workflow, artifact y smoke.
8. Documentar activación, diagnóstico y rollback.

## Criterios De Aceptación

- `npm run web:build` sigue usando `/`.
- `npm run web:build:pages` genera assets bajo `/career-navigator/`.
- `npm run web:e2e:pages` pasa con Chrome.
- El workflow valida PRs hacia `universal-redesign` sin desplegar.
- Solo `push` a `universal-redesign` o `workflow_dispatch` desde `universal-redesign` despliega.
- El artifact contiene exclusivamente `apps/web/dist`.
- No se añaden dependencias, secrets, backend, storage, analytics, LLM ni OCR.

## Pasos Manuales Necesarios

GitHub Pages debe habilitarse manualmente en `Settings -> Pages` con source `GitHub Actions`. Esta rama no modifica Settings mediante API ni despliega desde feature.

## Implementación Real

- `apps/web/vite-base-path.ts` valida `CAREER_NAVIGATOR_BASE_PATH`.
- `apps/web/vite.config.ts` usa esa base para Vite.
- `web:build:pages` construye con `/career-navigator/`.
- `web:e2e:pages` reconstruye Pages, arranca preview en `4179`, abre `/career-navigator/`, importa DOCX/PDF sintéticos, ejecuta el flujo y valida descarga DOCX.
- `web:pages:artifact-check` inspecciona `apps/web/dist` antes de subirlo.
- `web:pages:smoke` valida una URL pública real después del deploy.
- `.github/workflows/deploy-pages.yml` valida PRs y despliega solo desde `universal-redesign`.

## Seguridad Del Workflow

- Acciones oficiales pinneadas por SHA completo.
- `pull_request_target` no se usa.
- Permisos globales limitados a `contents: read`.
- `pages: write` e `id-token: write` viven solo en el job `deploy`.
- No se usan secrets, PAT, claves SSH, CDNs ni herramientas de deployment npm.
- Pull requests y ramas feature no despliegan.

## Estado Final Local

El despliegue público no se ejecuta desde esta rama. El estado correcto antes del PR es: infraestructura preparada, workflow validado localmente por pruebas, Pages pendiente de activación manual y merge a `universal-redesign`.
