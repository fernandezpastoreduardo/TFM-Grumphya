**Aestetics and UI style**
Must be Original, use flat colors and with creatures in the design that look adorable by design but with edges in the expression. Must keep close the limit to still be for all audiences.
There will be 3-5 original creatures, each associated with specific situations.
For example:
A main creature that judges ideas: You can check an example in `ideas-and-designs/grumphya1.svg`. This is the base design for creatures.
Another obsessed with money that appears when the ROI is horrible.
Another paranoid about risks and security. For example can be a variation of grumphya.svg in grey, with black hood looking weirdly like Mr. Robot starring main character
Another desperate when facing repeated ideas.
their expressions become part of the visual system.
Good idea → bewildered.
Mediocre idea → raised eyebrow.
Dreadful idea → creature staring directly at the user in silence.
500 Error → creature calmly burning.
429 Too Many Requests:
Ya está, te las has ingeniado para que incluso un servidor te pida que te calles un rato.
Clearly "Happy Tree Friends"-"dumb ways to die" kind of aesthetic... it's REALLY important that the aesthetic and visual language are worked on very, VERY well in this project to properly dress the interface.
Must contain a light / dark selector under same art direction
Use 24px cornering and 20px padding as a base, with smaller values for
compact controls. On mobile, preserve the approved turquoise frame and make
room for the vertically stacked content instead of enforcing a fixed page
margin.

## Dirección visual aprobada para la app

- La referencia maestra de composición es `ideas-and-designs/revision-vectorial/referencia-maestra.png`: escenario teatral de Grumphya con el contenido interactivo enfocado, telón y público como planos de profundidad y las bandas turquesa laterales. `ideas-and-designs/estetica.jpg` sigue sirviendo como referencia de carácter y paleta, pero no reemplaza la lámina maestra aprobada.
- La marca se escribe **Grumphya**. La cara aprobada de la mascota funciona como isotipo. No se debe reinterpretar ni vectorizar automáticamente lo aprobado; se usan los SVG revisados de `ideas-and-designs/revision-vectorial/revisados/` en su ubicación correspondiente.
- El público conserva su asset vectorial; el telón de escenario se sirve como PNG transparente y el haz de luz de Home se dibuja con CSS. El desenfoque del telón debe ser sensiblemente menor que el del público. Ambos planos son decorativos, ocupan el ancho de la ventana y se mantienen por encima del contenido al desplazarse; el formulario y el texto interactivo permanecen nítidos.
- La Home marca el sistema de las demás secciones: fondo menta con marco turquesa, hero transparente, titulares destacados con fondos de color, controles delineados y mascotas integradas. Cada sección puede variar su acento y contenido sin convertirse en una plantilla genérica.
- La jerarquía del hero prioriza una explicación breve de la utilidad y deja espacio visual para la mascota en escritorio. El copy del hero es texto HTML editable; no se incrusta en una ilustración.
- La tipografía de display es Fredoka y la tipografía de lectura es Nunito Sans, con alternativas de sistema. Los pesos gruesos deben conservar formas abiertas y espaciado legible.
- Los botones de selección de tono mantienen sus paneles azul y rosa, texto negro en ambos temas y las variantes de la mascota llorando y con guantes. La mascota nace del borde inferior izquierdo del botón, con aire por encima, y el texto queda a su derecha. El botón principal de evaluación conserva el formato aprobado; sus controles interactivos usan el turquesa como color de acción por defecto. La selección de tono es una excepción deliberada.
- En móvil, el menú abre un panel legible por encima de la capa de atenuación. La capa bloquea la interacción con el fondo y se cierra al pulsar fuera; el botón del menú queda disponible para mostrar la X y cerrar el panel.

### Contraste y assets por sección

- El tema oscuro mantiene contraste legible en Home, errores, navegación,
  Planes, Contacto, Buenas prácticas, Humanos notables, Descárgate, Peores
  ideas y Login. Los fondos claros llevan texto oscuro; los paneles oscuros,
  texto claro. El código de error numérico usa texto negro sobre amarillo.
  Los estados activos de navegación usan el rosa de «Dame tu mejor golpe» con
  texto oscuro. La jerarquía y el tamaño de los controles de cuenta del nav
  deben ser coherentes.
- Las ilustraciones de sección pueden ser PNG transparentes originales de
  Grumphya cuando se crean expresamente para una escena; no son una
  reinterpretación de los SVG aprobados de `ideas-and-designs`. Deben ser
  propias de su contexto, sin texto incrustado, y no repetirse entre secciones:
  Planes, popup de UltraChachi, Buenas prácticas, Humanos notables, Descárgate,
  Peores ideas y Login usan escenas diferenciadas. La ilustración acompaña al
  contenido HTML sin reducir su contraste ni competir con su lectura.
