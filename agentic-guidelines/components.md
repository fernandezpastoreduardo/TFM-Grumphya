# Describes naming & content guides to develope components referenced on sections.md or features.md

## Components del MVP

### IdeaInput

Componente presentacional local a `get-user-idea`. Captura una idea escrita, pegada o transcrita mediante área de texto y control de dictado; no elige el tono ni envía la evaluación. La etiqueta visible del campo es «1. Escribe, pega o dicta tu idea». El contenedor `GetUserIdea` gestiona el formulario en dos pasos: primero valida la idea y muestra «Adelante»; después permite seleccionar «Tengo la piel fina» o «Dame tu mejor golpe» y muestra «Evaluar idea». «Cambiar idea» vuelve al primer paso conservando el texto y el tono. Solo el envío del segundo paso llama a `onSubmit`; el dictado nunca envía automáticamente. Las tarjetas conservan sus acentos azul/rosa, con `idea-tone-soft-bandage-v2.png` para «piel fina» y `idea-tone-hard-boxing-v2.png` para «mejor golpe». El contenedor comunica intentos restantes, carga y errores; los campos y cambios de paso deben mantener etiquetas, validación accesible y foco coherente.

### EvaluationResult

Presenta veredicto, puntuación, riesgos, supuestos y próximos pasos. No calcula ni modifica el resultado.

### EvaluationFailureNotice

Componente presentacional local a `idea-evaluation`, mostrado dentro del diálogo de Home cuando una evaluación falla y el servidor confirma la liberación del intento. Presenta el mensaje y la ilustración `evaluation-error-spilled-coffee.png`; los resultados inciertos de transporte conservan su aviso textual neutro.

### RepeatedIdeaNotice

Informa de que la idea es semánticamente similar a otra, muestra el título público seguro y el contador total ya incrementado, y ofrece «Evaluar igualmente». La frase valorativa sigue el tono seleccionado (`soft` o `hard`). No presenta el texto original ni datos de autor. El endpoint de usos anónimos devuelve el cupo restante; detectar la coincidencia no lo consume y continuar reserva una evaluación.

### UsageLimitNotice

Explica que no quedan intentos y ofrece la acción que corresponda sin revelar reglas internas.

### UsageLimitDialog

Componente compartido por Home y Roast para informar que se ha agotado la cuota diaria de un plan. Recibe el ámbito (`ideas` o `roasts`), muestra el aviso correspondiente y ofrece ir a Planes. Se abre tras la respuesta autoritativa del servidor o cuando la actualización del perfil confirma que el contador del plan activo ha llegado a cero; la cuota gratuita por perfil de navegador mantiene su aviso independiente.

### LoginForm / CreateAccountForm

Formularios accesibles. Los errores de autenticación deben ser genéricos y nunca confirmar si un usuario existe. En Login, el campo de contraseña empieza oculto y un botón accesible «Mostrar/Ocultar» permite cambiar su visibilidad.

`RegisterWithPlan` es el contenedor de `features/register-with-plan/`: consulta la intención del plan al cargar `/crear-cuenta` y crea una cuenta pendiente, sin sesión ni plan. Después de verificar un enlace enviado por correo, presenta la confirmación explícita de la contratación simulada; al confirmar, el servidor activa cuenta, plan y sesión y la UI navega a `/perfil`. El CTA ofrece un mes de plan y usa el copy «Dáme de alta un mes y te pago el café». El panel lateral aclara que el plan no se renueva automáticamente y que para otro mes hay que volver a contratar. No obtiene el plan de query params ni concede permisos en cliente.

`CreateAccountForm` solicita email, alias, contraseña y una casilla inicialmente desmarcada con el texto «He leído la política de privacidad», enlazado a `/politica-de-privacidad`. La casilla obligatoria se envía como `privacyPolicyAcknowledged` y tiene error asociado y anuncio accesible. Un texto auxiliar cercano permite consultar `/terminos-y-condiciones`; no añade una aceptación separada. Email sintácticamente inválido puede dar mensaje específico; conflictos de email/alias comparten el mismo mensaje y respuesta genérica. El formulario distingue los estados de carga, error y alta pendiente, e informa que la cuenta no se activará hasta verificar el correo y confirmar el plan. Los enlaces llevan el token en el fragmento URL. La página lo lee y lo elimina de la barra de direcciones, pero no lo consume al abrirse: muestra «Confirmar correo» y solo tras pulsarlo envía la verificación. Sin SMTP en desarrollo se genera una vista previa local de correo, no un envío.

