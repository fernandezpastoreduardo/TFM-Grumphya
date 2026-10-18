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
- La revisión de contraste cubre Home (incluidos radio, notas y errores), los
  códigos de las páginas de error, la navegación y las vistas de Planes,
  Contacto, Buenas prácticas, Humanos notables, Descárgate, Peores ideas y
  Login. Los textos de controles mantienen tamaño y peso coherentes; los
  estados activos del nav usan el rosa de «Dame tu mejor golpe» con texto
  oscuro. En los errores, el código numérico conserva tinta oscura sobre el
  amarillo también en el tema oscuro.
- Las secciones tienen ilustraciones PNG transparentes propias de Grumphya,
  distintas entre sí y de los assets reutilizados del marco: `plans-coffee.png`
  para Planes, `ultrachachi-reality-check.png` para su popup, y
  `good-practices-problem-scout.png`, `notable-ideas-applause.png`,
  `roast-vent.png`/`roast-plan-callout.png`, `worst-ideas-wall.png` y
  `login-credentials.png`/`login-privacy.png` para Buenas prácticas, Humanos
  notables, Descárgate, Peores ideas y Login respectivamente. Se mantienen
  transparentes y sin copy incrustado; la UI conserva el contenido legible en
  HTML. Las escenas de error existentes siguen siendo sus propios assets.
- Para crear nuevas poses se usan como modelo los SVG aprobados de
  `ideas-and-designs/revision-vectorial/revisados/` y las escenas completas
  `error-scene-404.png`, `error-scene-429.png` y `error-scene-500.png`. La
  especie, silueta, proporciones, cara gruñona, paleta turquesa y contorno
  grueso de Grumphya no se reinterpretan. Solo varían la pose y los accesorios
  sencillos que requiera cada sección; no se añaden rasgos físicos, ropa ni
  expresiones alegres. Cada PNG debe conservar transparencia, carecer de texto
  y revisarse a tamaño real sobre fondos claros y oscuros. Si la mascota deja
  de parecer la misma, se descarta y se vuelve a generar. La primera muestra
  validada para esta tanda es `plans-coffee.png`.
- La sección Peores ideas usa el título «El muro de la vergüenza».
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

## Ranking público de ideas rechazadas

La ruta `/lo-peor-de-lo-peor` presenta «El muro de la vergüenza». El componente
`WorstIdeasAll` obtiene los datos reales de `GET /api/worst-ideas`; no incluye
filas de ejemplo en el ranking público. Cada fila muestra su puesto, el título
seguro y el número de recepciones de la semana actual. El pie aclara que no se
muestran autor ni texto original. La API limita el ranking a diez ideas; el
componente valida el contrato de cada fila y presenta esa respuesta.

Mientras espera la respuesta anuncia «Cargando el ranking semanal…». Si la
petición falla o el JSON no cumple el contrato, muestra un mensaje genérico y
un botón «Volver a intentarlo». Una respuesta válida vacía se muestra como un
estado informativo, y una lista con datos se presenta como lista ordenada con
nombre accesible. Las peticiones se cancelan al desmontar el componente; no se
reflejan detalles internos del error.

Las filas y mensajes mantienen texto oscuro sobre superficies claras también
en el tema oscuro. En pantallas estrechas las filas reducen sus columnas,
espaciado y tipografía para conservar la lectura del puesto, título y cantidad.
El endpoint y el DTO se especifican en `agentic-guidelines/Dtos.md`; la
implementación automatizada del componente está cubierta en
`apps/web/src/features/worst-ideas/worst-ideas.spec.tsx`.

El ranking ordena por cantidad de recepciones durante la semana, de mayor a
menor, y usa el título seguro ascendente para desempatar. El score de rúbrica
almacenado no cambia la posición, por lo que una idea con menos repeticiones no
puede superar a otra con más recepciones por haber recibido un score menor.

## Historial privado de ideas rechazadas

La tarjeta «Tu historial» la presenta `WorstIdeasUser` y consulta
`GET /api/account/worst-ideas` mediante el adaptador autenticado. La API requiere
una sesión activa y determina el propietario desde el access JWT validado. El
frontend no envía identificador de usuario. La lista muestra título seguro y
número de recepciones propias para esa idea, con cantidad descendente y título
ascendente como desempate.

La tarjeta distingue carga, error recuperable, persona sin sesión, historial
vacío e historial con datos. Sin sesión invita a crear una cuenta; con sesión
pero sin rechazos explica que el historial aparecerá al enviar una idea que sea
rechazada. Los errores permiten reintentar y no exponen datos del servidor. El
historial está limitado a diez filas, es privado, no se guarda en `localStorage`
y no muestra texto original, score, autor, embedding ni identificadores
internos. La migración
`018_user_rejected_ideas.sql` inicia el seguimiento sin retrocargar rechazos
anteriores. La API limita este endpoint a 30 solicitudes por minuto y dirección
IP, además del tope general de 120; ambos límites son locales al proceso y no
se comparten entre réplicas.

## Ranking de roast «Faltón máximo»

La sección `/descargate` obtiene `GET /api/roast-ranking` y presenta hasta diez
cuentas activas con mensajes de roast contabilizados. Destaca el primer puesto
como ganador y coloca los puestos 2–10 en una tabla. Solo muestra el alias y el
contador acumulado; el endpoint no expone IDs, correos ni mensajes enviados.
La interfaz valida el límite de diez y la forma de cada fila, y contempla
carga, error recuperable y lista vacía.
El endpoint tiene un límite dedicado de 30 solicitudes por minuto y dirección IP,
además del límite general de la API; los contadores son locales al proceso.

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
