## DTOs definitions

Los DTOs son contratos de API. No deben exponer entidades de base de datos directamente.

### EvaluateIdeaRequest

- `ideaText: string`, entre 10 y 2.000 caracteres.
- `tone: 'soft' | 'hard'`.
- La orquestación requiere `Idempotency-Key` aleatoria por envío lógico, conservada en la detección y continuación durante 24 horas. La tabla no almacena texto fuente: vincula la clave al payload normalizado `ideaText` + `tone` mediante `request_hash`, una huella HMAC-SHA-256 cuya clave es la propia `Idempotency-Key`. Reutilizarla con otro payload se rechaza; `continueAnyway` debe conservar el payload inicial.

### EvaluationProcessResponse

- `status: 'RECHAZADA' | 'SIN_BLOQUEO_EVIDENTE' | 'IDEA_INSUFICIENTE'`.
- `score: number | null`; escala global 0–10. `RECHAZADA`: nota del aspecto de veto dividida entre 10. `SIN_BLOQUEO_EVIDENTE`: media aritmética de los criterios `PUNTUADO`, dividida entre 10 y redondeada a dos decimales; `null` si ninguno se puntuó. `IDEA_INSUFICIENTE`: `null`.
- `message: string`; una frase visible. La UI presenta el score con dos decimales en `es-ES`.
- El `message` público no incluye IDs de criterio (`C01`–`C10`) ni `reason_code`. El backend sustituye aliases internos que aparezcan accidentalmente por una descripción legible en español.

El endpoint no devuelve criterios internos, fragmentos de la idea, puntuación 0–100, ID de evaluación ni datos de persistencia. La orquestación de similitud/persistencia vive en `POST /api/evaluation-process`; no existe historial personal de evaluaciones en el contrato actual.

### EvaluateIdeaResponse

- `status: 'similar_idea_match'` devuelve `safeTitle` verificado y `submissionCount` total después del incremento. No devuelve el identificador interno de la idea, embedding, texto original ni autor. Los usos restantes se consultan por el endpoint de `manageUserUnknow`; detectar la coincidencia no consume una evaluación y continuar reserva un uso anónimo.
- `status: 'evaluated'` devuelve el resultado público de evaluación y, solo para `RECHAZADA` con título validado, `safeTitle`. El título no altera score ni veredicto.
- Reenviar la misma `Idempotency-Key` y el mismo payload para continuar conserva la recepción ya contada aunque la evaluación posterior también dé `RECHAZADA`; cambiar `ideaText` o `tone` con esa clave se rechaza.

Las cuotas se reservan en el servidor. Una suscripción Iluminado vigente permite 11 evaluaciones diarias; Faltón vigente permite 11 roasts diarios. La API comprueba sesión y suscripción activa en servidor y deriva el día de uso de `Europe/Madrid`; la fila diaria se bloquea transaccionalmente y se cuentan los usos confirmados más las reservas en curso. Si la cuenta no tiene activo el plan correspondiente, se aplica el cupo gratuito de ese ámbito asociado al perfil del navegador; tener activo el otro plan no lo consume ni lo elimina. Una coincidencia de idea que solo muestra el aviso libera la reserva; «Evaluar igualmente» reserva antes de evaluar. Solo una respuesta completa y válida confirma el uso; los fallos de búsqueda, evaluación, generación o validación liberan la reserva. La respuesta de roast se genera con OpenAI y se valida antes de confirmar el uso. Al agotarse la cuota diaria o gratuita, la API responde `429` con el código de límite, `scope` y `remaining: 0`.

Las solicitudes autenticadas requieren `Idempotency-Key` UUID. Se guarda el hash de la clave y una huella HMAC del payload. La misma clave y payload devuelve la respuesta cacheada sin volver a consumir; usar la clave con otro payload da `409`. El TTL lógico de la respuesta es de 24 horas desde la reserva original; los reintentos no amplían ese plazo. El `response_json` guarda el cuerpo íntegro devuelto por la API y puede contener salida generada derivada de la solicitud, aunque no guarda la idea o el roast fuente como campos independientes. Una reserva incompleta da `409` `REQUEST_IN_PROGRESS` durante 30 minutos y después puede recuperarse mediante un reintento. La expiración lógica no garantiza borrado físico a las 24 horas: las filas caducadas se eliminan oportunistamente en lotes de hasta 500 al procesar una reserva nueva, no mediante un job periódico. Este mecanismo no es historial.

### Registration, session and account DTOs

