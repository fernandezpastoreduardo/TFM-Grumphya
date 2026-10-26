# manageUserUnknow: límites de uso anónimo

## Alcance

Cada perfil de navegador dispone de **3 evaluaciones de ideas y 3 envíos de roast** en contadores independientes, administrados por la API y PostgreSQL. El perfil y sus contadores se eliminan tras 400 días sin actividad; por tanto, la cuota no es estrictamente vitalicia y puede volver a empezar si se crea otro perfil tras ese periodo. El cupo se aplica a visitantes sin cuenta y también a cuentas autenticadas cuando no tienen activo el plan correspondiente. Por ejemplo, una cuenta con Iluminado usa la cuota de Iluminado para ideas y conserva los intentos gratuitos de roast hasta contratar Faltón. Usar un plan no relacionado no consume ni elimina los intentos gratuitos del otro ámbito. Cerrar la pestaña o el navegador no reinicia el cupo.

La identidad se transporta mediante una cookie opaca, aleatoria y persistente (`HttpOnly`, `SameSite=Strict`, `Secure` en producción y `Path=/api`). La API guarda el hash del token, nunca el valor de la cookie, y purga los perfiles que llevan 400 días sin actividad. La cookie se renueva al consultar el uso anónimo y dura como máximo 400 días desde su emisión. El navegador puede eliminar la cookie o el usuario puede cambiar de dispositivo, con lo que se crea otro perfil: este mecanismo no ofrece identificación permanente de personas.

El perfil anónimo no genera historial. Las tablas de uso anónimo e idempotencia no conservan el texto original de la idea o el insulto como payload fuente; como excepción de diagnóstico separada, `application_error_events` puede conservar hasta 2.000 caracteres de la idea ante errores 5xx de `POST /api/evaluation-process`, con acceso admin y purga a los 30 días. La caché idempotente conserva el cuerpo final de respuesta, que puede contener salida generada derivada de la petición. El TTL lógico de esa respuesta es de 24 horas: pasado ese plazo deja de estar disponible para reintentos. `DataRetentionService` elimina las filas vencidas por lotes al arrancar la API y cada hora; el borrado físico puede ocurrir hasta una hora después del TTL.

## Consumo y reintentos

- Idea sin coincidencia: reservar antes de la búsqueda semántica para no gastar llamadas de IA si ya no queda cuota. Si hay coincidencia, se libera la reserva; una evaluación válida confirma un uso; error de proveedor o salida inválida libera la reserva.
- Idea con coincidencia: la búsqueda y el aviso no consumen la cuota de evaluación. «Evaluar igualmente» reserva un uso antes de llamar al evaluador. Si se rechaza otra vez, el mismo envío lógico no suma una segunda unidad ni vuelve a incrementar Worst Ideas.
- Roast: validar y reservar en servidor; confirmar cuando el proveedor OpenAI devuelve una respuesta válida que supera la validación de salida. La llamada tiene un timeout abortable de 10 segundos. Si vence, falla el proveedor o la validación, liberar la reserva.
- Cada envío lógico usa una clave idempotente ligada por hash al payload. Una repetición de la misma clave y contenido recupera el resultado temporal; una clave con otro contenido se rechaza. Una transacción bloquea el contador para que solicitudes concurrentes no gasten el mismo último uso.
- Cuando se agota el cupo gratuito del perfil, la API devuelve `429` con un código estable, el ámbito y `remaining: 0`. No envía `Retry-After`: no existe un momento de reinicio. Una cuenta sin el plan de ese ámbito usa este cupo; un plan activo aplica su cuota diaria y deja intacto el cupo gratuito.

## IP y abuso

La cookie es la identidad primaria. La IP solo es una defensa temporal ante ráfagas y rotación repetida de cookies: máximo 20 perfiles nuevos por IP cada 24 horas y límites por ruta en envíos. No se usa para imponer un cupo permanente por dirección ni para banear. Esto evita que una IP compartida por una familia, oficina o red móvil represente a una sola persona, aunque su límite temporal sí puede afectar a una red compartida.

