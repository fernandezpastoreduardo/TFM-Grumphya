# Producción en un único VPS

Esta caja prepara Grumphya para un único VPS IONOS M+ con Docker Compose. No crea recursos, contrata servicios ni despliega nada. Antes de arrancar, asigna un dominio al VPS y permite tráfico entrante TCP 80/443 y UDP 443 en el firewall de IONOS y del sistema. Caddy obtiene y renueva automáticamente el certificado cuando el DNS público apunta al servidor.

## Topología

- Caddy es el único servicio publicado: HTTP 80 redirige a HTTPS y HTTPS 443 sirve el sitio, `/api/*` y las rutas de la SPA.
- La web React se compila en la imagen y Nginx sirve los archivos estáticos; Vite no se ejecuta en producción.
- La API NestJS solo está en la red privada de Compose, junto con PostgreSQL 17 (`pgvector/pgvector:0.8.7-pg17`).
- PostgreSQL y los avatares usan volúmenes nombrados persistentes. Caddy conserva también sus certificados.
- Un servicio de una sola ejecución aplica las migraciones y la API espera a que termine correctamente y a que PostgreSQL esté saludable.
- PostgreSQL solo pertenece a la red interna. La API también se conecta a una red privada de salida para poder llamar a OpenAI y SMTP; no publica ningún puerto del host.
- PostgreSQL mantiene separado el usuario bootstrap `postgres`, cuya contraseña está en `postgres_admin_settings` y solo se monta en `db`, del usuario de runtime configurado en `database_settings`. La inicialización crea el usuario de runtime como propietario de la base, sin privilegios de superusuario; API, migrador y aprovisionador Jappy usan solo este rol limitado. La contraseña bootstrap no se entrega a la API.

La red interna confía en el proxy Caddy por su dirección privada fija. Express usa `TRUST_PROXY=172.31.0.254/32`, la IP de Caddy en la red `backend`; Caddy determina la dirección remota del socket y la API no está expuesta a Internet. Si cambias las subredes o la IP de Caddy en Compose, actualiza esta allowlist. No configures `trust proxy=true` ni confíes en cabeceras reenviadas desde clientes.

Compose selecciona `PGSSL_MODE=disable-internal` únicamente con `PGHOST=db`; el pool rechaza ese modo para cualquier otro host. Las ejecuciones de producción que conecten a una base externa usan `verify-full` por defecto y exigen certificado válido.

## Preparar el VPS y los archivos

Instala Docker Engine con Compose v2 en el VPS, clona esta rama y entra en el directorio del repositorio. Comprueba que las subredes `172.30.0.0/24` y `172.31.0.0/24` no colisionan con redes existentes en el host.

1. Crea los archivos reales a partir de las plantillas (los nombres de destino no llevan `.example`) y crea `.env.production` a partir de [production-domain.example](production-domain.example):

   ```sh
   cp .secrets/grumphya_env.example .secrets/grumphya_env
   cp .secrets/postgres_admin_settings.example .secrets/postgres_admin_settings
   cp .secrets/database_settings.example .secrets/database_settings
   cp .secrets/openai_settings.example .secrets/openai_settings
   cp .secrets/openai_key.example .secrets/openai_key
   cp .secrets/mail_settings.example .secrets/mail_settings
   cp .secrets/admin_settings.example .secrets/admin_settings
   cp doc/production-domain.example .env.production
   ```

