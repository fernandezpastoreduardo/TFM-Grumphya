## DTOs definitions

Los DTOs son contratos de API. No deben exponer entidades de base de datos directamente.

### EvaluateIdeaRequest

- `ideaText: string`, entre 10 y 800 caracteres.
- `tone: 'soft' | 'hard'`.

### EvaluationResult

- `id: string` (UUID público).
- `ideaId: string`.
- `score: number` (0–100).
- `verdict: 'reject' | 'review' | 'promising'`.
- `criteria: { key: string; rating: 0 | 1 | 2 | 3 | 4; weight: number; reason: string; isUnknown: boolean }[]` (seis elementos).
- `summary: string`.
- `risks: string[]`.
- `assumptions: string[]`.
- `recommendations: string[]`.
- `tone: 'soft' | 'hard'`.
- `isRepeated: boolean`.
- `timesSubmitted: number`.
- `createdAt: string` (ISO 8601).
- `rubricVersion: 'v1'`.

`tone` identifica la presentación pedida; la evaluación base no depende de él. La respuesta reutilizada no contiene texto ni identificadores de otro usuario. `promising` es el único veredicto que cuenta como idea aprobada en «Humanos notables».

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
