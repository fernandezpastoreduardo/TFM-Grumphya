**Sections:**
if you need more info about any feature of any section refer to ./agentic-guidelines/features

1. Home

- Path: /
- Layout:
  - There´s a field where user can text, paste or speak to give user´s idea to the app
  - There´s a mode chooser with two possibilities:
    - "Dame tu mejor golpe": Fully rude response after evaluation
    - "Tengo la piel fina": Much less rude response after evaluation
  - A button to submit idea to the app
  - In both cases results should be the same (the result of idea analysis) but with different rudeness.
  - When user click on submit button prompt (typed, pasted or transcrypted from speech) should be sanitized for security.

- Features:
  Here, the feature is only capturing the input content from user. It can be added pasting text, writing or using a microphone. This one will require speech-to-text conversion in order to add user speech as text in the layout input. - Case use: User is insulting instead proposing idea. In this case a popup appears with main character illustration with a lanthern pointed from low angle to his face (as campament kids do when they tell themselves escary stories near to firecamp) with this copy: "A llorar a la llorería" Para esto tenemos la sección "Descárgate a gusto". A ver si me haces sudar... - Case use: User inputs same app idea as Grumphya. In this case a popup appears with main character illustration laughing in a sinister way with this copy: Sería muy triste que tuviese que hacerte desaparecer por querer copiar una app que me da ni para pagarme un café... Por esta vez lo dejo pasar.
  Error path: User does not submit any content put presses the submit button. Warn user with a popup in same style as the rest of the app. - Case use: User submits an idea which is not any of the other prior cases but is not an app or business idea or system is unable to identify what submit means. Show popup with copy: Anda, aclárate primero y luego me cuentas. Si yo no puedo entenderte nadie lo hará. - Flujo implementado: `IdeaSubmissionService` valida la idea y ejecuta `searchSimilarIdea` contra el corpus de rechazadas antes de `evaluationProcess`. OpenAI crea una firma semántica efímera; pgvector obtiene hasta 20 candidatas más cercanas, sin corte coseno fijo; el comparador confirma misma finalidad y público/objeto. Con match, `updateWorstIdea` cuenta la recepción una sola vez y la UI muestra título seguro y contador; si la evaluación posterior también rechaza, no vuelve a sumar. La UI ofrece continuar. Una cuenta autenticada con Iluminado vigente consume hasta 11 evaluaciones por día local de Madrid; la reserva se libera al mostrar solo el aviso y se confirma al terminar con una respuesta válida. Los errores liberan la reserva. La misma clave/payload devuelve la respuesta cacheada durante 24 horas desde la reserva original (TTL lógico); los reintentos no amplían ese plazo. La tarea horaria elimina físicamente las respuestas vencidas; el borrado puede ocurrir hasta una hora después del TTL. Una reserva en curso devuelve `409` hasta que pasen 30 minutos. Sin match, se evalúa y un rechazo nuevo llama `addToWorstIdeas` con título seguro y embedding, sin guardar texto fuente. No se leen evaluaciones previas. Los perfiles anónimos mantienen contadores independientes de 3/3, que se purgan tras 400 días sin actividad.

2. Worst Ideas

- Path: /lo-peor-de-lo-peor
- Layout: el ranking histórico y el semanal se apilan en la columna principal; el ranking privado del usuario ocupa la columna secundaria
  - «Desde el inicio»: «Las peores ideas de todos los tiempos»
  - «Semana actual»: «Ideas que necesitan sentarse»
  - Worst current logged user's ideas
    - Copy: Tú también haces tus pinitos. Estos son los peores que has plantado... hasta ahora.