La vista `/politica-de-privacidad` publica la versión 4, fechada el 26 de octubre de 2026. El consentimiento opcional gestionado desde el perfil cubre los rankings de cuentas y es independiente de la casilla de lectura del alta. El ranking de rechazos no usa esa preferencia; se basa en el interés legítimo elegido para publicar títulos generados para ser seguros y cantidades con finalidad educativa. El filtro no garantiza evitar la identificación contextual; véase la evaluación interna.

`/terminos-y-condiciones` muestra el resumen sobre el tratamiento de las ideas y los dictados que antes aparecía en Home. No sustituye la versión 4 de `/politica-de-privacidad`.

### ErrorPages

Componente presentacional de las páginas 404, 429 y 500. Reutiliza el marco
compartido de navegación, tema y escena; usa una ilustración PNG transparente por
error que integra la mascota y los accesorios de la lámina aprobada. El 404 corresponde a rutas desconocidas,
el 429 al límite temporal de creación de perfiles anónimos y el 500 a errores
de renderizado React. Los errores recuperables de API permanecen en contexto.
El copy, las acciones y el contraste siguen `copy-style.md` y
`UI-aestethics.md`. Las rutas de previsualización solo existen en desarrollo.

Los componentes específicos permanecen dentro de su feature hasta que exista un segundo consumidor real.

### WorstIdeasAllTime / WorstIdeasAll

`WorstIdeasAllTime` y `WorstIdeasAll` presentan los rankings públicos de ideas rechazadas: el histórico (`GET /api/worst-ideas/all-time`) y el semanal (`GET /api/worst-ideas`). Cada uno muestra como máximo diez títulos seguros con su cantidad de recepciones, en orden descendente de cantidad y con título ascendente para desempatar. El histórico aparece antes del semanal; ambos excluyen autor y texto original. La retrocarga del histórico usa las filas que aún existen en el corpus cuando se aplica la migración y no recupera ideas purgadas previamente.

### WorstIdeasUser

Listado de hasta diez de las peores ideas del usuario logueado ordenado por veces que se han introducido de manera descendente. Se muestra el título seguro conceptual de la idea sin indicar identidad de ningún usuario implicado.

- Si el usuario no está logueado debe aparecer el contenido indicado en el prototipo:

  Tu historial
  Tú también tienes tus pinitos.
  Cuando tengas cuenta, aquí podrás revisar tus ideas rechazadas. Solo tú verás tu historial.

  Ver planes para crear una cuenta↗

- Si el usuario está logueado pero no tiene ideas rechazadas debe aparecer el siguiente contenido al estilo del prototipo:

  Tu historial
  Tú también harás tus pinitos.
  Cuando plantes alguno, aquí podrás revisar tus ideas rechazadas. Solo tú verás tu historial.

### Roast

- El contenedor `Roast` presenta la conversación siguiendo el formato de mensajería del prototipo y conecta el envío con la feature `submitRoast`.
- Los intercambios de muestra solo aparecen si no consta ningún envío previo. La UI detecta actividad comparando el cupo disponible con su valor inicial y, en cuentas, consultando además el contador acumulado de roast, que persiste aunque se reinicie la cuota diaria. Los mensajes enviados se muestran durante la sesión actual, el hilo se desplaza para mantener visible el intercambio más reciente, y no existe historial de texto para reconstruirlos al volver.
- El panel lateral «¿Te has quedado con ganas?» solo aparece a visitantes sin sesión o cuentas sin Faltón activo; las cuentas con Faltón activo no lo ven, aunque hayan agotado su cuota diaria.
- `RoastInput` permite escribir y enviar el mensaje, muestra el estado de envío y los errores, evita el doble envío y comunica los intentos restantes devueltos o confirmados por el servidor.
- `RoastInput` tiene etiqueta accesible, contador de caracteres, feedback anunciado por lectores de pantalla y contraste legible en los modos claro y oscuro.

