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
- En Home, el copy y el formulario de idea forman una tarjeta clara en la
  columna funcional; la columna de la mascota conserva su escenario. El
  textarea usa un tono verde muy claro para distinguirse de la tarjeta.
- El formulario de Home avanza en dos pasos: primero muestra «1. Escribe, pega
  o dicta tu idea» cuando el navegador admite reconocimiento local, y «1.
  Escribe o pega tu idea» cuando no; después muestra el textarea y «Adelante»,
  y a continuación la elección de tono y «Evaluar idea». El dictado no se
  ofrece si no se puede comprobar el soporte local. El botón «Borrar idea»,
  visible cuando hay texto, limpia el campo sin enviar nada. «Cambiar idea»
  conserva el texto y el tono elegidos.
  Al enviar la evaluación, el formulario vuelve al primer paso y conserva el
  texto de la idea; al cerrar el diálogo del resultado, la persona puede
  escribir o editar otra idea directamente. Tras recibir un resultado, la
  acción para volver a él dice «Volver a ver la evaluación».
- En el envío inicial, la API puede devolver una respuesta especial fija para
  una señal léxica contextual de Grumphya (nombre más vocabulario explícito de
  equivalencia, no basta mencionar una app, o evaluar/analizar/revisar + ideas
  - negación explícita de desarrollarlas), la frase completa «Un/Una X pero
    con IA», un insulto breve aislado no reportado/citado o un texto muy breve.
    Home presenta
    esas respuestas en un diálogo con `SpecialIdeaCaseNotice`; no son resultados
    de la rúbrica. La clasificación ocurre en el servidor antes de similitud y
    del evaluador. Cada respuesta consume un intento; un reintento idempotente
    con la misma clave y el mismo contenido recupera la respuesta durante 24
    horas desde la reserva original, sin extender el TTL ni consumir otro. El
    diálogo se cierra con el control habitual «Cerrar resultado»; el caso de
    insulto añade el enlace «Me atrevo» a Descárgate. El copy de los cuatro
    casos es una excepción literal solicitada por producto a las
    recomendaciones generales de estilo.
- Los heroes de sección presentan titular, introducción y mascota; no llevan
  una etiqueta o kicker independiente sobre el título ni el adorno «¿En serio?».
- En escritorio, los heroes de sección toman su altura del titular y la
  introducción; la mascota ocupa el espacio lateral sin imponer una altura
  mínima. La separación con el contenido se conserva en el espaciado del marco.
- En la Home de escritorio, el bloque de evaluación define la altura del hero y
  la ilustración se ajusta a ella. El titular no conserva una altura mínima
  propia.
- El favicon apunta directamente a `/assets/grumphya/mascot-isotype.svg`, el
  mismo recurso SVG de Grumphya que ya sirve la navegación; no se mantiene una
  copia de favicon con URL y caché separadas.
- El texto del hero vive en HTML y sigue siendo editable. No forma parte de un
  asset gráfico.
- Fredoka se usa en titulares y Nunito Sans en lectura y controles. Ambas se
  sirven como fuentes variables WOFF2 desde `apps/web/public/assets/fonts/`, con
  fuentes de sistema como alternativa. Los TTF originales se conservan como
  respaldo y sus licencias OFL permanecen junto a los archivos. Los pesos altos
  deben mantener buena separación entre caracteres.

## Escenario y assets

- La composición aprobada muestra el telón por arriba y las siluetas del público
  por abajo. Ambos elementos son decorativos, ocupan el ancho de la ventana y
  permanecen por encima del contenido cuando la página se desplaza.
- El telón usa una cenefa horizontal en azul marino oscuro, a juego con las
  siluetas del público. Su borde inferior cae suavemente hacia los extremos y
  no incluye paños laterales ni el borde vertical de atado. Su volumen vertical
  se redujo; el WebP conserva pliegues discretos y transparencia, sin filtros ni
  desenfoque CSS. El público muestra
  más cabezas pequeñas vistas desde más lejos y ocupa una franja menos alta. El
  desenfoque de su borde superior y el desvanecido a transparencia forman parte
  del WebP; CSS no aplica opacidad ni filtro al público.