- Features:
  - getIdeaListWorstAllTime: el componente implementado `WorstIdeasAllTime` consume `GET /api/worst-ideas/all-time` antes del semanal.
  - getIdeaListWorstAll: el componente implementado `WorstIdeasAll` consume la respuesta semanal.
  - getIdeaListWorstUser: el componente implementado `WorstIdeasUser` consulta `GET /api/account/worst-ideas`; requiere sesión autenticada y muestra solo las ideas rechazadas del propietario, ordenadas por cantidad descendente.
    - Si no hay sesión válida, el historial muestra una invitación a crear cuenta. Si la cuenta no tiene rechazos, muestra un estado vacío; no hay historial anónimo ni uso de `localStorage`.
- `WorstIdeasAllTime` carga primero el ranking público histórico desde `GET /api/worst-ideas/all-time`; debajo, `WorstIdeasAll` carga el ranking de la semana desde `GET /api/worst-ideas`. Ambos validan el contrato en ejecución y presentan estados de carga, error recuperable, lista vacía y resultados con el mismo formato. Solo muestran título seguro y cantidad de recepciones; nunca usuario, texto original ni identificadores de autor. Los contratos API y su orden están especificados en `Dtos.md`.

3. "Vent / Roast to your heart's content" section

- Path: /descargate
- Muestra tres intercambios de ejemplo como demostración inicial; tras enviar
  mensajes, presenta las respuestas de la sesión junto con el ranking Roast.
  Permite 3 envíos gratuitos por perfil de navegador; el servidor purga el perfil tras 400 días sin actividad a visitantes y a cuentas autenticadas sin Faltón vigente. Faltón vigente concede 11 envíos diarios, sin consumir el cupo gratuito de roast. El backend reserva la cuota adecuada transaccionalmente y la confirma solo al entregar una respuesta válida; ante un error libera la reserva. La API genera la respuesta con OpenAI y valida su forma y contenido antes de devolverla. Las peticiones autenticadas son idempotentes por clave/payload durante 24 horas lógicas desde la reserva original; las cachés vencidas se eliminan por lotes al arrancar y cada hora. Una reserva en curso devuelve `409` durante 30 minutos.
- `getRoastRanking` presenta hasta diez usuarios con consentimiento de ranking activo y roast contabilizado: el primer puesto aparece como ganador y los puestos 2–10 en tabla con alias, avatar opcional y número de mensajes. El endpoint público no expone identificadores, correos ni mensajes enviados.

4. Notable Humans section: a ranking/list of humans whose ideas have actually passed the AI's approval evaluation (without showing the ideas themselves). The goal is to spark a bit of rivalry and gamify the experience.
   - Path: /humanos-notables
   - Features:
     - `getBestListBestUsers` entrega hasta diez cuentas activas con consentimiento de ranking vigente, ordenadas por cantidad de aprobaciones; mostrar alias, avatar opcional y número de aprobaciones. Nunca título, texto, resumen ni evaluación de sus ideas aprobadas.
     - El componente `BestUsers` sigue el formato del prototipo y resalta el primer puesto.
     - UI must be a part of copy to encourage user to have the next great idea to be in that ranking.

5. Contact section:
   - The section hero uses the transparent `contact-hero-phone.png` Grumphya
     illustration. The right callout uses `contact-message-tube.png` over a
     white UI surface, with a side-on message-sending pose distinct from the
     hero. Both keep the established grumpy mascot identity.
   - Features:
     - Visitors without a session see the demonstration form: interacting with it fades it out and opens the joke popup. It does not send or store a message.
     - Authenticated users see the `SubmitContactMessage` form in the same view. It stores a validated subject and message in PostgreSQL, linked to the session owner, and confirms that the message was recorded. It is available to any authenticated account, regardless of plan status.
     - The message endpoint requires an authenticated access-token session, an exact `WEB_ORIGIN` match and JSON; it accepts no client-supplied user ID, disables caching, and is rate-limited to five submissions per minute per IP in addition to the general API limit. These in-memory limits are per process. Message content, recipient and reply body are not logged. The inbox is available only to Jappy through the protected admin dashboard; regular users cannot read messages. The API sends a generic SMTP receipt after saving and lets Jappy reply to the account email from the dashboard. The reply body is not stored. A delivery with uncertain status requires webmail review before one retry; the app does not read replies through IMAP. Messages have no configured retention period and are physically removed on account deletion through the foreign-key cascade. Define a retention/purge policy and update the privacy notice before opening this flow to real users.

