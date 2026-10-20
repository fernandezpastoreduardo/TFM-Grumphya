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
- Los heroes de sección presentan titular, introducción y mascota; no llevan
  una etiqueta o kicker independiente sobre el título ni el adorno «¿En serio?».
- El favicon apunta directamente a `/assets/grumphya/mascot-isotype.svg`, el
  mismo recurso SVG de Grumphya que ya sirve la navegación; no se mantiene una
  copia de favicon con URL y caché separadas.
- El texto del hero vive en HTML y sigue siendo editable. No forma parte de un
  asset gráfico.
- Fredoka se usa en titulares y Nunito Sans en lectura y controles, con fuentes
  variables locales en `apps/web/public/assets/fonts/`, con fuentes de sistema
  como alternativa. Sus licencias OFL se conservan junto a los archivos. Los
  pesos altos deben mantener buena separación entre caracteres.

## Escenario y assets

- La composición aprobada muestra el telón por arriba y las siluetas del público
  por abajo. Ambos elementos son decorativos, ocupan el ancho de la ventana y
  permanecen por encima del contenido cuando la página se desplaza.
- El CSS aplica más desenfoque al público que al telón. Los elementos
  interactivos y el texto permanecen nítidos y utilizables.
- Los assets SVG revisados se guardan en
  `ideas-and-designs/revision-vectorial/revisados/`. Se colocan según la lámina
  maestra; no se autotracean ni se reinterpretan. El público conserva su SVG;
  el telón usa el PNG transparente `stage-curtain.png`, y el haz de luz de Home
  se dibuja con CSS. Las capas de profundidad, desenfoques y adornos se
  resuelven con CSS.
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
  `good-practices-checklist.png`/`good-practices-validate-idea.png`,
  `notable-humans-hero.png`/`notable-humans-callout.png`,
  `contact-hero-phone.png`/`contact-message-tube.png`,
  `roast-vent.png`/`roast-plan-callout.png`,
  `worst-ideas-wall.png` y `login-credentials.png`/`login-privacy.png` para
  Descárgate, Peores ideas y Login. El hero de Mi cuenta usa
  `profile-account-shield.png`. Las dos ilustraciones de cada una de las
  secciones Buenas prácticas, Humanos notables y Contacto usan posturas y
  siluetas distintas. La mascota del hero de Planes se refleja horizontalmente
  para mirar hacia el contenido. El widget lateral de Contacto aporta su fondo
  blanco desde CSS; la ilustración mantiene su transparencia. Todas estas
  ilustraciones conservan el fondo transparente y no incluyen copy incrustado;
  la UI mantiene el contenido legible en HTML. Las escenas de error existentes
  siguen siendo sus propios assets. Home usa `home-grumpy-judge.png`: Grumphya
  aparece sentada como jueza con un mazo y sin bombilla tachada. Este asset
  reemplaza `home-idea-review.png`; el vestuario judicial es una excepción
  específica autorizada para esta escena y no modifica la regla general de
  identidad. El hero de `/panel-control` usa `admin-dashboard-audit.png`, con
  Grumphya examinando gráficas mediante una lupa. El hero de alta y su panel de
  plan usan
  `create-account-hero.png` y `create-account-plan.png` respectivamente.
  La mascota del hero de Home se encuadra con `contain` y posición inferior
  para que no quede cortada.
  El aviso de tratamiento de ideas y dictados ya no aparece en Home; su resumen
  se consulta en `/terminos-y-condiciones`, separado de la política de
  privacidad provisional. Las mascotas de hero flotan suavemente, los bloques
  entran al desplazarse y los controles responden al hover; las animaciones se
  desactivan con `prefers-reduced-motion`.
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
  En la Home, el hero mantiene 20 px entre su copy y 40 px entre los bloques
  principales, tanto en móvil como en escritorio.

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

## Aviso de cookies