- Los assets SVG revisados se guardan en
  `ideas-and-designs/revision-vectorial/revisados/`. Se colocan según la lámina
  maestra; no se autotracean ni se reinterpretan. El marco común usa el WebP
  transparente `stage-curtain-v2.webp` y el WebP transparente
  `audience-rounded.webp`; el haz de luz de Home se dibuja con CSS. Las capas
  de profundidad y adornos se resuelven con CSS.
- Los rayos y formas de color rodean hero y acciones como paréntesis visuales,
  conservan aire respecto a los controles y no se solapan con ellos.

## Controles y temas

- Los botones principales y controles clicables siguen el lenguaje turquesa de
  la acción, con foco visible y estados accesibles.
- Las tarjetas de tono «Tengo la piel fina» y «Dame tu mejor golpe» son la
  excepción de color: mantienen sus fondos azul y rosa y texto negro también en
  modo oscuro. La tarjeta suave usa la pose con venda
  `idea-tone-soft-bandage-v2.svg`; la intensa, la pose de boxeo
  `idea-tone-hard-boxing-v2.svg`. Cada tarjeta integra la ilustración desde el
  borde inferior izquierdo, dejando aire sobre la mascota y el texto a su
  derecha.
- El cambio claro/oscuro se presenta como un switch con sol y luna en los
  extremos y un accionador claro que se desplaza entre ambos; el accionador no
  contiene otro icono. El selector de tono sigue siendo un control separado.
- En modo oscuro, los controles y superficies claras conservan texto oscuro;
  los diálogos y paneles oscuros conservan texto claro. Se comprueba también
  la combinación de colores de popups, avisos y botones secundarios.
- En modo oscuro, el detalle de error del panel de administración conserva
  texto oscuro sobre su tarjeta clara y enlaces teal legibles.
- Home refresca desde el servidor los intentos de la cuenta al finalizar cada
  evaluación; Roast los actualiza al completar un envío válido o detectar que
  se agotó la cuota. Cuando el contador diario del plan activo llega a cero,
  ambas secciones muestran un diálogo compartido y específico para ideas o
  roast, con acceso a Planes y el aviso de que los intentos vuelven mañana. La
  cuota gratuita conserva su aviso propio.
- Los errores de evaluación distinguen una respuesta HTTP que confirma que la
  operación falló de un fallo de transporte o una respuesta incompleta. Solo
  cuando el servidor confirma que liberó la reserva se informa que no se
  descontó el intento; en los casos inciertos, el mensaje no afirma qué ocurrió
  con la cuota.
- El fallo confirmado de evaluación se presenta dentro del diálogo de
  evaluación con una ilustración de Grumphya junto a café derramado. Los fallos
  cuyo resultado o consumo es incierto mantienen un aviso textual sin esa
  afirmación de cuota.
- Si `POST /api/roast` responde `503 ROAST_REPLY_UNAVAILABLE`, Descárgate muestra
  un diálogo titulado «Se nos ha derramado el café». El servidor libera la
  reserva en este error, así que el diálogo confirma que no se descontó el
  envío. Cerrar el aviso conserva el texto para que se pueda volver a intentar;
  los errores con otros códigos siguen en el contexto del formulario.
- La revisión de contraste cubre Home (incluidos radio, notas y errores), los
  códigos de las páginas de error, la navegación y las vistas de Planes,
  Contacto, Buenas prácticas, Humanos notables, Descárgate, Peores ideas y
  Login. Los textos de controles mantienen tamaño y peso coherentes; los
  estados activos del nav usan el rosa de «Dame tu mejor golpe» con texto
  oscuro. En los errores, el código numérico conserva tinta oscura sobre el
  amarillo también en el tema oscuro.
- En la comprobación móvil de Home a 412 × 823 px, el contador de caracteres
  mantiene al menos 4,5:1 de contraste con el fondo del textarea. Es una
  comprobación automatizada de ese par de texto y fondo; no amplía la revisión
  al resto de combinaciones visuales.
- El enlace anónimo para crear una cuenta en Peores ideas conserva al menos
  4,5:1 de contraste en ambos temas; la comprobación Playwright se ejecuta a
  390 × 844 px.
- En el panel de administración, los desgloses de coste se apilan en móvil y
  las tablas con muchas columnas se desplazan dentro de su propio contenedor,
  sin ampliar el ancho de la página.
