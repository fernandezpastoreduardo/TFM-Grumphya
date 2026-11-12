**Sections:**
if you need more info about any feature of any section refer to ./agentic-guidelines/features

1. Home

- Path: /
- Layout:
  - A field lets the user write, paste, or dictate an idea.
  - A mode chooser offers `soft` and `hard`; tone changes presentation, not the evaluation.
  - A button submits the idea.
- Features:
  `GetUserIdea` captures and validates the text. On an initial submission,
  `IdeaSubmissionService` checks the idempotency key and then classifies four
  special cases locally, before semantic similarity and the evaluator: a
  contextual lexical Grumphya signal (the name plus explicit equivalence terms
  such as `como`, `clon`, `copia`, `igual`, `similar`, `parecida/o`, `réplica`,
  `recrear`, `copiar`, `imitar`, or `alternativa`; an app mention alone does
  not qualify; or evaluate/review + ideas + an
  explicit negation of developing/building/creating/doing them), the complete short pattern «Un/Una X
  pero con IA», a short standalone insult, and text too brief to evaluate.
  The Grumphya check is lexical, not semantic. The insult detector uses a
  bounded closed list, excludes reported or quoted insults such as «Me llamó
  idiota», and must not absorb proposals or broader criticism; the AI pattern
  must not become a general rejection of AI ideas.
  The brief-text case matches 1–19 normalized characters only when no lexical
  idea signal is present; otherwise the ordinary 10-character minimum applies.
  These responses are fixed `special_case`
  results, not rubric verdicts. Each consumes one quota unit. The same
  idempotency key and payload replay the cached response for 24 hours from the
  original reservation without another charge or extending the TTL; a
  different payload under that key is rejected. Special cases do not
  invoke OpenAI or similarity search and do not add the submitted text to
  history or Worst Ideas. Product explicitly requested the four fixed case
  copy strings; that request is a narrow exception to the general copy-style
  guidance and does not authorize extending those lines to other flows.

  If no special case matches, a normal submission must contain 10–2,000
  characters before similarity search. `searchSimilarIdea` compares only
  against rejected ideas; a match updates its reception count once and offers
  an explicit continuation. Showing the notice alone does not consume an
  evaluation; continuing reserves one. Without a match, the evaluator runs and
  a new rejection may add a safe title to Worst Ideas. The evaluator receives
  the idea, policy version and selected tone; the tone instruction affects the
  generated headline, while the server composes the explanation for that tone.
  Neither can change the decision or score. The same key/payload
  replays the response for 24 hours; errors release a reservation. Anonymous
  idea and roast counters are independent, each with three lifetime uses per
  browser profile and server-side enforcement.

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
     - The message endpoint requires an authenticated access-token session, an exact `WEB_ORIGIN` match and JSON; it accepts no client-supplied user ID, disables caching, and is rate-limited to five submissions per minute per IP in addition to the general API limit. These in-memory limits are per process. Message content, recipient and reply body are not logged. The inbox is available only to Jappy through the protected admin dashboard; regular users cannot read messages. The API sends a generic SMTP receipt after saving and lets Jappy reply to the account email from the dashboard. The reply body is not stored. A delivery with uncertain status requires webmail review before one retry; the app does not read replies through IMAP. `DataRetentionService` physically purges messages after 12 months; account deletion also removes them through the foreign-key cascade. Verify the scheduled purge and backup rotation in production.

