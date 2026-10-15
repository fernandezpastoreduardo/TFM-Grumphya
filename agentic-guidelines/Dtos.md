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

El endpoint no devuelve criterios internos, fragmentos de la idea, puntuación 0–100, ID de evaluación ni datos de persistencia. La orquestación de similitud/persistencia vive en `POST /api/evaluation-process`; no existe historial personal de evaluaciones en el contrato actual.

### EvaluateIdeaResponse

- `status: 'similar_idea_match'` devuelve `safeTitle` verificado y `submissionCount` total después del incremento. No devuelve el identificador interno de la idea, embedding, texto original ni autor. Los usos restantes se consultan por el endpoint de `manageUserUnknow`; detectar la coincidencia no consume una evaluación y continuar reserva un uso anónimo.
- `status: 'evaluated'` devuelve el resultado público de evaluación y, solo para `RECHAZADA` con título validado, `safeTitle`. El título no altera score ni veredicto.
- Reenviar la misma `Idempotency-Key` y el mismo payload para continuar conserva la recepción ya contada aunque la evaluación posterior también dé `RECHAZADA`; cambiar `ideaText` o `tone` con esa clave se rechaza.

La evaluación adicional necesita una comprobación de cuota en servidor, pero las cuotas de ideas anónimas y de plan no existen aún; hasta implementarlas, el DTO no acredita consumo ni disponibilidad de intentos.

### Registration intent and registration DTOs

- `CreateRegistrationIntentRequest`: `plan: 'ILUMINADO' | 'FALTON'`. `POST /api/registration-intents` validates the allowlisted plan and stores it server-side in a one-use intent with a 15-minute expiry. The response sets a random opaque cookie (`HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/api`) and returns only `expiresAt`; it does not return a plan token. `GET /api/registration-intents/current` resolves the plan from that cookie. The next page is `/crear-cuenta` with no query parameters. Mutating requests validate the exact configured `Origin`, require JSON and apply per-process rate limits.
- `RegistrationRequest`: `email: string` (max 254 characters), `username: string` (3–30 Unicode letters/numbers, with `_`, `.` or `-` only between alphanumeric characters), `password: string` (12–128 characters; require uppercase, lowercase, number and special character; reject control characters and do not trim), `privacyPolicyAcknowledged: true`. The plan is obtained from the server-side intent, never from this body. The server stamps `privacyPolicyVersion` and `privacyPolicyAcknowledgedAt`; clients cannot set either. Email is trimmed, lowercased and its domain converted to ASCII; compare case-insensitively, without provider-specific dot/suffix rewriting. Username is trimmed, Unicode NFC normalized and compared case-insensitively.
- `RegistrationPendingResponse`: HTTP 202, `status: 'pending_email_verification'`, generic `message`, and `verificationExpiresAt`. It contains no user ID, active account DTO, session, plan permissions or remaining usage. The response does not claim the written email received a message.
- `VerifyEmailRequest`: `token: string` (submitted through a URL-safe one-time link; store only a token hash, expire in 24 hours, consume atomically). `VerifyEmailResponse`: `status: 'email_verified'`; verification alone does not activate a plan or issue a customer session.
- `ConfirmSimulatedPurchaseRequest`: empty JSON object; it contains no plan, price, `isPaid`, role or permission. A one-use confirmation cookie expires server-side after 15 minutes. In one transaction the server activates the simulated subscription and stores session hashes, then sets the refresh cookie. Reusing a consumed token does not create another session or replay the response; lost-response recovery requires login/support, not yet implemented. `ConfirmSimulatedPurchaseResponse`: `status: 'active'`, `plan`, and session bootstrap.
- The email verification adapter is a fixed development-only sink with intended QA destination `fernandezpastoreduardo@gmail.com`. It does not send a real email; the local test link is exposed only to loopback requests and the UI must say that plainly. Production startup/configuration rejects the simulated adapter.
- Email syntax errors may return a specific validation code/message. Existing email and existing username conflicts must return exactly the same HTTP status, `code`, and body to avoid account enumeration. Privacy acknowledgement errors are explicit and accessible. Error details must not disclose which identity field conflicted.
- Never accept `isPaid`, subscription status, expiry, role, remaining usage, or an authoritative plan from the registration client. Never expose password hashes, verification tokens, intent identifiers, or internal IDs in public DTOs.

### UsageResponse

- `scope: 'ideas' | 'roasts'`, `remaining: number`, `limit: number`, `resetsAt?: string` (ISO 8601).
- Para cuentas, `resetsAt` representa la próxima medianoche en `Europe/Madrid`; para visitantes anónimos, el límite dura su sesión y `resetsAt` se omite.

### ErrorResponse

- `code: string` estable para el frontend.
- `message: string` apto para usuario.
- `details?: Record<string, unknown>` solo cuando no exponga información sensible.

Los identificadores internos, hashes, tokens, embeddings y prompts internos nunca forman parte de un DTO público.

El aviso de similitud incluye el `safeTitle` validado y el total `submissionCount` actualizado tras contar la recepción. Nunca incluye texto original, autor, embedding ni identificador interno de la idea.

### IdeaListItemWorstAll

- Se obtiene de las ideas canónicas con `verdict = reject` recibidas en la semana ISO actual de `Europe/Madrid`, ordenadas por menor score y con desempate por mayor número de recepciones semanales.
- `title: string`: título breve generado para la idea rechazada, sin autor ni texto original.
- `timesSubmitted: number`: número de veces recibida la idea canónica esa semana.

### IdeaListItemWorstUser

Vista privada del usuario autenticado. Incluye `title`, `score`, `timesSubmitted` y `submittedAt` (ISO 8601) de sus envíos rechazados. Un visitante anónimo recibe estado vacío; no hay historial local de sus ideas.

### NotableHumanItem

- `username: string` (alias público).
- `approvedIdeasCount: number`: número de ideas canónicas distintas del usuario con `verdict = promising`.
- Nunca incluye títulos, texto, evaluaciones ni ID de esas ideas.