6. "Good Practices / Why this matters" section:
   Used to explain the real utility of the tool beyond the general rude tone.
   The goal is to help people avoid non-viable projects given the cost of AI,
   the time and technical knowledge required, and the issues around
   vibe-coding. This is the only part of the app whose copy avoids the
   rude/sarcastic tone. Current content guides people to find the real
   problem, check assumptions and build the smallest useful test; a note says
   generative tools do not replace product judgment, technical review,
   security or user testing, and each use has a cost. There is no editorial
   review stamp. Grumphya keeps the established
   grumpy, skeptical face and recognizable proportions. A section-specific
   pose or accessory may signal practical support without making the mascot
   cheerful or changing its identity. The hero uses the transparent
   `good-practices-checklist.png` asset and the note uses
   `good-practices-validate-idea.png` in a distinct crouched inspection pose.
   The older
   `ideas-and-designs/ayudar.png` reference does not override the mascot
   identity rules in `UI-aestethics.md`.

7. "Pricing"
   An standar princing plan page. Keeping copy, UI styles.
   Pricing Cards:

   - Iluminado Plan: for €2 a month, it lets you submit eleven (yeah, eleven) ideas a day.

   - Faltón Plan: for 1€ per month lets you use the "Descárgate a gusto" feature eleven times a day (que si, ooonce). Includes a "Heckler of the Day" ranking if you make the AI sweat (leaving it speechless or without a good comeback for your insult).

   - "UltraChachi" es una oferta humorística ficticia de 10 € por uso ilimitado de Grumphya; no permite contratarla. Al pulsarla abre el popup de la criatura iluminada desde abajo con una linterna. El mensaje dice:

   ¿Aún estamos así de verde?
   Esta lección es gratis:
   La IA es cara.
   NADIE te ofrecerá algo potenciado por IA sin cobrarte más a mes, o por cada uso.
   Si lo hacen, será porque venderán tus datos, y aquí no hacemos eso.
   Tus buenas ideas, las aprobadas, son tuyas y solo tuyas.
   - Features:
     - Al elegir Iluminado o Faltón sin sesión, enviar el plan por `POST` al servidor para crear una intención temporal de alta y navegar a `/crear-cuenta` sin parámetros de plan en URL. El servidor conserva el plan y valida su vigencia; la integración de pagos reales queda para medio plazo.
     - Una sesión autenticada que elige un plan desde `/precios` navega a `/perfil` para contratar allí el plan inactivo. Una cuenta autenticada que abre `/crear-cuenta` también se redirige a `/perfil`.
     - UltraChachi es una tarjeta humorística con popup, no un plan contratable ni una promesa real de uso ilimitado.

8. Login
   - Features
     - Login existing account (User / Password)
       - Access token de 10 minutos. Con «Recordarme», refresh token de hasta 30 días; sin marcarlo, cookie de sesión con vencimiento del servidor a las 24 horas. Logout revoca el refresh token. Los permisos del plan se verifican en servidor y caducan aunque el usuario siga autenticado.
     - No hay enlace de alta desde Login: el registro empieza al elegir Iluminado o Faltón en `/precios`. «He olvidado la contraseña» lleva a `/recuperar-contrasena`. El campo de contraseña empieza oculto y un control accesible permite mostrarlo u ocultarlo.
     - El encabezado actual es «¿Vienes a por más? Estupendo, tengo servidores para eso y más.»; el copy existente bajo el formulario conserva el rechazo humorístico a otros métodos de acceso y explica la privacidad de las ideas aprobadas/rechazadas.
   - Must have copy text under submit login button in this way:
     "¿Quieres hacer login con Google, GitHub o la app del supermercado?"
     "Pues no se puede"
     "Tus buenas ideas, las aprobadas, son tuyas. Las malas pueden acabar en un ranking sin tu nombre ni el texto original."
     "Ánimo que no cuesta tanto poner un usuario y una contraseña"
   - Secure with rate limit, generic login errors, and OWASP compilant principles