6. "Good Practices / Why this matters" section:
   Used to explain the real utility of the tool beyond the general rude tone.
   The goal is to help people avoid non-viable projects given the cost of AI,
   the time and technical knowledge required, and the issues around
   vibe-coding. This is the only part of the app whose copy avoids the
   rude/sarcastic tone. Current content guides people to find the real
   problem, check assumptions and build the smallest useful test. Its note
   warns that vibe-coding without understanding or reviewing generated code
   means losing control of the project, and can leave security flaws, breakage,
   hard-to-maintain software and unexpected limits or costs as usage grows. It
   tells people to understand, review and test changes before publishing, and
   not to put code in users' hands if they cannot do that. There is no editorial
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

   - Iluminado Plan: for €3 a month, it lets you submit eleven (yeah, eleven) ideas a day.

   - Faltón Plan: for 1€ per month lets you use the "Descárgate a gusto" feature eleven times a day (que si, ooonce). Includes a "Heckler of the Day" ranking if you make the AI sweat (leaving it speechless or without a good comeback for your insult).

   - "UltraChachi" es una oferta humorística ficticia de 10 € por uso ilimitado de Grumphya; no permite contratarla. Al pulsarla abre el popup de la criatura iluminada desde abajo con una linterna. El mensaje dice:

   ¿Aún estamos así de verde?
   Esta lección es gratis:
   La IA es cara.
   NADIE te ofrecerá algo potenciado por IA sin cobrarte más a mes, o por cada uso.
   Si lo hacen, será porque venderán tus datos, y aquí no hacemos eso.
   Tus buenas ideas, las aprobadas, son tuyas y solo tuyas.
   - Features:
     - «Crear cuenta» abre `/crear-cuenta/planes`, que reutiliza las tarjetas de `/precios`. Al elegir Iluminado o Faltón sin sesión en cualquiera de esas rutas, enviar el plan por `POST` al servidor para crear una intención temporal y navegar a `/crear-cuenta` sin parámetros de plan en URL. El servidor conserva el plan y valida su vigencia; la integración de pagos reales queda para medio plazo.
     - Una sesión autenticada que elige un plan desde `/precios` navega a `/perfil` para contratar allí el plan inactivo. Una cuenta normal autenticada que abre `/crear-cuenta` se redirige a `/perfil`; la cuenta administradora va a `/panel-control`.
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
     - Solicitar email, alias, contraseña, repetición de contraseña y una casilla desmarcada «He leído la política de privacidad» enlazada a `/politica-de-privacidad`. Los dos campos de contraseña empiezan ocultos y cada uno tiene su propio control accesible para mostrar/ocultar. Comparar ambos valores antes del envío; `passwordConfirmation` es solo una validación de UI y no se envía al servidor. La casilla obligatoria envía `privacyPolicyAcknowledged`; el servidor registra la versión y hora de la política presentada. Un texto auxiliar permite consultar `/terminos-y-condiciones` por separado y no añade otra aceptación. Marcar la casilla no es un consentimiento genérico para cualquier tratamiento.
     - Validar sintaxis de email y alias. Para conflictos de email y alias existentes, mostrar respuesta deliberadamente genérica e idéntica; no confirmar qué dato existe. Los detalles de validación y límites están en `features.md` y `Dtos.md`.
     - Flujo implementado: seleccionar plan en `/crear-cuenta/planes` o `/precios` mediante POST → URL limpia `/crear-cuenta` → crear cuenta pendiente y enviar enlace de verificación → verificar correo → confirmar explícitamente la contratación simulada → activar cuenta/plan y emitir sesión → navegar al perfil. No se procesa dinero ni se piden datos bancarios.
     - Rate limits de servidor por IP/proceso y ventana de un minuto: creación de intención 20/min, alta 8/min; ambas también consumen el bucket general de 120/min. Verificación/confirmación 10/min. El servidor responde `429` con `Retry-After`; estos límites se reinician al reiniciar el proceso y no se comparten entre réplicas.
     - No se conceden sesión, plan, compra ni cuota hasta completar verificación y confirmación. El correo se envía por SMTP en entornos configurados; el preview local no equivale a envío. El login usa access JWT y refresh rotatorio; la autenticación de dos factores sigue pendiente.
     - Tras el alta, una cookie propia permite comprobar en PostgreSQL si el correo sigue pendiente en ese navegador. Ideas, roast y contacto se bloquean en servidor antes del envío hasta abrir el enlace y pulsar «Confirmar correo». En esos intentos la web muestra el diálogo común con el asset del café derramado y los textos acordados. No se identifica a la misma persona en otros navegadores o después de borrar la cookie.
     - Los reintentos son idempotentes y no duplican cuenta, compra o activaciones. Los permisos y las fechas de vigencia se calculan en servidor y la UI muestra el perfil dinámico.
     - Si no hay intención de alta, está caducada o fue consumida, ofrecer volver a precios y elegir plan.
     - El CTA ofrece el plan por un mes. El panel lateral aclara que no hay renovación automática y que, si se desea otro mes, se vuelve a contratar. Tras el alta se muestra el modal de pago simulado durante cinco segundos y se navega al perfil.

