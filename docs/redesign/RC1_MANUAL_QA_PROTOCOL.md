# RC1 Manual QA Protocol

Protocolo manual para validar los riesgos residuales de la Release Candidate 1 que no quedan cerrados por `release:check`.

Este protocolo no reemplaza el gate automatizado. Debe ejecutarse después de:

```bash
npm ci
npm run release:check
```

En Windows:

```powershell
npm.cmd ci
npm.cmd run release:check
```

## Reglas De Ejecución

- Usar solo datos sintéticos.
- No pegar CV reales, ofertas privadas, nombres reales, emails reales ni datos sensibles.
- Registrar navegador, sistema operativo, lector DOCX y fecha de la revisión.
- No marcar un área como aprobada si la evidencia no fue revisada manualmente.
- Documentar capturas o notas de reproducción cuando algo falle.

## Matriz Manual Mínima

| Área | Estado inicial RC1 | Evidencia esperada | Criterio de aprobación |
| --- | --- | --- | --- |
| Accesibilidad manual | Pendiente | Revisión con teclado y lector o inspector accesible | El flujo principal es comprensible, operable y no queda foco atrapado. |
| Responsive visual | Pendiente | Revisión visual en móvil, tablet y escritorio | No hay solapes, cortes críticos ni scroll horizontal inesperado. |
| DOCX en lectores reales | Pendiente | Abrir `curriculum-adaptado.docx` en lectores objetivo | El documento abre sin error y conserva texto, secciones y cambios aprobados. |
| Firefox | Fuera de alcance RC1 | Prueba manual o E2E dedicado futuro | Solo puede aprobarse tras validación explícita. |
| Safari | Fuera de alcance RC1 | Prueba manual en macOS/iOS o runner futuro | Solo puede aprobarse tras validación explícita. |
| Privacidad para datos reales | Pendiente | Política publicada y decisión de datos | No aprobar uso con datos reales sin política y estrategia de datos. |

## Accesibilidad Manual

Revisar al menos:

- el primer `Tab` llega a `Saltar al contenido principal`;
- el skip link mueve el foco al contenido principal;
- `Continuar`, `Anterior`, selección de archivos y decisiones son operables por teclado;
- hay un solo `aria-current="step"`;
- los errores se anuncian de forma perceptible;
- el foco no queda atrapado en ningún control;
- el contenido crítico no depende solo del color;
- los labels visibles coinciden con el propósito de cada control.

Resultado esperado para RC1: puede aprobarse con limitaciones si no hay bloqueos críticos y queda claro que no sustituye una auditoría WCAG completa.

## Responsive Visual

Revisar manualmente:

- 320 px;
- 375 px;
- 768 px;
- 1024 px;
- 1440 px.

Comprobar:

- encabezado y aviso de RC;
- stepper;
- formularios de currículum y oferta;
- panel de estructura;
- análisis y evidencias;
- propuestas y edición;
- vista previa;
- descarga.

Resultado esperado para RC1: no debe haber solapes críticos ni texto inaccesible. Pequeñas diferencias visuales no bloquean si el flujo sigue siendo usable.

## DOCX En Lectores Reales

Abrir el DOCX descargado al menos en uno de:

- Microsoft Word;
- LibreOffice Writer;
- Google Docs importado manualmente.

Comprobar:

- el archivo abre sin reparación obligatoria;
- el texto esperado está presente;
- las propuestas rechazadas no aparecen como aplicadas;
- no hay IDs técnicos visibles;
- no hay metadatos de trazabilidad de UI visibles;
- los saltos de línea y secciones son legibles.

Resultado esperado para RC1: compatibilidad básica demostrada en los lectores objetivo revisados. No declarar compatibilidad universal.

## Navegadores Fuera De Matriz

Firefox y Safari siguen fuera del alcance aprobado de RC1.

Para aprobarlos más adelante, registrar:

- navegador y versión;
- sistema operativo;
- resultado del flujo principal;
- importación DOCX/PDF;
- descarga DOCX;
- errores de consola;
- diferencias visuales o funcionales.

## Privacidad Para Datos Reales

Antes de aceptar datos reales se requiere:

- política de privacidad publicada;
- decisión explícita sobre persistencia o ausencia de persistencia;
- explicación visible de qué ocurre con archivos y textos;
- criterio de borrado o cierre de sesión;
- revisión legal o de producto según corresponda.

Hasta cerrar esos puntos, RC1 sigue limitada a datos sintéticos.

## Resultado Manual

El resultado de una ronda manual debe registrar:

- commit o URL revisada;
- fecha;
- persona revisora;
- áreas aprobadas;
- áreas con limitaciones;
- bloqueos;
- decisión final: `aprobada_para_demo_sintetica`, `requiere_correcciones` o `no_aprobada`.