9. Create account
   - Features
     - Crear cuenta solo al seleccionar Iluminado o Faltón; el nivel gratuito anónimo no requiere registro.
     - Solicitar email, alias, contraseña y una casilla desmarcada «He leído la política de privacidad» enlazada a `/politica-de-privacidad`. La casilla obligatoria envía `privacyPolicyAcknowledged`; el servidor registra la versión y hora de la política presentada. Un texto auxiliar permite consultar `/terminos-y-condiciones` por separado y no añade otra aceptación. Marcar la casilla no es un consentimiento genérico para cualquier tratamiento.
     - Validar sintaxis de email y alias. Para conflictos de email y alias existentes, mostrar respuesta deliberadamente genérica e idéntica; no confirmar qué dato existe. Los detalles de validación y límites están en `features.md` y `Dtos.md`.
     - Flujo implementado: elegir plan mediante POST → URL limpia `/crear-cuenta` → crear cuenta pendiente y enviar enlace de verificación → verificar correo → confirmar explícitamente la contratación simulada → activar cuenta/plan y emitir sesión → navegar al perfil. No se procesa dinero ni se piden datos bancarios.
     - No se conceden sesión, plan, compra ni cuota hasta completar verificación y confirmación. El correo se envía por SMTP en entornos configurados; el preview local no equivale a envío. El login usa access JWT y refresh rotatorio; la autenticación de dos factores sigue pendiente.
     - Los reintentos son idempotentes y no duplican cuenta, compra o activaciones. Los permisos y las fechas de vigencia se calculan en servidor y la UI muestra el perfil dinámico.
     - Si no hay intención de alta, está caducada o fue consumida, ofrecer volver a precios y elegir plan.
     - El CTA ofrece el plan por un mes. El panel lateral aclara que no hay renovación automática y que, si se desea otro mes, se vuelve a contratar. Tras el alta se muestra el modal de pago simulado durante cinco segundos y se navega al perfil.

10. Política de privacidad

- Path: `/politica-de-privacidad`
- Política versión 3 en español, con responsable y domicilio, finalidades, bases, proveedores, conservación, derechos, cookies, IA, dictado y seguridad. Informa de la conservación temporal del texto de idea en errores `INVALID_EVALUATION_RESPONSE` y de la publicación agregada de títulos seguros y cantidades en Worst Ideas; su casilla de lectura no sustituye los consentimientos específicos. Las nuevas altas registran `v3`; las cuentas existentes mantienen su aceptación `v2` salvo que se solicite una nueva aceptación. La versión y fecha visibles deben actualizarse cuando el responsable apruebe la aclaración sobre el ranking histórico.
- Los rankings de cuentas requieren adhesión voluntaria y revocable desde el perfil. La preferencia se guarda en servidor y las consultas públicas excluyen por defecto a quien no la haya activado. Esta preferencia no cubre Worst Ideas; antes de activar el ranking agregado en producción, el responsable debe decidir su base jurídica y revisar su identificabilidad.
- La función de avatar envía la imagen procesada a OpenAI para moderación. El avatar solo aparece en rankings cuando la persona ha autorizado su participación.
- El enlace desde el formulario de alta debe ser visible, descriptivo, accesible por teclado y abrir la ruta interna.

11. Términos y condiciones

- Path: `/terminos-y-condiciones`
- Presenta el resumen sobre tratamiento de ideas y dictados que antes aparecía en Home. No sustituye la versión 3 de `/politica-de-privacidad`.

## Delivery boundary

