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
  Error path: User does not submit any content put presses the submit button. Warn user with a popup in same style as the rest of the app. - Case use: User submits an idea which is not any of the other prior cases but is not an app or business idea or system is unable to identify what submit means. Show popup with copy: Anda, aclárate primero y luego me cuentas. Si yo no puedo entenderte nadie lo hará. - Flujo implementado: `IdeaSubmissionService` valida la idea y ejecuta `searchSimilarIdea` contra el corpus de rechazadas antes de `evaluationProcess`. OpenAI crea una firma semántica efímera; pgvector obtiene hasta 20 candidatas más cercanas, sin corte coseno fijo; el comparador confirma misma finalidad y público/objeto. Con match, `updateWorstIdea` cuenta la recepción una sola vez y la UI muestra título seguro y contador; si la evaluación posterior también rechaza, no vuelve a sumar. La UI ofrece continuar. Una cuenta autenticada con Iluminado vigente consume hasta 11 evaluaciones por día local de Madrid; la reserva se libera al mostrar solo el aviso y se confirma al terminar con una respuesta válida. Los errores liberan la reserva. La misma clave/payload devuelve la respuesta cacheada durante 24 horas desde la reserva original (TTL lógico); los reintentos no amplían ese plazo. La caché no se purga físicamente por reloj. Una reserva en curso devuelve `409` hasta que pasen 30 minutos. Sin match, se evalúa y un rechazo nuevo llama `addToWorstIdeas` con título seguro y embedding, sin guardar texto fuente. No se leen evaluaciones previas. Los perfiles anónimos conservan su cuota vitalicia independiente.

2. Worst Ideas

- Path: /lo-peor-de-lo-peor
- Layout: Two tables which contains two rankings
  - Worst week´s ideas
  - Worst current logged user's ideas
    - Copy: Tú también haces tus pinitos. Estos son los peores que has plantado... hasta ahora.
- Features:
  - getIdeaListWorstAll: el componente implementado `WorstIdeasAll` consume la respuesta.
  - getIdeaListWorstUser: el componente implementado `WorstIdeasUser` consulta `GET /api/account/worst-ideas`; requiere sesión autenticada y muestra solo las ideas rechazadas del propietario, ordenadas por cantidad descendente.
    - Si no hay sesión válida, el historial muestra una invitación a crear cuenta. Si la cuenta no tiene rechazos, muestra un estado vacío; no hay historial anónimo ni uso de `localStorage`.
- `WorstIdeasAll` carga el ranking público desde `GET /api/worst-ideas`, valida el contrato en ejecución y presenta los estados de carga, error recuperable, lista vacía y resultados. El ranking semanal muestra solo título seguro y cantidad de recepciones; nunca usuario, texto original ni identificadores de autor. El contrato API y su orden están especificados en `Dtos.md`.

3. "Vent / Roast to your heart's content" section

- Path: /descargate
- Layout: nine cards that shows user insult and grumphy reply
  Permite 3 envíos gratuitos de por vida por perfil de navegador a visitantes y a cuentas autenticadas sin Faltón vigente. Faltón vigente concede 11 envíos diarios, sin consumir el cupo gratuito de roast. El backend reserva la cuota adecuada transaccionalmente y la confirma solo al entregar una respuesta válida; ante un error libera la reserva. La API genera la respuesta con OpenAI y valida su forma y contenido antes de devolverla. Las peticiones autenticadas son idempotentes por clave/payload durante 24 horas lógicas desde la reserva original; el borrado físico es oportunista. Una reserva en curso devuelve `409` durante 30 minutos.
- `getRoastRanking` presenta hasta diez usuarios con roast contabilizado: el primer puesto aparece como ganador y los puestos 2–10 en tabla con alias, avatar opcional y número de mensajes. El endpoint público no expone identificadores, correos ni mensajes enviados.