Al montar la aplicación se muestra el popup «Ni galletitas ni galletitos» con
una ilustración de Grumphya pateando una galleta. El texto informa de que no se
usan cookies de terceros y de que las cookies propias se limitan a las
estrictamente necesarias para el funcionamiento y el uso anónimo y seguro. Los
botones «Aceptar» y «Denegar» tienen el mismo efecto: cierran el popup y no
cambian la configuración de cookies. La elección no se guarda en cookies ni en
otro almacenamiento del navegador, por lo que el aviso vuelve a aparecer al
cargar de nuevo la aplicación. Escape también lo cierra; el diálogo mantiene el
foco dentro y devuelve el foco anterior al cerrarse.

## Revisión de temas, responsive y accesibilidad (octubre de 2026)

La revisión comparó Home en claro y oscuro y Humanos notables en ambos temas en
escritorio. Encontró el selector de tema de las secciones fuera de la fila
principal y demasiado espacio entre el hero y el contenido. El header ahora
reserva una columna para el selector en escritorio y lo coloca junto al menú
móvil en tablet; el espacio entre hero y contenido usa un valor fluido y menor.
La revisión estática de los breakpoints confirma que la navegación se sustituye
por un menú móvil hasta 979 px y que los layouts de sección se apilan. No se
pudo capturar una ventana móvil real en este entorno; queda pendiente la
verificación visual con viewport de 390 × 844 px antes de dar por cerrada la
revisión responsive.

El menú móvil se comporta como diálogo modal: al abrir, enfoca el primer enlace;
Tab y Mayús+Tab recorren sus opciones sin salir del menú; Escape lo cierra y
devuelve el foco al disparador. El fondo de cierre no añade una parada de
teclado. El contraste de los pares base inspeccionados osciló entre 5,14:1 y
15,14:1. No se revisó cada combinación sobre ilustraciones, fondos con gradiente
ni estados interactivos.

Las fuentes variables Fredoka y Nunito Sans se sirven desde el propio proyecto;
la página no conecta con Google Fonts. Las rutas ya se cargan de forma diferida.
No se midieron LCP, CLS ni INP, por lo
que esta revisión no certifica Core Web Vitals. Para completarla, medir Home,
Humanos notables, Contacto, alta y `/panel-control` con Lighthouse en escritorio
y móvil, ambos temas y caché fría y caliente; revisar waterfall, bytes
transferidos y cambios de layout. Las siete ilustraciones transparentes de Buenas prácticas, Humanos
notables, Contacto y Mi cuenta se ajustaron a 900 px de lado máximo para su uso
en interfaz y pesan 3.584.291 B en total (aproximadamente 3,58 MB). El nuevo
`contact-message-tube.png` pesa 508.710 B y `profile-account-shield.png` pesa
527.469 B. Los assets de alta pesan 922.763 B (`create-account-hero.png`) y
887.500 B (`create-account-plan.png`); `stage-curtain.png` pesa 681.772 B.
Los nuevos `home-grumpy-judge.png` y `admin-dashboard-audit.png` son PNG
transparentes de 900 × 900 px. Pesan 901.242 B (aprox. 880 KiB) y 787.615 B
(aprox. 769 KiB), respectivamente; 1.688.857 B en conjunto (aprox. 1,69 MB /
1,61 MiB). Ambos respetan el límite de 900 px. Se incluirán en las mediciones
Lighthouse pendientes para cuantificar su efecto en la carga móvil.

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
En escritorio, el ranking ocupa la columna derecha junto al chat; en pantallas
estrechas queda debajo del chat. La interfaz valida el límite de diez y la
forma de cada fila, y contempla carga, error recuperable y lista vacía.
El endpoint tiene un límite dedicado de 30 solicitudes por minuto y dirección IP,
además del límite general de la API; los contadores son locales al proceso.

## Humanos notables

La sección `/humanos-notables` mantiene la clasificación visual del prototipo:
puesto, inicial del alias, nombre y cantidad de ideas aprobadas, con el primer
puesto destacado. `BestUsers` presenta los datos que obtiene el contenedor
`NotableHumans` desde `GET /api/best-users`; la API limita la lista a diez
cuentas activas y solo devuelve alias y cantidad de aprobaciones. Incluye estados
de carga, error con reintento y lista vacía; no muestra ideas aprobadas ni usa
datos de demostración.
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