10. Política de privacidad

- Path: `/politica-de-privacidad`
- Política versión 5 en español, con responsable y domicilio, finalidades, bases, proveedores, conservación, derechos, cookies, IA, dictado y seguridad. Describe el ranking educativo de títulos generados para ser seguros y recuentos en Worst Ideas, así como la medición agregada propia de páginas públicas; indica que los errores de evaluación conservan categoría y código de diagnóstico, no el texto enviado. La casilla de lectura no sustituye los consentimientos específicos. Las nuevas altas registran `v5`; las cuentas existentes conservan su versión de aceptación anterior salvo que se solicite una nueva aceptación.
- Los rankings de cuentas requieren adhesión voluntaria y revocable desde el perfil. La preferencia se guarda en servidor y las consultas públicas excluyen por defecto a quien no la haya activado. Esta preferencia no cubre Worst Ideas; el interés legítimo elegido para su finalidad educativa y el riesgo de identificación contextual están documentados en `doc/privacy-policy-assessment.md`.
- La función de avatar envía la imagen procesada a OpenAI para moderación. El avatar solo aparece en rankings cuando la persona ha autorizado su participación.
- El enlace desde el formulario de alta debe ser visible, descriptivo, accesible por teclado y abrir la ruta interna.

11. Términos y condiciones

- Path: `/terminos-y-condiciones`
- Presenta el resumen sobre tratamiento de ideas y dictados que antes aparecía en Home. No sustituye la versión 5 de `/politica-de-privacidad`.

## Delivery boundary

El MVP inicial incluye Home con dictado por voz, evaluación y similitud, tres usos anónimos de ideas y tres de roast por perfil de navegador, con purga del perfil tras 400 días sin actividad, alta con verificación de correo y confirmación simulada para Iluminado o Faltón, login con access JWT y perfil dinámico. Iluminado permite 11 evaluaciones y Faltón 11 roasts por día local de `Europe/Madrid`, con reserva transaccional e idempotencia. Las cachés de respuestas se eliminan cada hora tras su TTL de 24 horas. Las reservas incompletas devuelven `409` durante 30 minutos y luego pueden recuperarse; los errores liberan el intento. La recuperación de contraseña también está disponible mediante enlace de un solo uso; la autenticación de dos factores sigue pendiente. El perfil conserva los datos de cuenta, suscripciones, intentos restantes e ideas aprobadas privadas, y permite editar un avatar procesado y moderado por OpenAI. La participación en los rankings de cuentas es voluntaria y revocable desde el perfil; Jappy, como cualquier otra cuenta, debe activar el consentimiento desde `/perfil` para aparecer y puede retirarlo allí. Worst Ideas presenta rankings público histórico y semanal con títulos seguros y cantidades, sin autor ni texto original; su base jurídica es el interés legítimo con finalidad educativa, según la decisión del responsable. Contacto autenticado persiste mensajes en PostgreSQL, envía confirmación por SMTP y permite a Jappy responder desde el panel; los mensajes se purgan a los 12 meses. El panel admin incluye analítica propia con sumas agregadas y supresión de grupos pequeños, sin visitantes únicos ni conversión individual. La política de privacidad versión 5 está incorporada; validar proveedores y ajustes de producción antes de abrir el servicio. Las funciones de rankings, precios, ROI y contacto descritas como ampliaciones de corto plazo ya están disponibles. Los pagos reales y la autenticación de dos factores siguen pendientes.

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
- El primer resultado muestra score visible de 0–10 con dos decimales y una única frase explicativa en ambos tonos. Sin bloqueo evidente se muestra la media de criterios puntuados multiplicada por `10/79` y redondeada a dos decimales; si no hay puntuados o la idea es insuficiente, no hay score (`null`).
- Las evaluaciones fallidas no consumen intento. Los envíos concurrentes y los reintentos de red tampoco pueden exceder ni duplicar el límite.
- Los límites de planes activos se reinician a las 00:00 en `Europe/Madrid`, no a medianoche UTC.
