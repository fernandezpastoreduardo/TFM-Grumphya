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
  Error path: User does not submit any content put presses the submit button. Warn user with a popup in same style as the rest of the app. - Case use: User submits an idea which is not any of the other prior cases but is not an app or business idea or system is unable to identify what submit means. Show popup with copy: Anda, aclárate primero y luego me cuentas. Si yo no puedo entenderte nadie lo hará. - Happy path: `evaluateIdea` valida la idea, ejecuta primero la feature RAG separada de detección de duplicados (sin datos de evaluación) y, cuando corresponda, ejecuta `evaluationProcess` según `scoring-viability-software.md`. Las cuotas pertenecen a una capa posterior. - Tras obtener un resultado válido se confirma un solo uso. Si falla la transcripción, búsqueda o evaluación, no se consume. Las peticiones repetidas usan idempotencia. - La evaluación base se muestra en tono suave o duro sin cambiar score ni veredicto. Un usuario registrado conserva el envío en su historial; un visitante anónimo no tiene historial personal.

2. Worst Ideas

- Path: /lo-peor-de-lo-peor
- Layout: Two tables which contains two rankings
  - Worst week´s ideas
  - Worst current logged user's ideas
    - Copy: Tú también haces tus pinitos. Estos son los peores que has plantado... hasta ahora.
- Features:
  - getIdeaListWorstAll: gets response and gives it to TableWorstAll Component
  - getIdeaListWorstUser: gets response and gives it to TableWorstUser Component
    - Si no hay usuario autenticado, la tabla personal muestra un estado vacío con invitación a crear cuenta: los visitantes anónimos no tienen historial, tampoco en `localStorage`.
- El ranking público semanal muestra solo el título breve y la cantidad de recepciones durante la semana ISO actual de ideas rechazadas; nunca el usuario, texto original ni identificadores de autor.

3. "Vent / Roast to your heart's content" section

- Path: /descargate
- Layout: nine cards that shows user insult and grumphy reply
  Permite 3 envíos básicos por sesión anónima y 11 al día a las cuentas con plan Faltón vigente. La experiencia ampliada de tarjetas y ranking llegará a corto plazo.

4. Notable Humans section: a ranking/list of humans whose ideas have actually passed the AI's approval evaluation (without showing the ideas themselves). The goal is to spark a bit of rivalry and gamify the experience.
   - Path: /humanos-notables
   - Features:
     - 10 usuarios con más ideas aprobadas; mostrar solo alias y número de aprobaciones. Nunca título, texto, resumen ni evaluación de sus ideas aprobadas.
     - UI highlights in one in the ranking is from current user
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
     - Al elegir Iluminado o Faltón sin sesión, ir al alta con el plan seleccionado. En la primera entrega la contratación y su confirmación se simulan sin dinero real; el backend activa el plan, su vigencia y sus permisos. La integración de pagos reales queda para medio plazo.
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
     - Solicitar usuario y contraseña; fecha, identificador y estado del plan los determina el servidor, no campos ocultos enviados por el navegador.
     - Flujo: elegir plan → crear cuenta → confirmar contratación simulada (visible como simulación, sin datos bancarios) → activar plan en servidor → emitir sesión → aplicar permisos y límites del plan.
     - Una contratación simulada fallida no activa el plan. El usuario puede repetir la confirmación sin duplicar cuentas, activaciones o usos.

## Delivery boundary

La primera entrega incluye Home con dictado por voz, evaluación y similitud, tres usos anónimos de ideas y tres de roast por sesión, alta/login asociados a Iluminado o Faltón, contratación simulada, permisos y límites reales en servidor, e historial solo para cuentas registradas. A corto plazo se completan las vistas de Worst Ideas, Roast, rankings, precios, ROI y contacto. Los pagos reales llegan a medio plazo.

## Shared interaction rules

- Loading, empty, validation, rate-limit and server-error states must be designed for every interactive section.
- The frontend never decides score, verdict, permissions or remaining usage.
- Los visitantes anónimos no tienen historial personal. La sesión anónima conserva solo identificador temporal y contadores de uso necesarios; cerrar o reiniciar la sesión puede dar lugar a una nueva prueba gratuita.
- En producción no se sirven los datos de muestra usados en desarrollo y maquetación ni se mezclan con rankings reales.
- Nunca se publica información sobre las ideas aprobadas. El ranking de humanos notables publica alias y número de aprobaciones. El ranking de ideas no aprobadas publica solo título breve y número de recepciones, sin autor ni texto original.
- Every route and component must expose keyboard operation, visible focus and accessible status messages.

## Home acceptance criteria

- Empty input cannot call the evaluation API.
- El dictado solicita permiso; su resultado se puede revisar y editar antes de enviar. Una denegación o error no borra lo que ya se escribió.
- Input is limited to 2,000 characters and sanitized at the API boundary.
- A valid submission consumes exactly one available attempt.
- La detección de duplicados es una feature RAG separada, previa a la evaluación, y no consulta datos de evaluaciones. Qué ocurre en el flujo cuando detecta una coincidencia queda por especificar.
- El primer resultado muestra score conceptual de 0–10 con dos decimales y una única frase explicativa en ambos tonos. Sin bloqueo evidente se muestra la media de criterios puntuados dividida entre 10; si no hay puntuados o la idea es insuficiente, no hay score (`null`).
- Las evaluaciones fallidas no consumen intento. Los envíos concurrentes y los reintentos de red tampoco pueden exceder ni duplicar el límite.
- Los límites de planes activos se reinician a las 00:00 en `Europe/Madrid`, no a medianoche UTC.
