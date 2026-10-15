# manageUserUnknow: límites de uso anónimo

## Alcance

Cada perfil de navegador sin cuenta dispone de **3 evaluaciones de ideas y 3 envíos de roast de por vida**. Son contadores independientes, administrados por la API y PostgreSQL. Cerrar la pestaña o el navegador no reinicia el cupo. Las cuotas diarias de planes comerciales pertenecen a otra feature.

La identidad se transporta mediante una cookie opaca, aleatoria y persistente (`HttpOnly`, `SameSite=Strict`, `Secure` en producción y `Path=/api`). La API guarda el hash del token, nunca el valor de la cookie. La identidad y sus contadores no caducan automáticamente. El navegador puede eliminar la cookie o el usuario puede cambiar de dispositivo, con lo que se crea otro perfil: este mecanismo no ofrece identificación permanente de personas.

El perfil anónimo no genera historial. No se guardan los textos de ideas o insultos en las tablas de cuotas. La respuesta final de una petición idempotente puede conservarse hasta 24 horas para devolverla a un reintento sin volver a consumir cupo; después se purga.

## Consumo y reintentos

- Idea sin coincidencia: reservar antes de la búsqueda semántica para no gastar llamadas de IA si ya no queda cuota. Si hay coincidencia, se libera la reserva; una evaluación válida confirma un uso; error de proveedor o salida inválida libera la reserva.
- Idea con coincidencia: la búsqueda y el aviso no consumen la cuota de evaluación. «Evaluar igualmente» reserva un uso antes de llamar al evaluador. Si se rechaza otra vez, el mismo envío lógico no suma una segunda unidad ni vuelve a incrementar Worst Ideas.
- Roast: validar y reservar en servidor; confirmar cuando se obtiene respuesta válida. La ruta de roast actual usa una respuesta de demostración hasta que exista el proveedor real.
- Cada envío lógico usa una clave idempotente ligada por hash al payload. Una repetición de la misma clave y contenido recupera el resultado temporal; una clave con otro contenido se rechaza. Una transacción bloquea el contador para que solicitudes concurrentes no gasten el mismo último uso.
- Cuando el cupo permanente se agota, la API devuelve `429` con un código estable, el ámbito y `remaining: 0`. No envía `Retry-After`: no existe un momento de reinicio.

## IP y abuso

La cookie es la identidad primaria. La IP solo es una defensa temporal ante ráfagas y rotación repetida de cookies: máximo 20 perfiles nuevos por IP cada 24 horas y límites por ruta en envíos. No se usa para imponer un cupo permanente por dirección ni para banear. Esto evita que una IP compartida por una familia, oficina o red móvil represente a una sola persona, aunque su límite temporal sí puede afectar a una red compartida.

Para contar rotaciones entre procesos/instancias, la API almacena un HMAC de la IP, una ventana de 24 horas, el número de perfiles creados y `expires_at`; nunca la IP en claro. Se permiten hasta 20 perfiles nuevos desde una IP en esa ventana. El HMAC requiere `ANONYMOUS_IP_HMAC_SECRET`; el script de desarrollo crea un secreto local aleatorio. La actividad de IP caduca en 24 horas. El límite devuelve `429` y `Retry-After`; los límites por ruta de 10 solicitudes/minuto (ideas y roast) y 120/minuto general también devuelven `Retry-After` y actualmente son en memoria por proceso. Express confía explícitamente en ningún proxy, por lo que la dirección usada es la conexión directa. Si el despliegue usa un proxy, hay que añadir una lista cerrada de proxies conocidos antes de desplegar; no confiar en `X-Forwarded-For` arbitrario.

No se aplica fingerprinting del navegador ni detección de automatización en esta entrega. Si el usuario limpia cookies y cambia de IP, puede crear otro perfil anónimo. Evitar todo reuso de cuota por persona sin cuenta requeriría identificación adicional y no forma parte de esta feature.

## API y frontend

- `POST /api/anonymous-usage` exige `Origin` permitido y el cuerpo JSON vacío `{}`, crea la identidad si hace falta y responde los límites, usados y restantes para `ideas` y `roasts`; establece o renueva la cookie.
- `POST /api/evaluation-process` obtiene la identidad de la cookie y delega reserva/confirmación a la feature de cuotas. Nunca acepta contadores, tipo de plan o identidad desde el body.
- `POST /api/roast` recibe y valida el texto, impone la misma cuota y devuelve el resultado actual de demostración.
- El frontend muestra valores de servidor y no habilita un fallback local si la API no está disponible. El mensaje de cupo agotado invita a consultar los planes; no sugiere que se recupere mañana.

La nota de privacidad debe explicar la cookie persistente necesaria para recordar el cupo y el uso antiabuso de la IP. Un HMAC de IP sigue siendo una señal seudónima; limitar su retención no equivale a anonimización. Las respuestas idempotentes y señales expiradas se borran al procesar solicitudes posteriores; aún no existe tarea periódica de purga independiente del tráfico.

## Plan de pruebas

1. Reglas puras: 0/1/2/3, ámbitos independientes y falta de reinicio temporal.
2. Repositorio PostgreSQL: reserva, confirmación/liberación, contador máximo, carrera de dos peticiones por un último uso y purga de señales/IP/respuestas caducadas.
3. API: cookie `HttpOnly` y atributos seguros, payload inválido, ausencia de cookie, repetición idempotente, cuota agotada y rate limits por IP con `Retry-After` solo en el límite temporal.
4. Integración idea: un match sin continuar no consume; continuar consume una vez; doble rechazo no añade otro consumo; fallos no consumen.
5. Integración roast y UI: el contador procede de API, los errores no reducen cupo, cero usos deshabilita el formulario y muestra estado accesible.

La prueba de persistencia crea un esquema PostgreSQL aleatorio y lo elimina al terminar. Para ejecutarla, configura `ANONYMOUS_USAGE_TEST_DATABASE_URL` con una base aislada y ejecuta `pnpm --filter @grumphya/api exec vitest run src/manage-user-unknow/anonymous-usage.postgres.spec.ts`. Sin esa variable la suite se omite.

## Preparación para producción

La identidad y el contador ilimitados en el tiempo son una decisión de retención: no deben borrarse si el producto quiere conservar el límite de por vida. El HMAC de IP sí tiene retención corta. Antes de habilitar tráfico real, documentar ambos tratamientos y confirmar configuración de secretos, proxies confiables, rate limiting compartido y operación de las purgas.
