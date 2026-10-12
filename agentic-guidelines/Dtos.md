## DTOs definitions

Los DTOs son contratos de API. No deben exponer entidades de base de datos directamente.

### EvaluateIdeaRequest

- `ideaText: string`, entre 10 y 2.000 caracteres.
- `tone: 'soft' | 'hard'`.

### EvaluationProcessResponse

- `status: 'RECHAZADA' | 'SIN_BLOQUEO_EVIDENTE' | 'IDEA_INSUFICIENTE'`.
- `score: number | null`; escala global 0–10. `RECHAZADA`: nota del aspecto de veto dividida entre 10. `SIN_BLOQUEO_EVIDENTE`: media aritmética de los criterios `PUNTUADO`, dividida entre 10 y redondeada a dos decimales; `null` si ninguno se puntuó. `IDEA_INSUFICIENTE`: `null`.
- `message: string`; una frase visible. La UI presenta el score con dos decimales en `es-ES`.

El primer corte no devuelve criterios internos, fragmentos de la idea, puntuación 0–100, ID de evaluación ni datos persistidos. El contrato posterior de historial/persistencia queda fuera de `evaluationProcess` y se definirá al desarrollar esas features.

### RegistrationRequest / AccountResponse

- Solicitud: `username`, `password`, `selectedPlan: 'ILUMINADO' | 'FALTON'`.
- Respuesta: `userId` UUID, `username`, `plan`, `subscriptionStatus`, `expiresAt`, `remainingIdeas`, `remainingRoasts`.
- La contratación simulada se confirma con una operación idempotente del servidor antes de activar permisos. Nunca se recibe `isPaid` o un rol concedido por el cliente.

### UsageResponse

- `scope: 'ideas' | 'roasts'`, `remaining: number`, `limit: number`, `resetsAt?: string` (ISO 8601).
- Para cuentas, `resetsAt` representa la próxima medianoche en `Europe/Madrid`; para visitantes anónimos, el límite dura su sesión y `resetsAt` se omite.

### ErrorResponse

- `code: string` estable para el frontend.
- `message: string` apto para usuario.
- `details?: Record<string, unknown>` solo cuando no exponga información sensible.

Los identificadores internos, hashes, tokens, embeddings y prompts internos nunca forman parte de un DTO público.

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