- Las secciones tienen ilustraciones SVG transparentes propias de Grumphya,
  distintas entre sí y de los assets reutilizados del marco: `plans-coffee.svg`
  para Planes, `ultrachachi-reality-check.svg` para su popup, y
  `good-practices-checklist.svg`/`good-practices-validate-idea.svg` y las dos
  figuras decorativas `good-practices-companion-pink.svg`/
  `good-practices-companion-yellow.svg`,
  `notable-humans-hero.svg`/`notable-humans-callout.svg`,
  `contact-hero-phone.svg`/`contact-message-tube.svg` y
  `contact-form-vanishing.svg` para el popup del formulario de demostración,
  `descargate-boxing-bag.svg`/`roast-plan-callout.svg`,
  `worst-ideas-wall.webp` y `login-credentials.svg`/`login-privacy.svg` para
  Descárgate, Peores ideas y Login. El hero de Mi cuenta usa
  `profile-account-shield.svg`. Las dos ilustraciones de cada una de las
  secciones Buenas prácticas, Humanos notables y Contacto usan posturas y
  siluetas distintas. La mascota del hero de Planes se refleja horizontalmente
  para mirar hacia el contenido. El widget lateral de Contacto aporta su fondo
  blanco desde CSS; la ilustración mantiene su transparencia. En móvil, la
  mascota del popup del formulario aparece encima del título y el texto. Todas estas
  ilustraciones conservan el fondo transparente y no incluyen copy incrustado;
  la UI mantiene el contenido legible en HTML. Las escenas de error existentes
  siguen siendo sus propios assets. Home usa `home-grumpy-judge.webp`: Grumphya
  aparece sentada como jueza con un mazo y sin bombilla tachada. Este asset
  reemplaza `home-idea-review.png`; el vestuario judicial es una excepción
  específica autorizada para esta escena y no modifica la regla general de
  identidad. El hero de `/panel-control` usa `admin-dashboard-audit.svg`, con
  Grumphya examinando gráficas mediante una lupa. El hero de alta y su panel de
  plan usan
  `create-account-hero.svg` y `create-account-plan.svg` respectivamente.
  La mascota del hero de Home se encuadra con `contain`, posición inferior y
  reflejo horizontal para que mire hacia el formulario y no quede cortada.
  El aviso de tratamiento de ideas y dictados ya no aparece en Home; su resumen
  se consulta en `/terminos-y-condiciones`, separado de la política de
  privacidad versión 4. Las mascotas de hero flotan suavemente, los bloques
  entran al desplazarse y los controles responden al hover; las animaciones se
  desactivan con `prefers-reduced-motion`.
- Para crear nuevas poses se usan como modelo los SVG aprobados de
  `ideas-and-designs/revision-vectorial/revisados/` y las escenas completas
  `error-scene-404.svg`, `error-scene-429.svg` y `error-scene-500.svg`. La
  especie, silueta, proporciones, cara gruñona, paleta turquesa y contorno
  grueso de Grumphya no se reinterpretan. Solo varían la pose y los accesorios
  sencillos que requiera cada sección; no se añaden rasgos físicos, ropa ni
  expresiones alegres. Cada ilustración debe conservar transparencia, carecer de texto
  y revisarse a tamaño real sobre fondos claros y oscuros. Si la mascota deja
  de parecer la misma, se descarta y se vuelve a generar. La primera muestra
  validada para esta tanda es `plans-coffee.svg`.
- La sección Peores ideas usa el título «El muro de la vergüenza».
- La versión de escritorio y la móvil conservan la misma identidad. En móvil,
  la composición se apila y mantiene separación entre grupos para que el
  textarea, las opciones, la acción y la mascota se lean como pasos distintos.
  En las páginas de sección, la mascota del hero se recoloca después del
  contenido principal en móvil para evitar que compita con el titular.
  En la Home móvil, el copy del hero se alinea a la izquierda y el resultado de
  evaluación permanece centrado.
  Los callouts ilustrados de Buenas prácticas y Humanos notables también se
  apilan en móvil, con la mascota centrada sobre el texto.
  En la Home, el hero mantiene 20 px entre su copy y 40 px entre los bloques
  principales, tanto en móvil como en escritorio.

## Navegación móvil y accesibilidad

- El navbar de Home es sticky, tiene el mismo fondo temático que la página y se
  apila por encima del formulario al desplazarse, manteniendo la separación del
  telón. Los diálogos globales conservan prioridad sobre toda la interfaz.
