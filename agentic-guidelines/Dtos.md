## DTOs definitions

Los DTOs son contratos de API. No deben exponer entidades de base de datos directamente.

### EvaluateIdeaRequest

- `ideaText: string`, no vacío y hasta 2.000 unidades UTF-16 después de `trim`. En envíos iniciales, los cuatro casos especiales se reconocen antes del mínimo general de 10; el resto debe tener entre 10 y 2.000.
- `tone: 'soft' | 'hard'`.
- La orquestación requiere `Idempotency-Key` aleatoria por envío lógico, conservada en la detección y continuación durante 24 horas. La tabla no almacena texto fuente: vincula la clave al payload normalizado `ideaText` + `tone` mediante `request_hash`, una huella HMAC-SHA-256 cuya clave es la propia `Idempotency-Key`. Reutilizarla con otro payload se rechaza; `continueAnyway` debe conservar el payload inicial.

### EvaluationProcessResponse

- `status: 'RECHAZADA' | 'SIN_BLOQUEO_EVIDENTE' | 'IDEA_INSUFICIENTE'`.
- `score: number | null`; escala global 0–10. `RECHAZADA`: nota del aspecto de veto dividida entre 10. `SIN_BLOQUEO_EVIDENTE`: media aritmética de los criterios `PUNTUADO`, dividida entre 10 y redondeada a dos decimales; `null` si ninguno se puntuó. `IDEA_INSUFICIENTE`: `null`.
- `message: string`; una frase visible. La UI presenta el score con dos decimales en `es-ES`.
- El `message` público no incluye IDs de criterio (`C01`–`C10`) ni `reason_code`. El backend sustituye aliases internos que aparezcan accidentalmente por una descripción legible en español.
- `failedCriteria?: string[]`; solo en `RECHAZADA`, incluye una frase breve y alegórica por cada criterio con nota inferior a 15. Son textos públicos predefinidos por el servidor: no contienen IDs ni nombres internos de la rúbrica. La UI los presenta al final con un aspa roja; en pantallas estrechas va uno por línea y en escritorio puede usar dos columnas.
- Si C10 es el primer veto (`stop_at: 'C10'`), `existingProductExample` puede incluir el nombre de un producto conocido con las mismas funciones esenciales; es opcional, no se busca en la web y no modifica el score ni el veredicto.

El endpoint no devuelve los criterios internos ni sus puntuaciones, fragmentos de la idea, puntuación 0–100, ID de evaluación ni datos de persistencia. La orquestación de similitud/persistencia vive en `POST /api/evaluation-process`; no existe historial personal de evaluaciones en el contrato actual.

### EvaluateIdeaResponse

- `status: 'special_case'` devuelve un `caseId` estable (`grumphya_equivalent`, `generic_ai_clone`, `insult` o `too_brief`), un título y mensaje fijos y, solo para `insult`, una acción opcional. No incluye veredicto ni datos de rúbrica. El servidor clasifica estos casos localmente tras comprobar la idempotencia y antes de similitud; Grumphya requiere el nombre junto a vocabulario explícito de equivalencia (como, clon, copia, igual, similar, parecida/o, réplica, recrear, copiar, imitar o alternativa), no basta con nombrar una app, o términos de evaluar/analizar/revisar + ideas + negación explícita de desarrollar/construir/crear/hacerlas. El insulto independiente excluye reportes/citas como «Me llamó idiota». El caso breve requiere 1–19 caracteres y ausencia de señales léxicas de idea. Cada caso consume un intento. Repetir la misma clave y payload recupera la respuesta cacheada hasta 24 horas desde la reserva original; el replay no extiende el TTL ni consume otra unidad.
- `status: 'similar_idea_match'` devuelve `headline` generado para el tono elegido, `safeTitle` verificado y `submissionCount` total después del incremento. El titular queda guardado con la clave de idempotencia para que el mismo envío reciba la misma respuesta. No devuelve el identificador interno de la idea, embedding, texto original ni autor. Los usos restantes se consultan por el endpoint de `manageUserUnknow`; detectar la coincidencia no consume una evaluación y continuar reserva un uso anónimo.
- `status: 'evaluated'` devuelve `headline` generado para el tono elegido y el resultado público de evaluación y, solo para `RECHAZADA` con título validado, `safeTitle`. Puede incluir `existingProductExample` únicamente cuando C10 sea el primer veto (`stop_at: 'C10'`) y el modelo reconozca con alta confianza un producto con las mismas funciones esenciales. Los valores inseguros, no aplicables o los marcadores literales `"null"` y `"undefined"` se omiten sin invalidar la puntuación. El titular y el ejemplo no alteran score ni veredicto.
- Reenviar la misma `Idempotency-Key` y el mismo payload para continuar conserva la recepción ya contada aunque la evaluación posterior también dé `RECHAZADA`; cambiar `ideaText` o `tone` con esa clave se rechaza. Si falla la evaluación de una continuación antes de guardar su resultado, el servidor libera la reserva de uso y el claim de continuación. Tras liberarlos, se puede reintentar con la misma clave: se reutiliza la coincidencia ya registrada, sin repetir la búsqueda semántica ni incrementar otra vez el contador.