- **La identidad de Grumphya es fija.** Antes de crear una pose, usar como
  referencia visual principal los SVG aprobados en
  `ideas-and-designs/revision-vectorial/revisados/` y como referencia de
  ilustración completa las escenas existentes `error-scene-404.png`,
  `error-scene-429.png` y `error-scene-500.png` en
  `apps/web/public/assets/grumphya/`. Mantener especie, silueta y proporciones,
  cabeza grande y redondeada, dos orejas puntiagudas, cuerpo compacto, patas y
  brazos cortos, ojos entornados, nariz triangular rosa, boca ceñuda, mejillas
  rosas, contorno oscuro grueso y paleta turquesa. La expresión sigue siendo
  gruñona, escéptica o impasible, según la escena. Se pueden variar pose y
  accesorios sencillos que la situación necesite; no se inventan rasgos
  físicos, ropa, anatomía, expresiones alegres ni personalidad nueva. Cada
  escena debe parecer la misma mascota dibujada por el mismo equipo, no un
  personaje inspirado en ella.
- Al generar una ilustración, incluir una referencia visual aprobada en el
  proceso y revisar el PNG final a tamaño real sobre fondos claros y oscuros.
  Rechazar y regenerar cualquier resultado que cambie la cara, el contorno, la
  complexión o la paleta de Grumphya. Las variaciones aprobadas de tono y las
  escenas de error sirven como guía de actitudes: la acción puede cambiar, el
  carácter reconocible permanece.

## Reglas visuales obligatorias para todas las fases

- En móvil vertical se conserva el orden de lectura y se reorganiza la composición para el espacio disponible; no es una web de escritorio encogida.
- En escritorio se adapta la misma identidad y el mismo orden de lectura; se puede aprovechar el ancho con columnas, sin estirar controles ni convertir la vista en una maqueta distinta.
- Toda mascota tomada de `ideas-and-designs` se integra como vector SVG, con fondo transparente. No se rasteriza ni se encierra en una tarjeta blanca incluida en la ilustración; el fondo de la interfaz, si lo necesita, pertenece al componente de UI. Las nuevas escenas ilustradas para una sección pueden entregarse como PNG transparente original, con el mismo cuidado de no incorporar fondos de UI ni texto.
- La referencia original se conserva. Si un SVG trae un fondo opaco, se prepara una variante vectorial transparente y se verifica visualmente antes de integrarla.
- La interfaz debe tener una dirección visual propia de Grumphya: criaturas y expresiones con intención, composición con carácter y jerarquía reconocible. No se acepta una plantilla SaaS genérica ni ilustración de stock como sustituto.
- Estas reglas aplican desde el prototipo y en cada fase; pulir accesibilidad o responsive no es motivo para diluir la identidad visual.
- El carácter visual nunca sustituye WCAG AA, legibilidad, estados de foco ni alternativas textuales.

## Criterios verificables

- La interfaz debe conservar contraste WCAG AA en texto, controles y estados de foco.
- Todo estado de carga, error, límite y éxito debe tener alternativa textual.
- Las criaturas decorativas llevan `aria-hidden="true"`; las que comunican estado tienen texto alternativo.
- El modo claro/oscuro mantiene la misma jerarquía visual y no depende solo del color.
- Las esquinas de 24px y el padding de 20px son la base; se podrán reducir en controles compactos cuando mejore la densidad.
- El marco móvil conserva las bandas turquesa de la lámina aprobada; valida el
  espacio de contenido y los controles en un viewport pequeño.
- Las ilustraciones no deben bloquear lectura, teclado ni controles.

### Revisión de temas, responsive y rendimiento

- Revisa cada flujo principal en claro y oscuro, tanto en escritorio como en
  una ventana móvil real de 390 × 844 px. Comprueba también los breakpoints de
  tablet y evita inferir el resultado visual móvil solo desde las media queries.
- Verifica contraste de texto normal (4,5:1), texto grande (3:1) y controles en
  sus superficies finales, incluidos estados hover, foco, selección, errores,
  overlays y fondos con ilustración. Los colores base por sí solos no bastan.
- El menú móvil debe ser operable con teclado: foco inicial en el panel, foco
  contenido mientras está abierto, cierre con Escape y devolución del foco al
  disparador. Respeta `prefers-reduced-motion` y conserva targets táctiles
  cómodos.
- Descubre tipografías desde el documento y prepara las conexiones necesarias
  antes de solicitarlas. Carga recursos de forma diferida cuando una ruta no
  los necesita; limita y optimiza las ilustraciones según sus dimensiones de
  presentación, priorizando la carga móvil.
- No declares Core Web Vitals correctos por inspección de código o tamaño de
  bundle. Mide LCP, CLS e INP con herramientas de laboratorio y datos reales
  cuando estén disponibles; registra viewport, ruta, tema, caché y condiciones
  de red para que los resultados se puedan comparar.

Las decisiones vigentes y su implementación están resumidas en [`doc/ui.md`](../doc/ui.md).