4. Notable Humans section: a ranking/list of humans whose ideas have actually passed the AI's approval evaluation (without showing the ideas themselves). The goal is to spark a bit of rivalry and gamify the experience.
   - Path: /humanos-notables
   - Features:
     - `getBestListBestUsers` entrega hasta diez cuentas activas ordenadas por cantidad de aprobaciones; mostrar alias, avatar opcional y número de aprobaciones. Nunca título, texto, resumen ni evaluación de sus ideas aprobadas.
     - El componente `BestUsers` sigue el formato del prototipo y resalta el primer puesto.
     - UI must be a part of copy to encourage user to have the next great idea to be in that ranking.

5. Contact section:
   - Features:
     - A joke. It has typical contact page UI but when you try to fill out any field, a popup message appears and the form fades out. Popup copy mus follow the rest of app copy style "Acéptalo: ahora mismo a nadie le importa lo que tengas que decir."
     - En esta sección, las cuentas con un plan activo (Iluminado o Faltón) pueden usar el formulario; los detalles del servicio se definirán en la entrega a corto plazo.

6. "Good Practices / Why this matters" section:
   Used to explain the real utility of the tool beyond the general rude tone. The goal is to genuinely help people avoid embarking on non-viable projects due to how expensive AI is, the time and technical knowledge required, the issues around vibe-coding, and similar points. This is the only part of the app without the rude/sarcastic tone, present in the rest of the app's copy and sections. The visual style should soften here too: for example, character designs, they'll switch to having adorable huge eyes and no furrowed brows in this section. See ideas-and-designs/ayudar.png for character reference.

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
     - Create new account link
   - Must have copy text under submit login button in this way:
     "¿Quieres hacer login con Google, GitHub o la app del supermercado?"
     "Pues no se puede"
     "Tus buenas ideas, las aprobadas, son tuyas. Las malas pueden acabar en un ranking sin tu nombre ni el texto original."
     "Ánimo que no cuesta tanto poner un usuario y una contraseña"
   - Secure with rate limit, generic login errors, and OWASP compilant principles

9. Create account
   - Features
     - Crear cuenta solo al seleccionar Iluminado o Faltón; el nivel gratuito anónimo no requiere registro.
     - Solicitar email, alias, contraseña y una casilla desmarcada «He leído la política de privacidad» con enlace a `/politica-de-privacidad`. El servidor registra la versión y hora de la política presentada; marcarla no es un consentimiento genérico para cualquier tratamiento.
     - Validar sintaxis de email y alias. Para conflictos de email y alias existentes, mostrar respuesta deliberadamente genérica e idéntica; no confirmar qué dato existe. Los detalles de validación y límites están en `features.md` y `Dtos.md`.
     - Flujo implementado: elegir plan mediante POST → URL limpia `/crear-cuenta` → alta directa y activación simulada en una transacción → emitir sesión → mostrar popup de pago simulado cinco segundos → navegar al perfil. No se procesa dinero ni se piden datos bancarios.
     - La cuenta y el plan quedan activos al completar el alta; el correo permanece sin verificar hasta implementar la verificación de nuevas altas. Esta deuda está en `wanna-bes.md`. El login y la sesión con access JWT ya están implementados; la autenticación de dos factores sigue pendiente.
     - Los reintentos son idempotentes y no duplican cuenta, compra o activaciones. Los permisos y las fechas de vigencia se calculan en servidor y la UI muestra el perfil dinámico.
     - Si no hay intención de alta, está caducada o fue consumida, ofrecer volver a precios y elegir plan.

10. Política de privacidad

- Path: `/politica-de-privacidad`
- Vista provisional con título y estilos del sitio, claramente identificada como contenido pendiente de completar. No debe presentarse como una política legal completa ni habilitar altas públicas hasta que se publique la información requerida.
- La función de avatar envía la imagen procesada a OpenAI para moderación y publica la imagen aprobada en el perfil, el nav y rankings. La política debe identificar finalidad, proveedor, conservación, base jurídica y derechos antes de habilitar el servicio a usuarios reales.
- El enlace desde el formulario de alta debe ser visible, descriptivo, accesible por teclado y abrir la ruta interna.

