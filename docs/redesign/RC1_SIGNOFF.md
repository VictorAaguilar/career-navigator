# RC1 Sign-Off

Decisión de cierre para la Release Candidate 1 del CV Tailoring Agent web.

## Decisión

RC1 queda aceptada para evaluación pública controlada en GitHub Pages con datos sintéticos.

RC1 no queda aceptada para uso con datos personales reales, producción pública, multiusuario, almacenamiento persistente ni tratamiento de información sensible.

## Alcance Aceptado

- Flujo local-first de nueve etapas.
- Importación local de currículum DOCX y PDF con texto seleccionable.
- Importación local de oferta TXT y Markdown.
- Parsing estructural revisable y alternativa de texto plano.
- Matching, scoring, trazabilidad y propuestas deterministas.
- Decisiones humanas explícitas antes de aplicar cambios.
- Vista previa del currículum adaptado.
- Descarga local de `curriculum-adaptado.docx`.
- Validación local del build de producción.
- Validación local del artifact de GitHub Pages.
- Publicación estática de prueba en GitHub Pages.

## Gate De Validación

El gate obligatorio de RC1 es:

```bash
npm ci
npm run release:check
```

En Windows:

```powershell
npm.cmd ci
npm.cmd run release:check
```

`release:check` ejecuta:

- `npm test`
- `npm run typecheck`
- `npm run web:typecheck`
- `npm run web:build`
- `npm run web:bundle:check`
- `npm audit --omit=dev`
- `npm run web:e2e:rc`
- `npm run web:e2e:pages`
- `npm run web:pages:artifact-check`

El gate también limpia `apps/web/dist` al terminar para evitar publicar o commitear artifacts locales por accidente.

## Evidencia Documental

- Readiness: `docs/redesign/RELEASE_CANDIDATE_READINESS.md`
- Release notes: `docs/redesign/RELEASE_NOTES_RC1.md`
- Validación local: `docs/redesign/LOCAL_INSTALLATION_AND_VALIDATION.md`
- Checklist de aceptación: `docs/redesign/TAILORING_DEMO_ACCEPTANCE_CHECKLIST.md`
- GitHub Pages: `docs/redesign/GITHUB_PAGES_DEPLOYMENT.md`
- Rollback Pages: `docs/redesign/GITHUB_PAGES_ROLLBACK.md`

## Riesgos Residuales Aceptados Para RC1

- Firefox no queda aprobado en RC1.
- Safari no queda probado en RC1.
- La revisión visual responsive manual sigue recomendada.
- La auditoría WCAG manual completa queda pendiente.
- La compatibilidad DOCX debe confirmarse con lectores reales si se requiere distribución formal.
- GitHub Pages es público; solo deben usarse datos ficticios.

## Fuera De Alcance De RC1

- Backend.
- Autenticación.
- Persistencia.
- Sincronización.
- Analítica.
- OCR.
- Llamadas LLM.
- Generación libre de texto.
- Uso con datos reales o sensibles.

## Criterio Para Avanzar A Producción Real

Antes de permitir datos reales, el proyecto debe cerrar:

- política de privacidad publicada;
- auditoría manual de accesibilidad;
- matriz de navegadores ampliada si se declara soporte fuera de Chromium-based;
- estrategia explícita de datos si se añade persistencia;
- validación manual de DOCX en los lectores objetivo.