Para contar rotaciones entre procesos/instancias, la API almacena un HMAC de la IP, una ventana de 24 horas, el número de perfiles creados y `expires_at`; nunca la IP en claro. Se permiten hasta 20 perfiles nuevos desde una IP en esa ventana. El HMAC requiere `ANONYMOUS_IP_HMAC_SECRET`; el script de desarrollo crea un secreto local aleatorio. La actividad de IP caduca en 24 horas. El límite devuelve `429` y `Retry-After`; los límites por ruta de 10 solicitudes/minuto (ideas y roast) y 120/minuto general también devuelven `Retry-After` y actualmente son en memoria por proceso. Express no confía en proxies por defecto. En la caja de producción Compose, la API confía solo en la IP fija de Caddy (`172.31.0.254/32`); la API permanece en la red interna y no publica puertos. Caddy establece la IP remota y la API no acepta cabeceras arbitrarias de clientes como fuente de identidad. Si se cambia la topología, la allowlist debe seguir restringida a los proxies conocidos.

No se aplica fingerprinting del navegador ni detección de automatización en esta entrega. Si el usuario limpia cookies y cambia de IP, puede crear otro perfil anónimo. Evitar todo reuso de cuota por persona sin cuenta requeriría identificación adicional y no forma parte de esta feature.

## API y frontend

- `POST /api/anonymous-usage` exige `Origin` permitido y el cuerpo JSON vacío `{}`, crea la identidad si hace falta y responde los límites, usados y restantes para `ideas` y `roasts`; establece o renueva la cookie.
- `POST /api/evaluation-process` obtiene la identidad de la cookie y delega reserva/confirmación a la feature de cuotas. Nunca acepta contadores, tipo de plan o identidad desde el body.
- `POST /api/roast` recibe y valida el texto, usa la cuota diaria de Faltón si está activo y, en caso contrario, el cupo gratuito del perfil de navegador.
- El frontend muestra valores de servidor y no habilita un fallback local si la API no está disponible. El aviso del cupo gratuito invita a consultar los planes y no sugiere que se recupere mañana, porque ese cupo no tiene reinicio diario. La cuota diaria de un plan activo tiene un diálogo independiente cuando se agota.

La nota de privacidad debe explicar la cookie persistente necesaria para recordar el cupo y el uso antiabuso de la IP. Un HMAC de IP sigue siendo una señal seudónima; limitar su retención no equivale a anonimización. Las respuestas idempotentes y señales expiradas se eliminan por lotes al arrancar la API y cada hora mediante `DataRetentionService`; el borrado físico de cachés puede ocurrir hasta una hora después del TTL.

## Plan de pruebas

1. Reglas puras: 0/1/2/3, ámbitos independientes y falta de reinicio temporal.
2. Repositorio PostgreSQL: reserva, confirmación/liberación, contador máximo, carrera de dos peticiones por un último uso y purga de señales/IP/respuestas caducadas.
3. API: cookie `HttpOnly` y atributos seguros, payload inválido, ausencia de cookie, repetición idempotente, cuota agotada y rate limits por IP con `Retry-After` solo en el límite temporal.
4. Integración idea: un match sin continuar no consume; continuar consume una vez; doble rechazo no añade otro consumo; fallos no consumen.
5. Integración roast y UI: el contador procede de API, los errores no reducen cupo, cero usos deshabilita el formulario y muestra estado accesible.

La prueba de persistencia crea un esquema PostgreSQL aleatorio y lo elimina al terminar. Para ejecutarla, configura `ANONYMOUS_USAGE_TEST_DATABASE_URL` con una base aislada y ejecuta `pnpm --filter @grumphya/api exec vitest run src/manage-user-unknow/anonymous-usage.postgres.spec.ts`. Sin esa variable la suite se omite.

## Preparación para producción

La retención aprobada para perfiles y cuotas sin cuenta es de 400 días desde el último uso. `DataRetentionService` los elimina al arrancar y cada hora por lotes; confirmar que el proceso funciona en producción. El HMAC de IP tiene una retención separada de 24 horas. Antes de habilitar tráfico real, confirmar la configuración de secretos, proxies confiables, rate limiting compartido y operación de las purgas.
