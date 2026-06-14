# IMPLEMENTATION 00: Modelos de datos universales

## Qué se implementó

Se añadieron los primeros modelos y esquemas universales de datos para el MVP de Career Navigator, siguiendo la decisión de stack de Node.js con TypeScript.

Los esquemas implementados son:
- `ProfileSchema` para el perfil profesional.
- `EvidenceSchema` para las evidencias asociadas.
- `OfferSchema` para las ofertas de trabajo.
- `RequirementSchema` para los requisitos de la oferta.

También se configuró TypeScript con `tsconfig.json` y se añadieron dependencias de desarrollo para validación y pruebas.

## Estructura de archivos

- `tsconfig.json`: configuración de TypeScript.
- `src/schemas/common.ts`: validaciones compartidas y tipos auxiliares.
- `src/schemas/profile.ts`: esquema y tipo de perfil profesional.
- `src/schemas/evidence.ts`: esquema y tipo de evidencia.
- `src/schemas/job.ts`: esquema y tipo de oferta.
- `src/schemas/requirement.ts`: esquema y tipo de requisito.
- `src/schemas/index.ts`: exportaciones centrales.
- `tests/fixtures/`: ejemplos genéricos de perfiles, ofertas y evidencias.
- `tests/unit/schemas.test.ts`: pruebas automatizadas de validación.
- `docs/redesign/IMPLEMENTATION_00_DATA_MODELS.md`: este documento.

## Decisiones tomadas

- Se adoptó `zod` para validación de esquemas y mensajería clara de errores.
- Los esquemas permiten campos desconocidos mediante `.passthrough()`, lo que facilita la migración desde datos heredados.
- Se definió un modelo de perfil que incluye objetivos, experiencia, educación, proyectos, competencias, herramientas, idiomas, certificaciones, preferencias, restricciones y evidencias asociadas.
- Las ofertas incluyen empresa, puesto, ubicación, modalidad, contrato, salario, fuente, URL, descripción, responsabilidades, requisitos, fecha de publicación, estado e idioma.
- Los requisitos incluyen categoría, obligatoriedad, nivel, experiencia, competencia/herramienta, certificación, peso provisional y confianza de extracción.

## Cómo ejecutar las pruebas

1. Instala las dependencias de desarrollo si aún no se han instalado:
   ```bash
   npm install
   ```
2. Ejecuta la comprobación de tipos:
   ```bash
   npm run typecheck
   ```
3. Ejecuta las pruebas automatizadas:
   ```bash
   npm test
   ```

## Limitaciones actuales

- No hay lógica de negocio ni motor de scoring implementado todavía.
- No existe aún una capa de importación desde `cv.md` ni desde los formatos heredados.
- El tracker y la generación de PDF permanecen intactos, pero no están integrados con estos esquemas.
- La validación es de primer nivel y puede requerir refinamientos adicionales según el modelo de dominio futuro.

## Siguiente incremento recomendado

El siguiente paso debe ser construir los importadores y normalizadores que conviertan datos heredados (`cv.md`, `config/profile.yml`, ofertas de texto) en estos esquemas, y luego avanzar hacia el primer motor de scoring basado en coincidencias de requisito-evidencia.