Las cuotas se reservan en el servidor. Una suscripción Iluminado vigente permite 11 evaluaciones diarias; Faltón vigente permite 11 roasts diarios. La API comprueba sesión y suscripción activa en servidor y deriva el día de uso de `Europe/Madrid`; la fila diaria se bloquea transaccionalmente y se cuentan los usos confirmados más las reservas en curso. Si la cuenta no tiene activo el plan correspondiente, se aplica el cupo gratuito de ese ámbito asociado al perfil del navegador; tener activo el otro plan no lo consume ni lo elimina. Una coincidencia de idea que solo muestra el aviso libera la reserva; «Evaluar igualmente» reserva antes de evaluar. Solo una respuesta completa y válida confirma el uso; los fallos de búsqueda, evaluación, generación o validación liberan la reserva. La respuesta de roast se genera con OpenAI y se valida antes de confirmar el uso. Al agotarse la cuota diaria o gratuita, la API responde `429` con el código de límite, `scope` y `remaining: 0`.

La cuenta administradora Jappy puede evaluar ideas y enviar roasts sin límite y sin consumir cuotas diarias. Sus evaluaciones aprobadas y sus roasts confirmados se contabilizan en «Humanos notables» y «Faltón máximo», respectivamente, solo mientras tenga activo el consentimiento público. Jappy no recibe consentimiento automáticamente al aprovisionarse; debe activarlo desde `/perfil` para aparecer en los rankings y puede retirarlo allí. Los rankings muestran únicamente el alias, los totales y el avatar elegido.

Las solicitudes autenticadas requieren `Idempotency-Key` UUID. Se guarda el hash de la clave y una huella HMAC del payload. La misma clave y payload devuelve la respuesta cacheada sin volver a consumir; usar la clave con otro payload da `409`. El TTL lógico de la respuesta es de 24 horas desde la reserva original; los reintentos no amplían ese plazo. El `response_json` guarda el cuerpo íntegro devuelto por la API y puede contener salida generada derivada de la solicitud, aunque no guarda la idea o el roast fuente como campos independientes. Una reserva incompleta da `409` `REQUEST_IN_PROGRESS` durante 30 minutos y después puede recuperarse mediante un reintento. `DataRetentionService` elimina las filas caducadas por lotes al arrancar la API y cada hora; el borrado físico puede ocurrir hasta una hora después del TTL. Este mecanismo no es historial.

### Registration, session and account DTOs

