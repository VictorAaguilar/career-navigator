# RC1: Foco Y Ampliación De Texto

## Alcance

Comprobación localizada de contraste del foco y ampliación de texto en Chrome,
con datos sintéticos. No constituye certificación WCAG ni una prueba auditiva
con lector de pantalla.

## Problemas Reproducidos Y Correcciones

- El foco de Comenzar usaba un contorno translúcido con contraste 1,62:1
  sobre la superficie de inicio. Ahora utiliza un contorno opaco de 3 px;
  el contraste medido sobre esa superficie es 8,98:1.
- A 320 px y con el tamaño raíz de texto al 200 %, el documento alcanzaba
  438 px de ancho en inicio y 414 px en currículum. Se permite partir palabras
  largas en encabezados y paneles, se limita la anchura de cada etapa móvil
  y se mantienen márgenes interiores móviles que no crecen con el texto.
- No se reduce el tamaño de letra para conseguir que quepa el contenido.
  El stepper conserva su desplazamiento horizontal interno deliberado.

## Regresión Automatizada

`tests/e2e/text-resizing-scenario.mjs`, incluido en `web:e2e:rc` y en la
variante Pages, comprueba comportamiento real en el navegador:

- Tab desde la confirmación sitúa el foco visible en Comenzar.
- El contorno es sólido, opaco, de al menos 3 px y con contraste mínimo 3:1
  frente a la superficie adyacente opaca. El cálculo utiliza luminancia sRGB
  sin redondear el umbral de aceptación.
- El tamaño computado del texto del botón se duplica al aplicar 200 % al
  tamaño raíz; no se trata de zoom nativo de la interfaz del navegador.
- A 320 px, inicio, currículum y estructura confirmada no desbordan
  horizontalmente el documento ni recortan encabezados, párrafos o botones.
- Con esa ampliación se puede introducir texto, detectar y confirmar su
  estructura.

## Límites Y Referencias

La muestra no verifica todos los pares de colores, todas las etapas al 200 %,
el zoom nativo, ajustes de espaciado del usuario ni todas las tecnologías
de asistencia. Sigue pendiente la evaluación auditiva con lector de pantalla.

Referencias de criterio:
[contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html),
[ampliación de texto](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
y [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