2. Restringe los permisos: `chmod 700 .secrets && chmod 600 .secrets/* .env.production`.
3. Rellena los archivos en el VPS con secretos nuevos y únicos. No los copies al repositorio ni a la imagen. No los pongas en comandos, historial de shell, argumentos de construcción, `VITE_*` ni registros.
4. En `postgres_admin_settings`, define una contraseña aleatoria y única para el usuario bootstrap `postgres`. En `database_settings`, define el nombre de la base, el usuario runtime dedicado y otra contraseña larga aleatoria. El usuario runtime no es superusuario. En `grumphya_env`, define `ACCESS_TOKEN_SECRET` y `ANONYMOUS_IP_HMAC_SECRET` con al menos 32 bytes aleatorios cada uno. No reutilices valores entre campos o entornos.
5. Completa `openai_key` con la clave del servidor y `openai_settings` con el proveedor/modelo elegido. Completa `mail_settings` con las credenciales SMTP. Son credenciales independientes; la API exige estos cinco archivos: `grumphya_env`, `database_settings`, `openai_settings`, `openai_key` y `mail_settings`. `postgres_admin_settings` se reserva al contenedor de PostgreSQL.
6. `admin_settings` solo se monta en el comando explícito de aprovisionamiento de Jappy. No se carga al iniciar la API. Guarda ahí una contraseña inicial que cumpla 12–128 caracteres e incluya mayúscula, minúscula, número y símbolo.
7. En `.env.production`, configura `DOMAIN` como nombre DNS sin esquema ni ruta. `WEB_ORIGIN` puede quedar vacío para usar `https://$DOMAIN`, o contener el origen HTTPS exacto.

Los `.example` son plantillas vacías versionadas. Los archivos reales bajo `.secrets/` y `.env.production` están ignorados por Git. Verifica DNS antes de arrancar: el registro A (y AAAA si existe) debe apuntar al VPS; un AAAA incorrecto puede impedir el desafío ACME.

## Arrancar y comprobar

```sh
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait
docker compose --env-file .env.production -f compose.production.yaml ps
```

Compose construye la web estática y la API, espera a PostgreSQL, ejecuta las migraciones y solo entonces inicia la API. Si la migración falla, la API permanece detenida y Compose informa que su dependencia no completó. Revisa el estado con:

```sh
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 db migrate api proxy
curl --fail https://<tu-dominio>/api/health
curl --fail https://<tu-dominio>/
curl --fail https://<tu-dominio>/una-ruta-interna-de-la-spa
```

La respuesta de salud confirma PostgreSQL y pgvector. Comprueba también en el navegador que la página y `/api/*` usan HTTPS y que el HTML recibe `Permissions-Policy: camera=(), microphone=(self), geolocation=(), on-device-speech-recognition=(self)`. La disponibilidad del dictado depende además del navegador del usuario.

Después de que la migración inicial haya terminado, aprovisiona Jappy explícitamente:

```sh
docker compose --env-file .env.production -f compose.production.yaml run --rm admin-provision
```

El comando crea la cuenta si aún no existe y no cambia la contraseña en ejecuciones repetidas. Para cambiarla de forma deliberada, actualiza únicamente `ADMIN_PASSWORD` en `admin_settings`, protege el archivo, y ejecuta `docker compose ... run --rm admin-provision --change-password`. Esta acción reemplaza el hash y revoca las sesiones activas de Jappy; el reinicio ordinario de la API no afecta a la cuenta.

### Rotar contraseñas de PostgreSQL

La contraseña de `postgres_admin_settings` sirve solo para el usuario bootstrap `postgres`; `GRUMPHYA_DB_PASSWORD` es la del rol de runtime `PGUSER`. Cambiar un archivo no cambia el rol de un volumen PostgreSQL existente. Haz una copia antes, abre una sesión local de `psql` como bootstrap y usa el comando interactivo `\password` para evitar escribir la contraseña en el historial:

```sh
docker compose --env-file .env.production -f compose.production.yaml exec -it db psql -U postgres
```

En `psql`, ejecuta `\password postgres` para rotar la contraseña bootstrap, o `\password <PGUSER>` con el nombre configurado en `database_settings` para rotar el rol de runtime. Actualiza solo el archivo correspondiente y recrea los servicios que consumen ese secreto; `db` para la contraseña bootstrap, `api`, `migrate` y `admin-provision` para la contraseña runtime. Conserva los demás archivos y volúmenes.

## Actualizar y migrar

Conserva `.secrets`, `.env.production` y los volúmenes. Actualiza el código a una revisión elegida y ejecuta:

