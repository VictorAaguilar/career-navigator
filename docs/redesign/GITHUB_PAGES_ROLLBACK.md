# GitHub Pages Rollback

Este documento describe opciones seguras para revertir o detener el sitio estático de prueba de GitHub Pages.

## Opción A: Revertir En universal-redesign

Uso recomendado cuando el código publicado tiene un fallo claro.

1. Crear un commit de revert sobre `universal-redesign` mediante el flujo normal de PR o mantenimiento.
2. Dejar que el workflow `Deploy Career Navigator RC to GitHub Pages` vuelva a ejecutar validación.
3. Confirmar que el deploy publica el commit revertido.
4. Ejecutar o revisar el public smoke.

Ventajas:

- conserva historial;
- no requiere force push;
- mantiene trazabilidad;
- vuelve a desplegar con las mismas validaciones.

## Opción B: Reejecutar Un Workflow Exitoso Anterior

Uso posible si GitHub Actions permite re-run sobre un commit anterior conocido.

Antes de usarlo:

- confirmar el hash exacto que se quiere publicar;
- confirmar que ese run desplegó el artifact correcto;
- dejar constancia del commit publicado;
- ejecutar el public smoke.

No usar esta opción si no está claro qué commit produce el artifact.

## Opción C: Deshabilitar Temporalmente Pages

Uso recomendado si hay riesgo de exposición o si el sitio debe retirarse rápido.

Pasos:

1. Abrir GitHub.
2. Ir a `Settings`.
3. Ir a `Pages`.
4. Deshabilitar Pages o cambiar temporalmente el source.
5. Confirmar que la URL pública deja de servir el sitio.

Después:

- corregir el problema en una rama;
- abrir PR contra `universal-redesign`;
- reactivar Pages con `Source: GitHub Actions` cuando corresponda.

## No Recomendado

No hagas:

- force push;
- edición manual de artifacts;
- subida manual de `dist`;
- creación o modificación de rama `gh-pages`;
- eliminación de historial;
- publicación con tokens personales;
- compartir secretos;
- tags o GitHub Releases para rollback de esta RC.

## Verificación Posterior

Tras cualquier rollback:

```bash
npm ci
npm test
npm run typecheck
npm run web:typecheck
npm run web:build
npm run web:bundle:check
npm audit --omit=dev
```

Y si Pages sigue habilitado:

```bash
DEPLOYED_SITE_URL=https://victoraaguilar.github.io/career-navigator/ node tests/release/github-pages-smoke.mjs
```
