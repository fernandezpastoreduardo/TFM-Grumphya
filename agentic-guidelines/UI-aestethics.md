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
All components must have 24px round cornering with 20px padding
Main frame has to be only 4px margin left and right and 8px top and bottom in mobile devices

## Reglas visuales obligatorias para todas las fases

- `ideas-and-designs/estetica.jpg` es la referencia visual principal: fondo menta, contornos turquesa, titulares gruesos, controles blancos delineados y paneles de opción azules/rosas con criaturas integradas. En móvil vertical se prioriza la secuencia marca → mascota y personalidad → entrada → opciones; no es una web de escritorio encogida.
- En escritorio se adapta la misma identidad y el mismo orden de lectura; se puede aprovechar el ancho con columnas, sin estirar controles ni convertir la vista en una maqueta distinta.
- Toda mascota tomada de `ideas-and-designs` se integra como vector SVG, con fondo transparente. No se rasteriza ni se encierra en una tarjeta blanca incluida en la ilustración; el fondo de la interfaz, si lo necesita, pertenece al componente de UI.
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
- El marco móvil usa 4px laterales y 8px verticales, comprobado en viewport pequeño.
- Las ilustraciones no deben bloquear lectura, teclado ni controles.
