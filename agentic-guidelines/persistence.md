## Persistence decision

Use one PostgreSQL database with `pgvector` in the MVP. Do not introduce Pinecone until measured scale justifies a separate vector service.

## Entidades y relaciones v1

`users`: `id` UUID (PK), `username` único, `password_hash`, `created_at`. No guarda contadores ni banderas de planes: estos se derivan de suscripciones y usos. Las contraseñas se guardan mediante un algoritmo de hash apto para contraseñas; nunca en claro.

`plans`: `code` (PK: `ILUMINADO` o `FALTON`), `ideas_per_day`, `roasts_per_day` y `validity_months`. Ambos planes duran un mes natural desde la activación: `ILUMINADO` concede 11 ideas y 0 roasts diarios; `FALTON` concede 0 ideas y 11 roasts diarios. En la primera entrega, la activación es simulada y no hay cobro real. La primera entrega permite escoger uno al darse de alta. Un plan combinado necesitaría definición propia antes de habilitarse.

`subscriptions`: `id` UUID (PK), `user_id` (FK), `plan_code` (FK), `status`, `starts_at`, `expires_at`, `activation_source` (`simulated` en la primera entrega) e `idempotency_key` único. Solo `status = active` y `starts_at <= now < expires_at` concede permisos. La confirmación simulada se ejecuta en el servidor y no acepta una bandera `isPaid` del cliente.

`anonymous_sessions`: `id` UUID (PK), `created_at`, `expires_at`. El ID se entrega mediante cookie de sesión firmada, `HttpOnly`, `Secure` y `SameSite`; el servidor lleva el consumo. Al terminar la sesión, los 3 usos de cada tipo pueden comenzar de nuevo. No constituye una garantía de tres usos por persona.

`usage_counters`: `id` UUID (PK), exactamente uno de `user_id` (FK) o `anonymous_session_id` (FK), `scope` (`ideas`/`roasts`), `period_key`, `used_count`, `reserved_count`. Para cuentas con plan, `period_key` es la fecha de `Europe/Madrid`; para visitantes, es la sesión completa. Debe existir una restricción única por sujeto, ámbito y período.

`usage_requests`: `idempotency_key` (PK), `usage_counter_id` (FK), `status` (`reserved`/`committed`/`released`) y marcas de tiempo. La reserva y la confirmación/liberación deben ser atómicas; un reintento de red devuelve el resultado previo sin consumir otro uso.

La función administrativa se representa como permiso separado del plan comercial. Si se precisa una cuenta de administración, se crea por un proceso protegido de configuración, sin alias o ID públicos predecibles. No se insertan cuentas de ejemplo en producción.

`ideas`: `id` UUID (PK), `normalized_text`, `semantic_title` anulable, `is_public_title_safe`, `times_submitted` (empieza en 1), `created_at`, `updated_at`. Es la idea canónica que puede recibir varios envíos. El título público se genera solo para ideas con veredicto `reject`; debe ser una síntesis genérica sin datos personales, nombres propios, citas literales o detalles singulares. Si no puede validarse como seguro, `is_public_title_safe = false` y no participa en rankings. El texto original nunca aparece en rankings públicos.

`idea_embeddings`: `idea_id` (PK/FK a `ideas`), `embedding` (`vector`), `model_name`, `model_version`, `dimension`. La búsqueda compara solo vectores compatibles.

`evaluations`: `id` UUID (PK), `idea_id` (FK única), seis notas y justificaciones estructuradas, `score` (0–100), `verdict` (`reject`/`review`/`promising`), `summary`, `risks`, `assumptions`, `recommendations`, `rubric_version`, `evaluator_version`, `created_at`. No tiene `tone`: la presentación `soft`/`hard` se deriva de una evaluación base compartida.

`idea_submissions`: `id` UUID (PK), `user_id` (FK), `idea_id` (FK), `submitted_text`, `tone`, `created_at`. Solo se crea para cuentas registradas y forma su historial privado, tanto si la evaluación es nueva como reutilizada. El historial anónimo no se almacena.

`idea_daily_counts`: `idea_id` (FK), `date_madrid` (fecha local, parte de la PK), `received_count`. Agrega envíos registrados y anónimos sin vincular a personas; permite calcular el ranking de la semana ISO en `Europe/Madrid`. `ideas.times_submitted` conserva el total histórico.

`roasts`: `id` UUID (PK), `user_id` (FK), `insult_text`, `response_text`, `created_at`. Los envíos anónimos consumen su contador de sesión pero no crean historial personal.

El número de ideas aprobadas de un usuario es `COUNT(DISTINCT idea_id)` de sus envíos cuyo veredicto canónico sea `promising`; repetir la misma idea no aumenta el ranking. El ranking público de humanos devuelve solo alias y ese número. «Worst Ideas» usa solo ideas con `verdict = reject`, `is_public_title_safe = true` y recepciones de la semana ISO actual: devuelve `semantic_title` y suma semanal de `received_count`, sin autor ni texto original. Ningún dato de muestra entra en estos rankings en producción.

## Vector search

`pgvector` vive dentro del mismo PostgreSQL. `searchSimilarRecordedIdea` calcula `1 - distancia_coseno`, elige el mayor resultado compatible y reutiliza la evaluación solo si el valor es **> 0,90**. Una coincidencia incrementa `ideas.times_submitted` e `idea_daily_counts` una vez; una idea nueva crea su registro, embedding, evaluación base y primer conteo. El umbral y el modelo de embeddings se versionan para poder revisar la v1.

Las operaciones de alta de idea, evaluación, envío registrado, contador de repeticiones y confirmación del uso deben dejar un estado consistente. Una evaluación fallida no crea un resultado parcial ni consume un uso. No se devuelven embeddings, hashes, tokens, texto de otros usuarios ni instrucciones internas del evaluador en DTOs públicos o logs.