- `CreateRegistrationIntentRequest`: `plan: 'ILUMINADO' | 'FALTON'`. `POST /api/registration-intents` validates the allowlisted plan and stores it server-side in a one-use intent with a 15-minute expiry. The response sets an opaque `HttpOnly` cookie (`Secure` in production, `SameSite=Strict`, `Path=/api`) and returns only `expiresAt`; `GET /api/registration-intents/current` resolves the plan from that cookie. The form URL contains no plan or token.
- `RegistrationRequest`: `email`, `username`, `password`, and `privacyPolicyAcknowledged: true`. The plan is obtained from the server-side intent. The server stamps the privacy policy version and acknowledgement time. Email and username are normalized and checked for uniqueness; conflict responses are generic and identical. Exact validation rules are in `features.md`.
- `RegistrationResponse`: `status: 'active'`, `plan`, `account`, `accessToken`, and `expiresIn` (600 seconds). A successful `POST /api/registrations` creates the account, simulated subscription, purchase, initial daily-usage rows, and persisted session in one transaction. It sets the rotating refresh token in an `HttpOnly` cookie. There is no real charge or bank data. New accounts are activated directly with `emailVerified: false`; email verification for new registrations is a tracked follow-up.
- `LoginRequest`: account alias or email, password, and optional `rememberMe`. `POST /api/auth/login` returns the same access-session shape and sets the refresh cookie. Login accepts an alias or email. `POST /api/auth/refresh` rotates the refresh cookie and returns a new access token. `POST /api/auth/logout` revokes the refresh session and clears that cookie.
- The access JWT is sent in `Authorization: Bearer <accessToken>` for protected APIs. The refresh cookie exists only to obtain/rotate access tokens; it is not itself the authorization credential for profile, evaluation, plan purchase or account deletion routes. Access tokens expire after ten minutes. «Recordarme» caps refresh-session lifetime at 30 days; without it, the cookie is a session cookie and the server expires the session within 24 hours. Migration `016_auth_refresh_rotation_history.sql` adds `previous_refresh_token_hash`: refresh rotation retains only the hash from the immediately preceding token, and logout can revoke the session with either the current or immediately preceding refresh token. The previous hash is overwritten at the next rotation; plaintext tokens are never persisted.
- `AccountProfile`: `{ user: { email, username, emailVerified, createdAt, roastMessagesSent }, plans: [{ plan, status, startsAt, expiresAt, attemptsRemaining: { ideas, roasts } }] }`. `roastMessagesSent` is the account's accumulated count for the future Faltón ranking and lets the UI detect prior roast activity across daily quota resets; it contains no message text. `GET /api/account/profile` requires a valid access JWT and derives the owner only from the validated session. Plan states, count, and attempts are read from server persistence; inactive plans report zero attempts.
- `UserGoodIdeasResponse`: `{ ideas: [{ id, title, createdAt }] }`. `GET /api/account/good-ideas` requires a valid access JWT, returns at most ten of the current user's approved titles ordered by creation time and ID descending, and exposes no other owner's rows. No `userId` is accepted from the client.
- `PurchasePlanRequest`: `{ plan: 'ILUMINADO' | 'FALTON' }` with a UUID `Idempotency-Key` header. `POST /api/account/subscriptions/purchase` requires a valid access JWT, creates a simulated one-month subscription for an inactive plan and returns the updated `AccountProfile`; an already active plan returns `409 PLAN_ALREADY_ACTIVE`. Purchases do not renew automatically, and there is no early cancellation route.
- `DeleteAccountRequest`: no user identifier is accepted; `DELETE /api/account` uses the authenticated user from the access token and physically deletes the account and cascading private ideas.
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

- `GET /api/roast-ranking` es público y devuelve un array de hasta diez cuentas activas que hayan enviado al menos un roast.
- Cada elemento tiene solo `{ username: string, roastMessagesSent: number }`. No expone correo, identificadores internos ni contenido de mensajes.
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

### IdeaListItemWorstUser

- `GET /api/account/worst-ideas` requiere `Authorization: Bearer <access JWT>` válido y devuelve un array de estos DTOs solo para el usuario de la sesión.
- `safeTitle: string`: título seguro de la idea rechazada.
- `count: number`: número de recepciones atribuidas a ese usuario para la idea canónica.
- Orden: `count` descendente y `safeTitle` ascendente. No se devuelve score, ID interno, autor, embedding ni texto original.
- Devuelve como máximo 10 elementos.
- El endpoint no acepta `userId` del cliente. Sin una sesión válida responde `401`; los visitantes anónimos no tienen historial almacenado.

### BestUserItem

- `GET /api/best-users` devuelve un array público de hasta diez cuentas activas, ordenado por aprobaciones descendentes y alias ascendente como desempate.
- Cada elemento contiene solo `username: string` y `approvedIdeasCount: number`, el total de filas de ideas aprobadas almacenadas para esa cuenta. La repetición con la misma clave idempotente no crea otra fila.
- No incluye títulos, resúmenes, evaluaciones, correo, identificadores de usuario ni texto original de las ideas.
- La API comprueba que el alias cumple la lista permitida de caracteres y que el contador es un entero positivo seguro; ante datos inválidos falla con un error genérico en vez de publicarlos.