- `CreateRegistrationIntentRequest`: `plan: 'ILUMINADO' | 'FALTON'`. `POST /api/registration-intents` validates the allowlisted plan and stores it server-side in a one-use intent with a 15-minute expiry. The response sets an opaque `HttpOnly` cookie (`Secure` in production, `SameSite=Strict`, `Path=/api`) and returns only `expiresAt`; `GET /api/registration-intents/current` resolves the plan from that cookie. The form URL contains no plan or token.
- `RegistrationRequest`: `email`, `username`, `password`, and `privacyPolicyAcknowledged: true`. The plan is obtained from the server-side intent. The server stamps the privacy policy version and acknowledgement time. Email and username are normalized and checked for uniqueness; conflict responses are generic and identical. Exact validation rules are in `features.md`.
- `POST /api/registrations` returns `{ status: 'verification_pending' }`. It consumes the plan intent and creates a pending account with only the hash of a random, single-use verification token; it does not create a session, active subscription, simulated purchase, or usage quota. The verification link expires after 24 hours and places the token in the URL fragment. `POST /api/registrations/verify` accepts `{ token }`, marks the email verified, returns `{ status: 'email_verified', plan }`, and sets a short-lived HttpOnly confirmation cookie. The UI then asks for explicit confirmation of the simulated purchase; `POST /api/registrations/confirm` activates the account and plan, creates the purchase, usage rows and session in one transaction, and returns the active session shape with an HttpOnly refresh cookie. There is no real charge or bank data. `POST /api/registrations/resend-verification` returns the same pending status regardless of whether an eligible account exists; development may expose an in-memory preview at `GET /api/dev/mail-preview/latest`, which is unavailable in production.
- `LoginRequest`: account alias or email, password, and optional `rememberMe`. `POST /api/auth/login` returns the same access-session shape and sets the refresh cookie. Login accepts an alias or email. `POST /api/auth/refresh` rotates a present refresh cookie and returns a new access token; if the request has no refresh cookie, it returns `204 No Content` without a body and without issuing or clearing a cookie. `POST /api/auth/logout` revokes the refresh session and clears that cookie.
- The access JWT is sent in `Authorization: Bearer <accessToken>` for protected APIs. The refresh cookie exists only to obtain/rotate access tokens; it is not itself the authorization credential for profile, evaluation, plan purchase or account deletion routes. Access tokens expire after ten minutes. «Recordarme» caps refresh-session lifetime at 30 days; without it, the cookie is a session cookie and the server expires the session within 24 hours. Migration `016_auth_refresh_rotation_history.sql` adds `previous_refresh_token_hash`: refresh rotation retains only the hash from the immediately preceding token, and logout can revoke the session with either the current or immediately preceding refresh token. The previous hash is overwritten at the next rotation; plaintext tokens are never persisted.
- `AccountProfile`: `{ user: { email, username, emailVerified, createdAt, roastMessagesSent, avatarUrl: string | null }, plans: [{ plan, status, startsAt, expiresAt, attemptsRemaining: { ideas, roasts } }] }`. `roastMessagesSent` is the account's accumulated count for the Faltón ranking and contains no message text. `avatarUrl` is either null or a validated relative path `/api/avatars/<uuid>.webp`; never expose the avatar storage path or user ID. `GET /api/account/profile` requires a valid access JWT and derives the owner only from the validated session. Plan states, count, and attempts are read from server persistence; inactive plans report zero attempts.
- `POST /api/account/avatar`: requires a valid access JWT and exact `Origin` match; receives one multipart file in field `avatar`, accepts JPEG, PNG, or WebP up to 5 MiB. The profile editor crops in the browser to a 128×128 JPEG using a circular preview, zoom 1–3×, drag, and horizontal/vertical positioning; the submitted file still uses this same DTO. The server revalidates the decoded format against the MIME, limits input to 20 megapixels, normalizes orientation, converts to metadata-free WebP 128×128, and sends that final WebP to OpenAI `omni-moderation-latest` with the existing server-side `OPENAI_API_KEY`. A flagged image is rejected; missing key, timeout, or invalid/provider response fails closed and stores nothing. On success the response is `{ avatarUrl }`. The original file and temporary browser crop are not retained. The browser does not receive the OpenAI key. Invalid multipart input returns a sanitized 400, oversize returns `413 AVATAR_TOO_LARGE`, and moderation/storage/account-update failures return a generic 503 without internal details.
- La carga acepta una sola parte multipart (campo `avatar`) y se limita a tres cargas por minuto usando `request.ip`; la mutación exige `Origin` exacto de `WEB_ORIGIN` y Bearer válido. El límite de tasa vive en memoria por proceso y no se coordina entre réplicas. `main.ts` desconfía de proxies por defecto y solo habilita `TRUST_PROXY` cuando el entorno lo configura. En producción Compose la API confía exclusivamente en la IP fija de Caddy (`172.31.0.254/32` en `backend`); la API no publica puertos y Caddy determina la dirección remota desde su conexión. No confíes en `X-Forwarded-For` arbitrario. Si cambia la subred o IP del proxy, actualiza la allowlist; en producción multiinstancia se necesita rate limiting compartido o en gateway.
- `GET /api/avatars/:avatarKey`: public image route, accepts only a UUID `.webp` key and returns the moderated avatar with `Content-Type: image/webp`, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`. The route is intentionally public because avatars appear in public rankings. Avatar URLs are optional in public ranking items; an avatar is identifying information and must be disclosed to users before upload.
- `UserGoodIdeasResponse`: `{ ideas: [{ id, title, createdAt }] }`. `GET /api/account/good-ideas` requires a valid access JWT, returns at most ten of the current user's approved titles ordered by creation time and ID descending, and exposes no other owner's rows. No `userId` is accepted from the client.
- `PurchasePlanRequest`: `{ plan: 'ILUMINADO' | 'FALTON' }` with a UUID `Idempotency-Key` header. `POST /api/account/subscriptions/purchase` requires a valid access JWT, creates a simulated one-month subscription for an inactive plan and returns the updated `AccountProfile`; an already active plan returns `409 PLAN_ALREADY_ACTIVE`. Purchases do not renew automatically, and there is no early cancellation route.
- `DeleteAccountRequest`: no user identifier is accepted; `DELETE /api/account` uses the authenticated user from the access token and physically deletes the account and cascading private ideas.
- El borrado físico debe retirar también el archivo del avatar de `USER_AVATAR_DIRECTORY` y dejar inaccesible la URL pública asociada. El directorio se conserva en el volumen `grumphya-avatar-data` de Docker; nunca borrar el volumen completo para eliminar una cuenta individual.
- Never accept `isPaid`, subscription status, expiry, role, remaining usage, or an authoritative plan from the registration client. Never expose password hashes, refresh tokens, session hashes or internal persistence hashes in public DTOs.

### Authenticated approved-idea persistence

- For a valid access JWT, an evaluation ending in `SIN_BLOQUEO_EVIDENTE` stores one private title in `approved_ideas`. Anonymous requests create no personal history. The title is normalized from the submitted idea and capped at 160 characters; it is not returned in the evaluation response or included in public rankings.
- `submission_hash` is SHA-256 of `Idempotency-Key`; `request_hash` is HMAC-SHA-256 of the request payload. A repeated key with the same payload is idempotent. Reusing it with a different payload yields a generic conflict while preserving the original stored title.

### UsageResponse

- `scope: 'ideas' | 'roasts'`, `remaining: number`, `limit: number`, `resetsAt?: string` (ISO 8601).
- Para cuentas, `resetsAt` representa la próxima medianoche en `Europe/Madrid`; el cómputo sigue el calendario local también en los cambios estacionales de hora. El tope es 11 al día para el ámbito del plan activo. Para visitantes y cuentas sin plan activo en ese ámbito, el límite gratuito es 3 por perfil de navegador y `resetsAt` se omite. Tener activo el otro plan no consume ni elimina este cupo.

### submitRoast

- `POST /api/roast` recibe `{ message: string }` y requiere `Idempotency-Key` UUID. Se permite una longitud de 1 a 400 caracteres después de recortar espacios exteriores; se rechazan propiedades adicionales y caracteres de control.
- La sesión es opcional. Con Faltón vigente se reserva la cuota diaria de la cuenta; si no, se reserva la cuota gratuita independiente del perfil de navegador, incluso si hay sesión activa. Las llamadas autenticadas y anónimas usan respuesta idempotente temporal para evitar doble consumo.
- Una respuesta válida es `{ reply: string }`. La API la genera con OpenAI y valida su estructura, longitud y ausencia de insultos explícitos antes de confirmar el uso. Si el proveedor no está disponible o la respuesta no cumple el contrato, responde con error y libera la reserva.
- Errores relevantes: `400 INVALID_ROAST_SUBMISSION`, `409 REQUEST_IN_PROGRESS`, `409 IDEMPOTENCY_CONFLICT`, `429 ANONYMOUS_QUOTA_EXHAUSTED`, `429 PLAN_QUOTA_EXHAUSTED` y `503 ROAST_REPLY_UNAVAILABLE`. Los mensajes fuente no se guardan como historial.

### getRoastRanking

- `GET /api/roast-ranking` es público y devuelve un array de hasta diez cuentas activas con consentimiento que hayan enviado al menos un roast.
- Cada elemento tiene `{ username: string, roastMessagesSent: number, avatarUrl?: string }`; el avatar es una URL relativa pública del formato descrito arriba. No expone correo, identificadores internos ni contenido de mensajes.
- Orden: cantidad de mensajes descendente y nombre de usuario ascendente para desempatar. Si no hay participantes, devuelve `[]`.
- La interfaz destaca el primer elemento como ganador separado de la tabla; los elementos restantes ocupan los puestos 2–10.

### ErrorResponse

- `code: string` estable para el frontend.
- `message: string` apto para usuario.
- `details?: Record<string, unknown>` solo cuando no exponga información sensible.

Los identificadores internos, hashes, tokens, embeddings y prompts internos nunca forman parte de un DTO público.

El aviso de similitud incluye el `safeTitle` validado y el total `submissionCount` actualizado tras contar la recepción. Nunca incluye texto original, autor, embedding ni identificador interno de la idea.

### IdeaListItemWorstAll

- `GET /api/worst-ideas` es público y devuelve una lista JSON de estos DTOs para la semana ISO actual de `Europe/Madrid`.
- `safeTitle: string`: título genérico seguro de la idea rechazada; no incluye autor ni texto original.
- `weeklyCount: number`: número de recepciones agregadas para esa idea durante la semana actual.
- Orden: `weeklyCount` descendente y `safeTitle` ascendente como desempate. El score de rúbrica no participa en el orden ni se devuelve en el DTO.
- Devuelve como máximo 10 elementos.
- Lista vacía si no hay registros semanales. No se mezclan datos de muestra.

### IdeaListItemWorstAllTime

- `GET /api/worst-ideas/all-time` es público y devuelve el ranking histórico agregado.
- `safeTitle: string`: título genérico seguro de la idea rechazada; no incluye autor ni texto original.
- `count: number`: número total de recepciones registradas para esa idea.
- Orden: `count` descendente y `safeTitle` ascendente como desempate.
- Devuelve como máximo 10 elementos. La tabla agregada conserva el título seguro y el contador después de purgar el corpus semántico, hasta que la idea alcanza 24 meses desde `last_received_at`; entonces se elimina también el agregado. La migración inicial solo retrocarga ideas que todavía están en el corpus; no incluye las que ya se purgaron.
- Lista vacía si todavía no hay registros; no se mezclan datos de muestra.

### IdeaListItemWorstUser

- `GET /api/account/worst-ideas` requiere `Authorization: Bearer <access JWT>` válido y devuelve un array de estos DTOs solo para el usuario de la sesión.
- `safeTitle: string`: título seguro de la idea rechazada.
- `count: number`: número de recepciones atribuidas a ese usuario para la idea canónica.
- Orden: `count` descendente y `safeTitle` ascendente. No se devuelve score, ID interno, autor, embedding ni texto original.
- Devuelve como máximo 10 elementos.
- El endpoint no acepta `userId` del cliente. Sin una sesión válida responde `401`; los visitantes anónimos no tienen historial almacenado.

### BestUserItem

- `GET /api/best-users` devuelve un array público de hasta diez cuentas activas con consentimiento, ordenado por aprobaciones descendentes y alias ascendente como desempate.
- Cada elemento contiene `username: string`, `approvedIdeasCount: number` y `avatarUrl?: string`, el total de filas de ideas aprobadas almacenadas para esa cuenta y una URL relativa pública opcional del avatar. La repetición con la misma clave idempotente no crea otra fila.
- No incluye títulos, resúmenes, evaluaciones, correo, identificadores de usuario ni texto original de las ideas.
- La API comprueba que el alias cumple la lista permitida de caracteres y que el contador es un entero positivo seguro; ante datos inválidos falla con un error genérico en vez de publicarlos.