- En ventanas de hasta 979 px, Home y las páginas de sección usan el menú
  compacto. Desde 980 px, muestran los enlaces mientras caben con la marca y
  los controles del encabezado; cuando no caben, también cambian al menú
  compacto. La comprobación usa el ancho disponible y se actualiza al cambiar
  el tamaño de ventana o el zoom, cuando cambian los enlaces y cuando terminan
  de cargarse las fuentes. En escritorio (desde 980 px), la navegación de Home
  y de las páginas de sección se coloca 16 px más arriba.
- El menú compacto cambia entre icono de menú y X. Al abrirlo, aparece una capa
  que atenúa y bloquea el contenido de fondo; el panel permanece por encima de
  esa capa y puede recibir clics. Pulsar fuera cierra el menú sin activar el
  contenido que queda debajo.
- El panel y la capa se montan en un portal del documento para evitar que los
  contextos de apilado de la página los coloquen bajo el velo o las ilustraciones.
- Los SVG decorativos se ocultan a tecnologías de asistencia. Los controles
  tienen semántica nativa, nombre accesible, estado anunciado y foco visible.
  Los colores no son la única forma de comunicar selección o estado.

## Aviso de cookies

Al montar la aplicación se muestra el popup «Ni galletitas ni galletitos» con
una ilustración de Grumphya pateando una galleta. El texto informa de las cookies
propias y del almacenamiento local que se usan, y declara que no hay publicidad,
analítica ni cookies de terceros. El botón «Entendido» solo confirma la lectura;
no solicita consentimiento ni altera la configuración. La confirmación se
recuerda en `localStorage` (`grumphya.privacy-notice.acknowledged.v1`), no en una
cookie. Un enlace permite abrir la política de privacidad. Si el almacenamiento
no está disponible o se limpia, el popup vuelve a mostrarse. Escape también lo
cierra; el diálogo mantiene el foco dentro y devuelve el foco anterior al
cerrarse. La prueba E2E específica comprueba la persistencia entre navegación y
recarga; las demás pruebas Playwright empiezan con el aviso ya confirmado.

## Revisión de temas, responsive y accesibilidad (octubre de 2026)

La revisión comparó Home en claro y oscuro y Humanos notables en ambos temas en
escritorio. Encontró el selector de tema de las secciones fuera de la fila
principal y demasiado espacio entre el hero y el contenido. El header ahora
reserva una columna para el selector en escritorio y lo coloca junto al menú
móvil en tablet; el espacio entre hero y contenido usa un valor fluido y menor.
La revisión estática de los breakpoints confirma que la navegación se sustituye
por un menú móvil hasta 979 px y que los layouts de sección se apilan. El E2E
comprueba algunas posiciones y tamaños en viewport de 390 × 844 px, incluido el
apilado de la mascota de sección y el tamaño mínimo de los campos. También
comprueba la posición de la navegación a ambos lados del breakpoint (979 y
980 px) y en escritorio a 1280 px. Estas aserciones de layout no sustituyen la
revisión visual manual en esos viewports, que sigue pendiente.

La navegación también se adapta al desbordamiento en escritorio: una prueba
E2E comprueba Home y una página de sección al cambiar el ancho, y una prueba
unitaria verifica el recálculo cuando cambia el espacio disponible o el texto
de los enlaces. El menú compacto conserva el comportamiento de teclado descrito
arriba.

En la actualización del 24 de octubre se añadieron comprobaciones del viewport
móvil de 390 px: el perfil, sus tarjetas y el documento no deben desbordar el
ancho disponible; el callout de roast pasa a una columna y «Borrar idea» mide
40 × 40 px, igual que el control de dictado cuando está disponible. Son
comprobaciones automatizadas de layout, no una revisión visual manual en un
dispositivo real. El dictado permanece oculto en Android aunque se detecte la
API de voz; la entrada escrita sigue disponible.

El menú móvil se comporta como diálogo modal: al abrir, enfoca el primer enlace;
Tab y Mayús+Tab recorren sus opciones sin salir del menú; Escape lo cierra y
devuelve el foco al disparador. El fondo de cierre no añade una parada de
teclado. El contraste de los pares base inspeccionados osciló entre 5,14:1 y
15,14:1. No se revisó cada combinación sobre ilustraciones, fondos con gradiente
ni estados interactivos.