```sh
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 migrate api
```

El servicio `migrate` termina antes de que se atienda tráfico nuevo. Las migraciones actuales se aplican en una transacción y registran cada versión; una falla revierte el lote y bloquea el arranque de la API. No marques manualmente una migración como aplicada. Corrige el código o restaura una copia compatible, y vuelve a arrancar. Si la base tiene un estado parcial que no puede recuperarse hacia delante, detén los servicios y restaura PostgreSQL y avatares desde una misma ventana de copia.

No uses `docker compose down -v` en producción, ni como actualización ni como solución de errores: elimina los volúmenes de PostgreSQL y avatares. `docker compose down` sin `-v` conserva los volúmenes, aunque para actualizar basta con `up -d --build`.

## Copias y restauración

Guarda copias cifradas fuera del VPS y prueba la restauración periódicamente. Crea un directorio privado de respaldo fuera del repositorio. Detén primero el proxy y la API para que la base y el volumen de avatares correspondan al mismo momento. El helper de PostgreSQL lee los nombres de base y usuario desde el secreto montado; las tuberías cifran los datos directamente sin crear dumps SQL ni tar en claro:

```sh
umask 077
backup_date=$(date +%F)
docker compose --env-file .env.production -f compose.production.yaml stop proxy api
docker compose --env-file .env.production -f compose.production.yaml exec -T db /usr/local/bin/grumphya-postgres-backup.sh dump | gpg --symmetric --cipher-algo AES256 --output /ruta/segura/grumphya-"$backup_date".sql.gpg
docker compose --env-file .env.production -f compose.production.yaml run --rm --entrypoint tar api -czf - -C /workspace/var/avatars . | gpg --symmetric --cipher-algo AES256 --output /ruta/segura/avatars-"$backup_date".tar.gz.gpg
docker compose --env-file .env.production -f compose.production.yaml start api proxy
```

GPG pide una frase de cifrado de forma interactiva; guárdala aparte de las copias. Comprueba que ambos archivos `.gpg` existen y se pueden descifrar antes de copiar solo esos archivos cifrados fuera del VPS.

Para restaurar, detén API y proxy, confirma que tienes copias verificadas y recrea la base vacía antes de cargar el dump. Estos comandos eliminan los datos actuales de esa base; úsalos solo como parte de una restauración deliberada. No mezcles un dump antiguo con avatares de una fecha distinta:

```sh
docker compose --env-file .env.production -f compose.production.yaml stop proxy api
gpg --decrypt /ruta/segura/grumphya-fecha.sql.gpg | docker compose --env-file .env.production -f compose.production.yaml exec -T db /usr/local/bin/grumphya-postgres-backup.sh restore
gpg --decrypt /ruta/segura/avatars-fecha.tar.gz.gpg | docker compose --env-file .env.production -f compose.production.yaml run --rm --entrypoint tar api -xzf - -C /workspace/var/avatars
docker compose --env-file .env.production -f compose.production.yaml up -d
```

Para una restauración real sobre una base existente, crea una base limpia y restaura ahí, o sigue el procedimiento validado de `pg_restore`/`psql` para evitar duplicar objetos. Mantén una copia de la base y del archivo de avatares anterior hasta verificar `/api/health`, el acceso a cuentas y la lectura de avatares. El volumen Docker no sustituye a una copia externa.

## Límites operativos

- La compra de planes sigue simulada. Esta entrega no envía pagos.
- Una sola instancia mantiene el alcance de esta caja; los límites por IP no se distribuyen entre réplicas.
- Los logs no deben contener contraseñas, tokens ni texto de ideas. No uses `docker compose config` sin `--quiet` en terminales compartidas, aunque el Compose solo referencia rutas de secretos.
- La verificación de DNS, emisión del certificado, reglas del firewall, copia fuera del VPS, restauración y comportamiento del hardware quedan pendientes hasta disponer del dominio y servidor reales.
