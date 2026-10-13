# RC1 Manual QA Report Template

Plantilla para registrar una ronda manual de QA de la Release Candidate 1.

No rellenar con datos personales reales. Usar solo datos sintéticos.

## Identificación

| Campo | Valor |
| --- | --- |
| Fecha | YYYY-MM-DD |
| Persona revisora |  |
| Commit revisado |  |
| URL revisada | https://victoraaguilar.github.io/career-navigator/ |
| Sistema operativo |  |
| Navegador y versión |  |
| Lector DOCX y versión |  |
| Datos usados | Sintéticos |

## Gate Automatizado Previo

| Comando | Resultado |
| --- | --- |
| `npm ci` | Pendiente |
| `npm run release:check` | Pendiente |
| Public smoke | Pendiente |

## Resultados Manuales

| Área | Estado | Evidencia | Notas |
| --- | --- | --- | --- |
| Accesibilidad manual | Pendiente |  |  |
| Responsive visual | Pendiente |  |  |
| DOCX en lectores reales | Pendiente |  |  |
| Firefox | Fuera de alcance RC1 |  |  |
| Safari | Fuera de alcance RC1 |  |  |
| Privacidad para datos reales | Pendiente |  |  |

Estados permitidos:

- `Aprobado`
- `Aprobado con limitaciones`
- `Pendiente`
- `Bloqueado`
- `Fuera de alcance RC1`

## Accesibilidad Manual

Checklist:

- [ ] El primer `Tab` llega a `Saltar al contenido principal`.
- [ ] El skip link mueve el foco al contenido principal.
- [ ] `Continuar` y `Anterior` son operables por teclado.
- [ ] La selección de archivos es operable por teclado.
- [ ] Las decisiones de revisión son operables por teclado.
- [ ] Hay un solo `aria-current="step"`.
- [ ] Los errores son perceptibles.
- [ ] El foco no queda atrapado.
- [ ] El contenido crítico no depende solo del color.

Notas:

```text

```

## Responsive Visual

Viewports revisados:

- [ ] 320 px
- [ ] 375 px
- [ ] 768 px
- [ ] 1024 px
- [ ] 1440 px

Checklist:

- [ ] No hay solapes críticos.
- [ ] No hay texto crítico cortado.
- [ ] No hay scroll horizontal inesperado.
- [ ] Formularios y botones siguen siendo utilizables.
- [ ] La vista previa y la descarga siguen siendo comprensibles.

Notas:

```text

```

## DOCX En Lectores Reales

Lectores revisados:

- [ ] Microsoft Word
- [ ] LibreOffice Writer
- [ ] Google Docs importado manualmente

Checklist:

- [ ] El archivo abre sin reparación obligatoria.
- [ ] El texto esperado está presente.
- [ ] Los cambios aprobados aparecen.
- [ ] Las propuestas rechazadas no aparecen como aplicadas.
- [ ] No hay IDs técnicos visibles.
- [ ] No hay metadatos de trazabilidad de UI visibles.
- [ ] Las secciones son legibles.

Notas:

```text

```

## Navegadores Fuera De Matriz

Firefox:

```text
No aprobado en RC1 salvo validación explícita.
```

Safari:

```text
No probado en RC1 salvo validación explícita.
```

## Privacidad Para Datos Reales

Checklist antes de permitir datos reales:

- [ ] Política de privacidad publicada.
- [ ] Decisión explícita sobre persistencia.
- [ ] Explicación visible sobre archivos y textos.
- [ ] Criterio de borrado o cierre de sesión.
- [ ] Revisión legal o de producto según corresponda.

Resultado actual:

```text
RC1 limitada a datos sintéticos.
```

## Bloqueos

```text

```

## Decisión Final

Seleccionar una:

- [ ] `aprobada_para_demo_sintetica`
- [ ] `requiere_correcciones`
- [ ] `no_aprobada`

Resumen:

```text

```
