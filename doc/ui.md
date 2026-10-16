# Dirección e implementación de la UI

Este documento resume las decisiones visuales aprobadas que guían la Home y el
resto de las secciones. La dirección completa está en
[`agentic-guidelines/UI-aestethics.md`](../agentic-guidelines/UI-aestethics.md);
la lámina maestra está en
[`ideas-and-designs/revision-vectorial/referencia-maestra.png`](../ideas-and-designs/revision-vectorial/referencia-maestra.png).

## Identidad y composición

- La marca se denomina **Grumphya**. La cara de la mascota aprobada se usa como
  isotipo.
- El fondo menta, las bandas turquesa laterales, los titulares destacados y los
  controles delineados forman el marco visual de la aplicación.
- La Home define la gramática compartida por el resto de las secciones: hero
  transparente, copy breve con jerarquía clara, mascota con presencia y
  controles interactivos en primer plano. Los acentos pueden variar por
  sección sin cambiar esa gramática.
- El texto del hero vive en HTML y sigue siendo editable. No forma parte de un
  asset gráfico.
- Fredoka se usa en titulares y Nunito Sans en lectura y controles, con fuentes
  de sistema como alternativa. Los pesos altos deben mantener buena separación
  entre caracteres.

## Escenario y assets

- La composición aprobada muestra el telón por arriba y las siluetas del público
  por abajo. Ambos elementos son decorativos, ocupan el ancho de la ventana y
  permanecen por encima del contenido cuando la página se desplaza.
- El CSS aplica más desenfoque al público que al telón. Los elementos
  interactivos y el texto permanecen nítidos y utilizables.
- Los assets SVG revisados se guardan en
  `ideas-and-designs/revision-vectorial/revisados/`. Se colocan según la lámina
  maestra; no se autotracean ni se reinterpretan. Las capas de profundidad,
  desenfoques y adornos se resuelven con CSS.
- Los rayos y formas de color rodean hero y acciones como paréntesis visuales,
  conservan aire respecto a los controles y no se solapan con ellos.

## Controles y temas

- Los botones principales y controles clicables siguen el lenguaje turquesa de
  la acción, con foco visible y estados accesibles.
- Las tarjetas de tono «Tengo la piel fina» y «Dame tu mejor golpe» son la
  excepción de color: mantienen sus fondos azul y rosa y texto negro también en
  modo oscuro. Cada tarjeta integra su variante aprobada de la mascota desde el
  borde inferior izquierdo, dejando aire sobre la ilustración y el texto a su
  derecha.
- El cambio claro/oscuro se presenta como un switch con accionador turquesa; el
  selector de tono sigue siendo un control separado.
- En modo oscuro, los controles y superficies claras conservan texto oscuro;
  los diálogos y paneles oscuros conservan texto claro. Se comprueba también
  la combinación de colores de popups, avisos y botones secundarios.
- La versión de escritorio y la móvil conservan la misma identidad. En móvil,
  la composición se apila y mantiene separación entre grupos para que el
  textarea, las opciones, la acción y la mascota se lean como pasos distintos.

## Navegación móvil y accesibilidad

- El navbar es sticky y mantiene su separación del telón.
- El menú móvil cambia entre icono de menú y X. Al abrirlo, aparece una capa que
  atenúa y bloquea el contenido de fondo; el panel permanece por encima de esa
  capa y puede recibir clics. Pulsar fuera cierra el menú sin activar el
  contenido que queda debajo.
- El panel y la capa se montan en un portal del documento para evitar que los
  contextos de apilado de la página los coloquen bajo el velo o las ilustraciones.
- Los SVG decorativos se ocultan a tecnologías de asistencia. Los controles
  tienen semántica nativa, nombre accesible, estado anunciado y foco visible.
  Los colores no son la única forma de comunicar selección o estado.

## Errores

Las rutas desconocidas muestran el 404 con la criatura indicando una puerta
equivocada; los fallos de renderizado muestran el 500 con una llama pequeña y
la mascota tranquila; y el límite temporal de creación de perfiles muestra el
429 con la criatura impaciente. Las tres pantallas heredan navegación, telón,
público, tema y pie del marco común; cada una usa una ilustración PNG
transparente que integra mascota, accesorios, proporción y solapes de su lámina:
puerta, tarima y cartel de X en 404; brasero con llama en 500; señal de mano y
barrera en 429. El copy y las acciones permanecen como contenido HTML.
El copy, los siguientes pasos y las rutas locales de revisión están descritos
en [`error-pages.md`](error-pages.md).

## Código fuente principal

- Composición Home, copy del hero y menú: `apps/web/src/views/home.tsx`.
- Marco común, hero y menú de secciones: `apps/web/src/shared/components/section-page-frame.tsx`.
- Tipografía, capas, responsive y controles: `apps/web/src/style.css`.