## Delivery boundary

La primera entrega incluye Home con dictado por voz, evaluación y similitud, tres usos anónimos de ideas y tres de roast de por vida por perfil de navegador, alta asociada a Iluminado o Faltón, contratación simulada, login con access JWT y perfil dinámico. Iluminado permite 11 evaluaciones y Faltón 11 roasts por día local de `Europe/Madrid`, con reserva transaccional, idempotencia por clave/payload y respuesta cacheada durante 24 horas desde la reserva original. Ese TTL es lógico: las filas caducadas se borran oportunistamente con reservas posteriores, sin garantía de borrado físico al cumplirse 24 horas. Las reservas incompletas devuelven `409` durante 30 minutos y luego pueden recuperarse; los errores liberan el intento. La verificación de correo en nuevas altas y el segundo factor de login siguen pendientes. El perfil conserva los datos de cuenta, suscripciones, intentos restantes e ideas aprobadas privadas, y permite gestionar un avatar público WebP de 128 × 128 procesado y moderado en servidor con la clave OpenAI existente. Los archivos se conservan en un volumen Docker separado. La moderación automática puede fallar y no equivale a una garantía de seguridad; la política de privacidad sigue siendo provisional y debe completarse antes de abrir el servicio. Las listas de Worst Ideas están implementadas con un máximo de diez filas, y «Descárgate a gusto» muestra el ranking Roast «Faltón máximo» con hasta diez cuentas. A corto plazo quedan por completar las vistas restantes de rankings, precios, ROI y contacto. Los pagos reales llegan a medio plazo.

## Shared interaction rules

- Loading, empty, validation, rate-limit and server-error states must be designed for every interactive section.
- The frontend never decides score, verdict, permissions or remaining usage.
- Los visitantes anónimos no tienen historial personal. El perfil persistente conserva únicamente un identificador opaco y contadores de uso; cerrar la sesión no reinicia el cupo. Borrar cookies o usar otro navegador puede crear un perfil nuevo. La IP se usa solo para rate limiting temporal, no como identidad permanente.
- En producción no se sirven los datos de muestra usados en desarrollo y maquetación ni se mezclan con rankings reales.
- Nunca se publica información sobre las ideas aprobadas. El ranking de humanos notables publica alias y número de aprobaciones. El ranking de ideas no aprobadas publica solo título breve y número de recepciones, sin autor ni texto original.
- Every route and component must expose keyboard operation, visible focus and accessible status messages.

## Home acceptance criteria

- Empty input cannot call the evaluation API.
- El dictado solicita permiso; su resultado se puede revisar y editar antes de enviar. Una denegación o error no borra lo que ya se escribió.
- Input is limited to 2,000 characters and sanitized at the API boundary.
- A valid submission consumes exactly one available attempt.
- `searchSimilarIdea` está conectado a firma semántica, embeddings, pgvector y comparación semántica. La búsqueda va antes de evaluación, obtiene hasta 20 candidatas ordenadas por cercanía sin corte coseno fijo y confirma identidad por finalidad y público/objeto; no consulta evaluaciones. Una coincidencia incrementa el contador agregado una sola vez y presenta título seguro y contador total, con acción explícita para evaluar; si continuar termina en rechazo, no se suma otra unidad. Solo esa acción consume intento. Sin coincidencia se evalúa y solo un `reject` nuevo se agrega al corpus con título seguro y embedding. No se persiste el texto original ni la firma efímera.
- El primer resultado muestra score conceptual de 0–10 con dos decimales y una única frase explicativa en ambos tonos. Sin bloqueo evidente se muestra la media de criterios puntuados dividida entre 10; si no hay puntuados o la idea es insuficiente, no hay score (`null`).
- Las evaluaciones fallidas no consumen intento. Los envíos concurrentes y los reintentos de red tampoco pueden exceder ni duplicar el límite.
- Los límites de planes activos se reinician a las 00:00 en `Europe/Madrid`, no a medianoche UTC.