La primera entrega incluye Home con dictado por voz, evaluación y similitud, tres usos anónimos de ideas y tres de roast por perfil de navegador, con purga del perfil tras 400 días sin actividad, alta con verificación de correo y confirmación simulada para Iluminado o Faltón, login con access JWT y perfil dinámico. Iluminado permite 11 evaluaciones y Faltón 11 roasts por día local de `Europe/Madrid`, con reserva transaccional e idempotencia. Las cachés de respuestas se eliminan cada hora tras su TTL de 24 horas. Las reservas incompletas devuelven `409` durante 30 minutos y luego pueden recuperarse; los errores liberan el intento. La recuperación de contraseña también está disponible mediante enlace de un solo uso; la autenticación de dos factores sigue pendiente. El perfil conserva los datos de cuenta, suscripciones, intentos restantes e ideas aprobadas privadas, y permite editar un avatar procesado y moderado por OpenAI. La participación en los rankings de cuentas es voluntaria y revocable desde el perfil. Worst Ideas presenta rankings público histórico y semanal con títulos seguros y cantidades, sin autor ni texto original; la base jurídica del agregado público requiere decisión del responsable. Contacto autenticado persiste mensajes en PostgreSQL, envía confirmación por SMTP y permite a Jappy responder desde el panel; los mensajes se purgan a los 12 meses. La política de privacidad versión 3 está incorporada; validar proveedores y ajustes de producción antes de abrir el servicio. A corto plazo quedan por completar las vistas restantes de rankings, precios y ROI. Los pagos reales llegan a medio plazo.

## Shared interaction rules

- Loading, empty, validation, rate-limit and server-error states must be designed for every interactive section.
- The frontend never decides score, verdict, permissions or remaining usage.
- Los visitantes anónimos no tienen historial personal. El perfil persistente conserva únicamente un identificador opaco y contadores de uso, y se purga tras 400 días sin actividad; cerrar la sesión no reinicia el cupo. Borrar cookies o usar otro navegador puede crear un perfil nuevo. La IP se usa solo para rate limiting temporal, no como identidad permanente.
- En producción no se sirven los datos de muestra usados en desarrollo y maquetación ni se mezclan con rankings reales.
- Nunca se publica información sobre las ideas aprobadas. El ranking de humanos notables publica alias y número de aprobaciones. El ranking de ideas no aprobadas publica solo título breve y número de recepciones, sin autor ni texto original.
- Every route and component must expose keyboard operation, visible focus and accessible status messages.

## Home acceptance criteria

- Empty input cannot call the evaluation API.
- Cuando una plataforma compatible ofrece reconocimiento local, el dictado solicita permiso y su resultado se puede revisar y editar antes de enviar. Android no muestra el control; tampoco aparece si no hay soporte local detectable. Una denegación o error no borra lo que ya se escribió.
- Input is limited to 2,000 characters and sanitized at the API boundary.
- A valid submission consumes exactly one available attempt.
- `searchSimilarIdea` está conectado a firma semántica, embeddings, pgvector y comparación semántica. La búsqueda va antes de evaluación, obtiene hasta 20 candidatas ordenadas por cercanía sin corte coseno fijo y confirma identidad por finalidad y público/objeto; no consulta evaluaciones. Una coincidencia incrementa el contador agregado una sola vez y presenta título seguro y contador total, con acción explícita para evaluar; si continuar termina en rechazo, no se suma otra unidad. Solo esa acción consume intento. Sin coincidencia se evalúa y solo un `reject` nuevo se agrega al corpus con título seguro y embedding. No se persiste el texto original ni la firma efímera.
- El primer resultado muestra score conceptual de 0–10 con dos decimales y una única frase explicativa en ambos tonos. Sin bloqueo evidente se muestra la media de criterios puntuados dividida entre 10; si no hay puntuados o la idea es insuficiente, no hay score (`null`).
- Las evaluaciones fallidas no consumen intento. Los envíos concurrentes y los reintentos de red tampoco pueden exceder ni duplicar el límite.
- Los límites de planes activos se reinician a las 00:00 en `Europe/Madrid`, no a medianoche UTC.