## SEO básico

El HTML inicial incluye una descripción en español de Grumphya. `robots.txt`
permite el rastreo general y excluye `/login`, `/crear-cuenta`, `/perfil` y
`/panel-control`; estas reglas orientan a los rastreadores y no protegen esas
rutas ni sustituyen la autenticación del servidor.

Las fuentes variables Fredoka y Nunito Sans se sirven desde el propio proyecto;
la página no conecta con Google Fonts. Las rutas ya se cargan de forma diferida.
Durante el build, Home y las secciones públicas se prerenderizan con React en
HTML y CSS iniciales que Nginx sirve directamente. La lista está en
`apps/web/src/shared/prerendered-public-routes.json` y la misma configuración
alimenta el servidor de desarrollo. `main.tsx` hidrata el contenido con
`hydrateRoot`. Las rutas de cuenta y las que dependen de tokens o parámetros de
la URL mantienen el montaje cliente para respetar sus comprobaciones de sesión
y estado por solicitud.
Los informes Lighthouse 13.5.0 de Home y Peores ideas capturados el 29 de
octubre de 2026 entre las 15:34 y las 15:36 UTC son la línea base anterior a
los cambios de assets, skeleton y contraste descritos aquí: Home registró
rendimiento 0,79 y LCP 5,58 s; Peores ideas, rendimiento 0,56, LCP 6,63 s y
CLS 0,458, con una contribución de 0,4509 atribuida al bloque del ranking. El
informe móvil previo de Home, capturado ese día a las 14:05 UTC, registró
rendimiento 0,76 y LCP 7,38 s. No hay una medición Lighthouse posterior a
estos cambios, por lo que no se afirma una mejora en las métricas. Para
completar la revisión, medir Home, Humanos notables, Contacto, Descárgate, alta
y `/panel-control` con Lighthouse en escritorio y móvil, ambos temas y caché
fría y caliente; revisar waterfall, bytes transferidos y cambios de layout. Las siete ilustraciones transparentes
de Buenas prácticas, Humanos notables, Contacto y Mi cuenta se ajustaron a
Los assets SVG sustituyen las ilustraciones PNG de la app, excepto el telón y el
público, que se conservan como WebP. Las versiones activas son SVGOMG en
`apps/web/public/assets/grumphya/`; las vectorizaciones adjuntas sin optimizar
se archivan en
`ideas-and-designs/revision-vectorial/revision-png-svg-fase1-2026-10/svg-vectorizados-originales-adjuntos-2026-10/`,
y las salidas de SVGOMG junto con el detalle de pesos están en
`ideas-and-designs/revision-vectorial/revision-png-svg-fase1-2026-10/svgomg-optimized/adjuntos-rondas-recientes-2026-10/`.
El isotipo activo mide 144 × 117 px y pesa 19.013 B; `admin-dashboard-audit.svg`
mide 900 × 900 px y pesa 73.585 B. No se ha medido el efecto de este cambio
en Lighthouse.
`worst-ideas-wall.webp`, usado en el hero de Peores ideas, mide 600 × 480 px y
pesa 44.232 B. El sello S4 del footer usa una variante móvil de 84 × 84 px y
4.788 B para pantallas de hasta 767 px; en tamaños mayores usa la imagen
principal de 128 × 128 px y 7.550 B. En el ranking público, el skeleton
representa las diez filas máximas y conserva la altura de la tarjeta al recibir
una respuesta con diez resultados; la comprobación E2E mide ese caso límite en
móvil.
En Descárgate, el hilo ocupa la altura de su contenido hasta un máximo de 420
px y permite desplazamiento interno si lo supera. No impone altura mínima:
cuando no hay historial, el compositor queda más cerca del mensaje de estado.
Una prueba E2E móvil comprueba el límite de altura del hilo y que no impone un
mínimo; otra confirma que el compositor sube cuando no hay historial. Una
tercera comprueba que el enlace principal al plan Faltón mantiene al menos 4,5:1
de contraste en ambos temas y en reposo y hover. Son verificaciones de layout y
contraste, no una medición CLS de Lighthouse.
`cookie-kick.webp`, usado por el aviso de privacidad, mide 570 × 380 px y pesa
97.170 B. La conversión de `audience-rounded.png`, `home-grumpy-judge.png` y
`cookie-kick.png` a WebP conserva transparencia y reduce el peso conjunto de
645.212 B a 460.094 B (185.118 B, aproximadamente un 28,7 %); no se ha medido
un cambio de puntuación Lighthouse.
Las versiones SVGOMG activas de la ilustración de Descárgate y las dos tarjetas
de tono pesan 205.536 B en conjunto: `descargate-boxing-bag.svg`, 67.914 B;
`idea-tone-soft-bandage-v2.svg`, 72.991 B; y `idea-tone-hard-boxing-v2.svg`,
64.631 B. Las tres conservan transparencia.