### RoastRanking

- Componente local a `roast`, porque solo se utiliza en esa sección; recibe el estado del ranking y la acción de reintento desde su contenedor.
- Presenta hasta diez usuarios activos con envíos contabilizados, ordenados como describe `getRoastRanking`. Presenta el primer usuario como ganador, fuera de la tabla. La tabla contiene los puestos 2–10 y, en cada fila, únicamente el nombre de usuario y la cantidad de mensajes de roast.
- Contempla estados de carga, error recuperable y lista vacía, con nombres accesibles y feedback anunciado.

### BestUsers

- Componente presentacional local a `notable-humans`; recibe estado y callback de reintento del contenedor de la sección.
- Conserva el formato del prototipo: lista numerada, inicial de avatar, alias, contador y primer puesto resaltado. Muestra hasta diez usuarios.
- Expone estados accesibles de carga, error recuperable y lista vacía. El contenedor carga `getBestListBestUsers` y no incluye aliases ni aprobaciones de muestra.

### SubmitContactMessage

- Contenedor local a la feature `submit-contact-message`; gestiona estado, envío y feedback del formulario autenticado en `/contacto`.
- Tras guardar, la API intenta enviar una confirmación SMTP genérica; la UI distingue envío, vista previa local y fallo. Jappy puede leer los mensajes desde el panel y responder desde el buzón SMTP; la aplicación no usa IMAP. Los mensajes se purgan a los 12 meses mediante `DataRetentionService` y la baja física de la cuenta también los elimina por cascada. El asunto y cuerpo se guardan como texto claro, sin cifrado a nivel de aplicación; indicar que no se incluyan contraseñas ni datos de pago.

### ContactMessageForm

- Componente presentacional local a `submit-contact-message`; recibe asunto, mensaje, estados y callbacks desde `SubmitContactMessage`.
- Etiqueta los campos, aplica límites visibles de longitud, muestra el contador del mensaje y anuncia estados de error o éxito.
- El contenedor `SubmitContactMessage` lo usa en `/contacto` para sesiones autenticadas. Los visitantes sin sesión siguen viendo el formulario de demostración de `Contact`.

### AdminDashboard

- `AdminDashboard` es el contenedor del panel privado de Jappy, disponible solo en `/panel-control`. La ruta de panel y el item de navegación se muestran solo a admins en Home y en las páginas de sección; «Mi cuenta» conserva `/perfil` y muestra los datos personales, también para Jappy. El servidor vuelve a comprobar el rol para cada consulta.
- Mientras consulta los endpoints protegidos, presenta un esqueleto de carga accesible con `role="status"`, etiqueta y `aria-busy`; los bloques visuales se muestran tras un breve retraso para evitar parpadeos.
- La pestaña Resumen muestra ingresos y costes agregados, tendencia de ocho semanas, errores 5xx y mensajes recientes. Otras pestañas describen el benchmark, la telemetría sin ideas ni identificadores de sesión y las pruebas de seguridad; son informativas y no ejecutan tareas desde el navegador. Las métricas validan las respuestas antes de representarlas.
- El desglose de costes separa usuarios registrados, Jappy/admin y visitantes sin cuenta. Conserva atribución tras la baja física; los promedios incluyen gasto histórico de cuentas eliminadas en el numerador, pero estas ya no forman parte del denominador de cuentas activas.

### AdminErrorDetail

Vista local al panel de administración que carga un evento de error por ID desde la API protegida. Valida la respuesta antes de mostrarla; incluye estado HTTP, fecha, caso de uso y diagnóstico. Puede mostrar el texto de idea acotado conservado en errores 5xx de evaluación; los eventos sin contexto informan que no hay entrada guardada. El servidor exige sesión y rol admin.
