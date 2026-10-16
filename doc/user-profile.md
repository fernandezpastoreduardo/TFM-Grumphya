# Perfil de usuario

`GET /api/account/profile` exige un access JWT válido. `AccessTokenGuard`
valida el bearer y establece `request.user.userId`; el endpoint no acepta el
identificador del usuario desde el cuerpo ni la query. La respuesta contiene
el alias, correo, estado de verificación, fecha de alta y ambos planes.

Los permisos del plan se derivan de las suscripciones vigentes en PostgreSQL.
El perfil muestra el plan activo, su vigencia y los intentos restantes para el
día local de `Europe/Madrid`. Iluminado permite hasta 11 evaluaciones y Faltón
hasta 11 roasts por día; un plan inactivo o un ámbito no incluido muestra cero
intentos. El consumo se reserva y confirma en PostgreSQL transaccionalmente:
una evaluación o respuesta válida de roast consume una unidad y un fallo libera
la reserva. La fecha usa el calendario de Madrid, incluidos los cambios
estacionales de hora.

Las solicitudes autenticadas requieren una clave de idempotencia asociada al
payload. El mismo envío devuelve la respuesta cacheada sin volver a consumir;
el TTL lógico de la caché es de 24 horas desde la reserva inicial y los
reintentos no renuevan ese plazo. La fila guarda el cuerpo completo de respuesta,
que puede contener salida generada derivada de la solicitud, aunque el payload
fuente no se guarda en campos propios. La expiración lógica no garantiza el
borrado físico a las 24 horas. Una reserva incompleta responde `409` durante
30 minutos y después puede recuperarse. Las filas expiradas se borran
oportunistamente en lotes de hasta 500 al procesar una reserva nueva; no hay
tarea periódica para esta tabla.

`GET /api/account/good-ideas` usa la misma autenticación y deriva el propietario
del JWT. Devuelve `{ ideas: [{ id, title, createdAt }] }` con las diez filas
más recientes, ordenadas por `created_at DESC, id DESC`. Si la cuenta no tiene
ideas aprobadas, responde con una lista vacía. El perfil no presenta datos de
muestra.

La web usa `authenticatedFetch`, que obtiene el access token en memoria y lo
renueva mediante el refresh token HttpOnly cuando es necesario. El refresh token
no se expone a JavaScript. Los fallos de autenticación presentan un enlace para
volver a iniciar sesión; los fallos de carga permiten reintentar sin mostrar
datos privados en el mensaje.

La implementación y sus pruebas están en `apps/api/src/register-with-plan/`,
`apps/api/src/get-user-profile/` y `apps/web/src/features/user-profile/`.

## Contratación y vigencia de planes

Cada compra activa el plan desde el momento de la contratación simulada hasta un mes después. No hay renovación automática ni cancelación anticipada. Cuando un plan esté inactivo o haya caducado, el perfil presenta «Pagar un café»; el servidor registra una nueva compra idempotente y devuelve la vigencia y los intentos diarios. Los planes activos no ofrecen botón de pago. El diálogo de pago simulado es el mismo que se usa en el alta.