## Ranking público de ideas rechazadas

La ruta `/lo-peor-de-lo-peor` presenta «El muro de la vergüenza». Antes de enviar una idea, el formulario avisa: «Si rechazamos tu idea, podemos mostrar un título filtrado y su número de recepciones en «Worst Ideas». El filtro no garantiza anonimato. Consulta la política de privacidad.» Primero,
`WorstIdeasAllTime` obtiene el ranking histórico de `GET /api/worst-ideas/all-time`;
después, `WorstIdeasAll` obtiene el semanal de `GET /api/worst-ideas`. No incluyen
filas de ejemplo. Cada fila muestra su puesto, título seguro y número de
recepciones del periodo correspondiente. El pie aclara que no se muestran autor
ni texto original. Cada endpoint limita su ranking a diez ideas y los
componentes validan el contrato de cada fila.

Mientras esperan las respuestas, anuncian la carga de cada ranking. Si una
petición falla o el JSON no cumple el contrato, su bloque muestra un mensaje
genérico y un botón «Volver a intentarlo». Una respuesta válida vacía se muestra
como un estado informativo, y una lista con datos se presenta como lista
ordenada con nombre accesible. Las peticiones se cancelan al desmontar cada
componente; no se reflejan detalles internos del error.

Las filas y mensajes mantienen texto oscuro sobre superficies claras también
en el tema oscuro. En pantallas estrechas las filas reducen sus columnas,
espaciado y tipografía para conservar la lectura del puesto, título y cantidad.
El endpoint y el DTO se especifican en `agentic-guidelines/Dtos.md`; la
implementación automatizada del componente está cubierta en
`apps/web/src/features/worst-ideas/worst-ideas.spec.tsx`.

El ranking histórico ordena por cantidad total de recepciones, de mayor a
menor, y usa el título seguro ascendente para desempatar. El semanal mantiene
ese orden aplicado a las recepciones de la semana. El score de rúbrica
almacenado no cambia la posición de ninguno de los dos rankings. La tabla
histórica se inicia con los registros que siguen disponibles en el corpus al
instalar su migración; no puede reconstruir ideas que ya se habían purgado.

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
cuentas activas con consentimiento de ranking vigente y mensajes de roast contabilizados. Destaca el primer puesto
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
cuentas activas con consentimiento de ranking vigente y solo devuelve alias y cantidad de aprobaciones. Incluye estados
de carga, error con reintento y lista vacía; no muestra ideas aprobadas ni usa
datos de demostración.
El endpoint tiene un límite dedicado de 30 solicitudes por minuto y dirección IP,
además del límite general de la API; los contadores son locales al proceso.

## Errores

Las rutas desconocidas muestran el 404 con la criatura indicando una puerta
equivocada; los fallos de renderizado muestran el 500 con una llama pequeña y
la mascota tranquila; y el límite temporal de creación de perfiles muestra el
429 con la criatura impaciente. Las tres pantallas heredan navegación, telón,
público, tema y pie del marco común; cada una usa una ilustración SVG
transparente que integra mascota, accesorios, proporción y solapes de su lámina:
puerta, tarima y cartel de X en 404; brasero con llama en 500; señal de mano y
barrera en 429. El copy y las acciones permanecen como contenido HTML.
El copy, los siguientes pasos y las rutas locales de revisión están descritos
en [`error-pages.md`](error-pages.md).

## Código fuente principal

- Composición Home, copy del hero y menú: `apps/web/src/views/home.tsx`.
- Marco común, hero y menú de secciones: `apps/web/src/shared/components/section-page-frame.tsx`.
- Tipografía, capas, responsive y controles: `apps/web/src/style.css`.
