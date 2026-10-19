# Perfil de usuario

`GET /api/account/profile` exige un access JWT válido. `AccessTokenGuard`
valida el bearer y establece `request.user.userId`; el endpoint no acepta el
identificador del usuario desde el cuerpo ni la query. La respuesta contiene
el alias, correo, estado de verificación, fecha de alta, contador de roasts,
URL pública opcional del avatar y ambos planes.

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

## Avatar de cuenta

El perfil muestra el avatar actual en formato circular y un botón de edición
con icono. Ese botón abre un diálogo accesible para elegir o reemplazar la
imagen, ajustar el encuadre y el zoom y revisar una previsualización circular
antes de guardar. La persona puede arrastrar la imagen y ajustar el zoom entre
1× y 3×, además de mover el encuadre horizontal y verticalmente. El recorte se
prepara en el navegador mediante canvas como JPEG de 128 × 128 píxeles; el
formato circular es una máscara de presentación, no un recorte redondo que
elimine píxeles de la imagen almacenada. Los avatares se muestran en círculo
en el perfil, el nav y las listas públicas.

Al guardar, el navegador envía el recorte por `POST /api/account/avatar` como
una única parte multipart llamada `avatar`. El endpoint exige Bearer válido y
`Origin` exacto de `WEB_ORIGIN`; admite como máximo tres subidas por minuto y
por IP en cada proceso. Solo se aceptan JPEG, PNG y WebP rasterizados de hasta
5 MiB; el formato decodificado debe coincidir con el MIME declarado, así que
un SVG o archivo disfrazado se rechaza. Sharp valida de nuevo los datos,
limita la entrada a 20 megapíxeles y normaliza el resultado a WebP de 128 × 128,
con orientación corregida y metadatos descartados. Los bytes originales y el
recorte JPEG del navegador no se conservan. La clave OpenAI existente se usa
solo en el servidor para comprobar el WebP final con `omni-moderation-latest`;
no se persiste ni publica si la moderación lo marca, si falta la clave o si el
servicio devuelve una respuesta inválida/no disponible. El navegador actualiza
el avatar solo después de que el servidor haya terminado la moderación y el
almacenamiento.

La API responde con errores saneados: los archivos que superan el límite
devuelven `413 AVATAR_TOO_LARGE`; las partes multipart o imágenes inválidas,
`400`; y los fallos de moderación, almacenamiento o actualización de la cuenta,
`503` sin detalles internos. No se registran datos de imagen ni claves de
almacenamiento para diagnosticar esos fallos. No hay evidencia suficiente para
atribuir retrospectivamente el error 500 observado al usar la versión anterior.

La automatización es un filtro de riesgo, no una garantía de que la imagen sea
apta ni una clasificación legal por edades. Puede equivocarse o no detectar
contenido, y no sustituye revisión humana. La moderación de imágenes no está
diseñada para detectar CSAM; no se deben subir imágenes conocidas o sospechosas
de ese tipo. El usuario debe escoger una imagen pública apropiada. La imagen
procesada se envía a OpenAI para moderación, así que la política de privacidad
provisional debe completarse antes de ofrecer la función a personas usuarias
reales.

El archivo se guarda fuera del árbol público de la web en el directorio
configurado por `USER_AVATAR_DIRECTORY` (por defecto `var/avatars`), bajo un
nombre aleatorio con permisos locales restrictivos. En Docker, Compose lo monta
como volumen nombrado `grumphya-avatar-data` en `/workspace/var/avatars`; recrear
contenedores conserva tanto la base como los avatares. La base solo guarda la
clave opaca. `GET /api/avatars/:avatarKey` sirve la imagen WebP moderada sin
autenticación para que pueda aparecer en el perfil, el nav y los rankings
públicos; no expone correo ni ID interno. El avatar se puede identificar
públicamente junto al alias del ranking. Si se elimina o sustituye un avatar,
el anterior debe dejar de estar disponible.

Antes de guardar, el diálogo informa que la imagen se envía a OpenAI para una
revisión automática y que el avatar aprobado aparecerá junto al alias en áreas
públicas. El aviso aclara el tratamiento, pero no sustituye a una política de
privacidad completa ni a la información legal sobre el proveedor.

La web usa `authenticatedFetch`, que obtiene el access token en memoria y lo
renueva mediante el refresh token HttpOnly cuando es necesario. El refresh token
no se expone a JavaScript. Los fallos de autenticación presentan un enlace para
volver a iniciar sesión; los fallos de carga permiten reintentar sin mostrar
datos privados en el mensaje.

La implementación y sus pruebas están en `apps/api/src/register-with-plan/`,
`apps/api/src/get-user-profile/` y `apps/web/src/features/user-profile/`.
El procesamiento, moderación y almacenamiento del avatar viven en
`apps/api/src/user-avatar/`; la migración `021_user_avatar.sql` añade la clave
opaca del avatar a `users`.

Si una persona ya inició sesión, elegir cualquiera de los planes desde
`/precios` la lleva a `/perfil`, desde donde puede contratar el plan inactivo.
La ruta `/crear-cuenta` también redirige a `/perfil` para cuentas autenticadas;
los visitantes no autenticados pueden completar el alta allí.

## Contratación y vigencia de planes

Cada compra activa el plan desde el momento de la contratación simulada hasta un mes después. No hay renovación automática ni cancelación anticipada. Cuando un plan esté inactivo o haya caducado, el perfil presenta «Pagar un café»; el servidor registra una nueva compra idempotente y devuelve la vigencia y los intentos diarios. Los planes activos no ofrecen botón de pago. El diálogo de pago simulado es el mismo que se usa en el alta.
