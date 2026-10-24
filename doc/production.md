# Producción en un único VPS

Esta caja prepara Grumphya para un único VPS IONOS M+ con Docker Compose e incluye una opción de despliegue automático desde GitHub Actions, desactivada por defecto. No crea recursos, contrata servicios ni despliega durante esta tarea. Antes de arrancar, asigna un dominio al VPS y permite tráfico entrante TCP 80/443 y UDP 443 en el firewall de IONOS y del sistema. Caddy obtiene y renueva automáticamente el certificado cuando el DNS público apunta al servidor.

## Topología

- Caddy es el único servicio publicado: HTTP 80 redirige a HTTPS y HTTPS 443 sirve el sitio, `/api/*` y las rutas de la SPA.
- La web React se compila en la imagen y Nginx sirve los archivos estáticos; Vite no se ejecuta en producción.
- La API NestJS solo está en la red privada de Compose, junto con PostgreSQL 17 (`pgvector/pgvector:0.8.7-pg17`).
- PostgreSQL y los avatares usan volúmenes nombrados persistentes. Caddy conserva también sus certificados.
- Un servicio de una sola ejecución aplica las migraciones y la API espera a que termine correctamente y a que PostgreSQL esté saludable.
- PostgreSQL solo pertenece a la red interna. La API también se conecta a una red privada de salida para poder llamar a OpenAI y SMTP; no publica ningún puerto del host.
- PostgreSQL mantiene separado el usuario bootstrap `postgres`, cuya contraseña está en `postgres_admin_settings` y solo se monta en `db`, del usuario de runtime configurado en `database_settings`. La inicialización crea el usuario de runtime como propietario de la base, sin privilegios de superusuario; API, migrador y aprovisionador Jappy usan solo este rol limitado. La contraseña bootstrap no se entrega a la API.
- Los archivos de secretos permanecen `root:root` con modo `0600` en el VPS. Los entrypoints de API y migraciones los leen al arrancar como root y bajan inmediatamente al usuario `node` antes de ejecutar la aplicación. El entrypoint de PostgreSQL lee los secretos antes de ceder el proceso a `postgres`; el script inicial recibe solo los datos que necesita. No amplíes los permisos de los archivos para resolver errores de lectura.

La red interna confía en el proxy Caddy por su dirección privada fija. Express usa `TRUST_PROXY=172.31.0.254/32`, la IP de Caddy en la red `backend`; Caddy determina la dirección remota del socket y la API no está expuesta a Internet. Si cambias las subredes o la IP de Caddy en Compose, actualiza esta allowlist. No configures `trust proxy=true` ni confíes en cabeceras reenviadas desde clientes.

Compose selecciona `PGSSL_MODE=disable-internal` únicamente con `PGHOST=db`; el pool rechaza ese modo para cualquier otro host. Las ejecuciones de producción que conecten a una base externa usan `verify-full` por defecto y exigen certificado válido.

## Preparar el VPS y los archivos

Instala Docker Engine con Compose v2 en el VPS, clona esta rama en `/opt/grumphya` y trabaja desde ese directorio. Comprueba que las subredes `172.30.0.0/24` y `172.31.0.0/24` no colisionan con redes existentes en el host.

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

2. Deja los archivos bajo control de `root` y con permisos privados: `chown -R root:root .secrets .env.production && chmod 700 .secrets && chmod 600 .secrets/* .env.production`. Ejecuta Compose como `root` en este VPS; el helper comprueba el propietario y los permisos antes de actualizar.
3. Rellena los archivos en el VPS con secretos nuevos y únicos. No los copies al repositorio ni a la imagen. No los pongas en comandos, historial de shell, argumentos de construcción, `VITE_*` ni registros.
4. En `postgres_admin_settings`, define una contraseña aleatoria y única para el usuario bootstrap `postgres`. En `database_settings`, define el nombre de la base, el usuario runtime dedicado y otra contraseña larga aleatoria. El usuario runtime no es superusuario. En `grumphya_env`, define `ACCESS_TOKEN_SECRET` y `ANONYMOUS_IP_HMAC_SECRET` con al menos 32 bytes aleatorios cada uno. No reutilices valores entre campos o entornos.
5. Completa `openai_key` con la clave del servidor y `openai_settings` con el proveedor/modelo elegido. Completa `mail_settings` con las credenciales SMTP. Son credenciales independientes; la API exige estos cinco archivos: `grumphya_env`, `database_settings`, `openai_settings`, `openai_key` y `mail_settings`. `postgres_admin_settings` se reserva al contenedor de PostgreSQL.
6. `admin_settings` solo se monta en el comando explícito de aprovisionamiento de Jappy. No se carga al iniciar la API. Guarda ahí una contraseña inicial que cumpla 12–128 caracteres e incluya mayúscula, minúscula, número y símbolo.
7. En `.env.production`, configura `DOMAIN` como nombre DNS sin esquema ni ruta. `WEB_ORIGIN` puede quedar vacío para usar `https://$DOMAIN`, o contener el origen HTTPS exacto. `DEPLOY_SHA` puede quedar vacío para una instalación manual; antes del bootstrap de CI escribe ahí el SHA completo (40 caracteres) de la versión inicial que acabas de probar.

Los `.example` son plantillas vacías versionadas. Los archivos reales bajo `.secrets/` y `.env.production` están ignorados por Git. Verifica DNS antes de arrancar: el registro A (y AAAA si existe) debe apuntar al VPS; un AAAA incorrecto puede impedir el desafío ACME.

## Arrancar y comprobar

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml config --quiet
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml up -d --build --wait
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml ps
```

Este arranque manual construye la web estática, la API y el proxy desde sus Dockerfiles; Caddy usa `docker/Caddy.Dockerfile`, que recompila la versión fijada con parches de Go y actualiza los paquetes Alpine de la imagen final. Espera a PostgreSQL, ejecuta las migraciones y solo entonces inicia la API. Si la migración falla, la API permanece detenida y Compose informa que su dependencia no completó. Revisa el estado con:

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml logs --tail=100 db migrate api proxy
curl --fail https://<tu-dominio>/api/health
curl --fail https://<tu-dominio>/
curl --fail https://<tu-dominio>/una-ruta-interna-de-la-spa
```

La respuesta de salud confirma PostgreSQL y pgvector. Comprueba también en el navegador que la página y `/api/*` usan HTTPS y que el HTML recibe `Permissions-Policy: camera=(), microphone=(self), geolocation=(), on-device-speech-recognition=(self)`. La disponibilidad del dictado depende además del navegador del usuario.

## Despliegue automático desde GitHub (opcional)

El workflow está apagado por defecto. Los pull requests ejecutan las pruebas, construcción y escaneos, pero nunca reciben credenciales SSH ni despliegan. Un push a `main` solo publica si pasan `quality-and-e2e` y `supply-chain` y la variable `PRODUCTION_DEPLOY_ENABLED` vale exactamente `true`.

### Preparación manual inicial del VPS

Haz primero la instalación y una puesta en marcha manual siguiendo las secciones anteriores. Prueba la web, `/api/health`, migraciones y persistencia. La automatización exige esa versión inicial sana para tener una release anterior a la que volver.

1. Usa `/opt/grumphya` como directorio raíz, instala Docker Compose v2 y configura dominio, secretos y `.env.production` en ese VPS. Deja el directorio raíz bajo control de root y no escribible por `grumphya-deploy`. No pongas secretos en el checkout ni en los archivos de release.
2. Crea un usuario SSH dedicado `grumphya-deploy` con contraseña bloqueada y shell `/bin/sh`; no le concedas acceso interactivo mediante SSH. No uses `nologin`, porque `sshd` necesita ejecutar el comando forzado a través del shell. No lo añadas al grupo `docker`: ese socket equivale en la práctica a acceso root. Instala el helper desde `docker/vps-deploy.sh` como root (`root:root`, modo `0755`), sin permiso de escritura para `grumphya-deploy`; por ejemplo, desde el checkout:

   ```sh
   useradd --create-home --shell /bin/sh grumphya-deploy
   passwd --lock grumphya-deploy
   chown root:root /opt/grumphya
   chmod 755 /opt/grumphya
   install -o root -g root -m 0755 /opt/grumphya/docker/vps-deploy.sh /usr/local/sbin/grumphya-deploy
   install -d -o grumphya-deploy -g grumphya-deploy -m 700 /home/grumphya-deploy/.ssh
   ```

   Configura `/etc/sudoers.d/grumphya-deploy` con `visudo -f` y limita la autorización a:

   ```sudoers
   Defaults:grumphya-deploy env_keep += "SSH_ORIGINAL_COMMAND"
   grumphya-deploy ALL=(root) NOPASSWD: /usr/local/sbin/grumphya-deploy gateway
   ```

   Genera una clave Ed25519 exclusiva para Actions y fija en `authorized_keys` esta clave con la opción `restrict` y el comando obligatorio:

   ```text
   restrict,command="sudo -n /usr/local/sbin/grumphya-deploy gateway" ssh-ed25519 <clave-publica>
   ```

   El gateway solo admite `preflight`, `deploy`, `rollback` y `status` con argumentos validados; no acepta comandos arbitrarios. La clave no permite iniciar una sesión interactiva ni usar forwarding.

3. Arranca la versión manual con Compose y registra esa release inicial:

   ```sh
   cd /opt/grumphya
   git rev-parse HEAD
   # Escribe ese SHA completo de 40 caracteres en DEPLOY_SHA de .env.production.
   docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml up -d --build --wait
   curl --fail https://<tu-dominio>/api/health
   sudo /usr/local/sbin/grumphya-deploy bootstrap <sha-inicial-de-40-caracteres>
   ```

   `bootstrap` conserva referencias a las imágenes que están funcionando y registra Compose, migraciones y SHA inicial. El SHA debe coincidir con `DEPLOY_SHA`, que quedó incluido en la API y en `build.json` de la web. Rechaza una segunda inicialización. No lo ejecutes si no se ha probado la versión manual o si ya existe `state/current`.

4. Genera una clave Ed25519 exclusiva para GitHub Actions. Instala solo la clave pública en el usuario dedicado. Obtén la clave de host SSH desde la consola de IONOS o una fuente fuera de banda y compara su huella con la que muestra el proveedor. Guarda en `known_hosts` la entrada para el mismo host/IP que usarás en `PRODUCTION_SSH_HOST` (con `[host]:puerto` si no es el puerto `22`), no el resultado sin comprobar de `ssh-keyscan`.

   Tras añadir la línea forzada a `authorized_keys`, déjala propiedad de `grumphya-deploy` y con modo `0600`. Mantén la clave privada exclusivamente en el secreto `PRODUCTION_SSH_PRIVATE_KEY` de GitHub; nunca la copies al VPS o al repositorio.

5. En **Settings → Secrets and variables → Actions**, crea estos secretos:

   | Secreto                      | Contenido                                                   |
   | ---------------------------- | ----------------------------------------------------------- |
   | `PRODUCTION_SSH_HOST`        | Host o IP pública del VPS                                   |
   | `PRODUCTION_SSH_USER`        | Usuario SSH dedicado (`grumphya-deploy`)                    |
   | `PRODUCTION_SSH_PRIVATE_KEY` | Clave privada Ed25519 exclusiva de Actions                  |
   | `PRODUCTION_SSH_KNOWN_HOSTS` | Línea `known_hosts` cuya huella contrastaste fuera de banda |

   No guardes aquí credenciales de PostgreSQL, OpenAI ni SMTP. Esos secretos permanecen exclusivamente en `.secrets/` del VPS.

6. Crea estas variables de Actions:

   | Variable                    | Valor                                                                          |
   | --------------------------- | ------------------------------------------------------------------------------ |
   | `PRODUCTION_DEPLOY_ENABLED` | `false` inicialmente; cambia a `true` solo tras completar los pasos anteriores |
   | `PRODUCTION_DOMAIN`         | Dominio público sin esquema ni ruta                                            |
   | `PRODUCTION_SSH_PORT`       | Puerto SSH; si se omite, se usa `22`                                           |

La clave de host se fija en `known_hosts` y SSH usa `StrictHostKeyChecking=yes`, desactivando además el almacén global del runner para que solo cuente la huella guardada como secreto. Si el puerto SSH no es `22`, la entrada debe usar el formato `[host]:puerto`. El workflow no acepta una identidad nueva ni ejecuta `ssh-keyscan` para confiar en el servidor durante un despliegue.

### Qué ocurre en cada push a `main`

El job `supply-chain` construye API, web estática, PostgreSQL/pgvector y Caddy con tags derivados de `github.sha`, escanea cada imagen y empaqueta esas mismas imágenes solo después de que todos los escaneos pasen. Se comparte un artefacto temporal del mismo run de Actions. El VPS carga ese paquete; no reconstruye imágenes ni descarga tags mutables. En Compose, `PROXY_IMAGE` selecciona la imagen etiquetada de ese paquete y el helper arranca las releases con `--no-build`; así la publicación utiliza la misma imagen Caddy escaneada. El arranque manual sin `PROXY_IMAGE` usa `grumphya-proxy:production` y construye el proxy desde `docker/Caddy.Dockerfile`. Se elige el artefacto de Actions para evitar configurar un registry, credenciales de publicación o facturación de almacenamiento de imágenes. El artefacto caduca en siete días y no contiene secretos.

`deploy-production` depende de ambos jobs, solo se evalúa para `push` a `main` y requiere `PRODUCTION_DEPLOY_ENABLED=true`. `pull_request`, otras ramas, fallos y variable ausente/desactivada no acceden a secretos SSH. La concurrencia no cancela un run en curso; además, el helper del VPS usa un lock para excluir ejecuciones simultáneas.

Antes de sustituir servicios, el helper comprueba la release actual, configuración y secretos existentes en el VPS, y espacio disponible para el artefacto y las nuevas imágenes. Comprueba el tamaño y SHA-256 recibido, carga las imágenes inmutables de esa revisión y valida la configuración. Compose espera a las migraciones y a los healthchecks. Los tags y directorios de la release actual/anterior se retienen; PostgreSQL, avatares y certificados usan nombres de volumen estables. El despliegue y el rollback no llaman `down -v`, `volume prune` ni hacen restauraciones destructivas.

Tras arrancar, Actions consulta la web, una ruta SPA y `/api/health` por HTTPS y comprueba que la API anuncia el mismo SHA. Si la comprobación pública falla, el workflow pide al VPS volver a Compose de la release anterior y vuelve a probar el dominio. Si el propio SSH falla durante una transferencia no se cambia la release actual; si se corta una conexión después de activarla, la verificación del workflow fuerza el rollback. La anterior se conserva en el VPS para una recuperación manual.

### Migraciones y seguridad del rollback

Una reversión de imágenes no revierte PostgreSQL. Para cada migración nueva, añade la declaración exacta `-- deployment-rollback-compatible: true` y usa el patrón expand/contract: primero añade elementos compatibles con las dos versiones; elimina o renombra datos/columnas solo en una release posterior cuando la versión antigua ya no sea objetivo de rollback. El helper bloquea migraciones eliminadas o editadas y rechaza operaciones SQL reconocidas como destructivas, además de exigir la declaración.

La declaración es una revisión explícita del desarrollador, no una prueba matemática de compatibilidad; un análisis estático no puede demostrar que el comportamiento de una migración preserve todos los usos de la versión anterior. Revisa cada diff SQL y prueba migración, healthcheck y rollback de ambas imágenes con una base desechable antes de integrar una migración. Si una migración no puede ser compatible con la release anterior, no la publiques con el despliegue automático: divide el cambio en releases expand/contract y conserva una copia externa reciente. Un fallo de migración bloquea el inicio de la nueva API; no se intenta reparar con `down -v` ni restaurar encima de los datos actuales.

### Errores y recuperación

Consulta el run de Actions para identificar qué control falló. Los fallos de tests, build o Trivy no abren SSH. Para errores del helper, revisa en el VPS `docker compose --project-name grumphya --env-file .env.production -f <release>/compose.production.yaml ps` y los logs de `migrate`, `api` y `proxy`; no compartas la salida de secretos. El helper solo informa estados, SHA y códigos de error.

Si el workflow declara rollback, confirma en el resumen que volvió a responder el SHA anterior. Si el runner perdió contacto, comprueba el estado con el comando remoto `status`; cuando exista una release anterior, solicita `rollback`. Conserva tanto la release fallida como la anterior hasta investigar el fallo. Las migraciones aditivas aplicadas permanecen en PostgreSQL, de modo que el código anterior debe tolerarlas. Para recuperación de datos usa el procedimiento de copia/restauración de abajo, solo después de parar API y proxy y comprobar la copia correspondiente; una restauración de base no forma parte del rollback de código.

### Alcance que requiere el VPS real

Se puede probar localmente el workflow, análisis, empaquetado, helper con comandos simulados, checksum, bloqueo de migraciones y rollback simulado. No se ejecutan en esta tarea los pasos a `main`, no se crea ni activa la variable, y no se conecta a ningún VPS. Solo con el servidor y dominio contratados se podrán comprobar el usuario restringido y sudoers, su huella SSH real, disco disponible, firewall/DNS, emisión HTTPS de Caddy, salud pública, latencia de restauración y rollback extremo a extremo.

Después de que la migración inicial haya terminado, aprovisiona Jappy explícitamente:

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml run --rm admin-provision
```

El comando crea la cuenta si aún no existe y no cambia la contraseña en ejecuciones repetidas. Para cambiarla de forma deliberada, actualiza únicamente `ADMIN_PASSWORD` en `admin_settings`, protege el archivo, y ejecuta `docker compose ... run --rm admin-provision --change-password`. Esta acción reemplaza el hash y revoca las sesiones activas de Jappy; el reinicio ordinario de la API no afecta a la cuenta.

### Rotar contraseñas de PostgreSQL

La contraseña de `postgres_admin_settings` sirve solo para el usuario bootstrap `postgres`; `GRUMPHYA_DB_PASSWORD` es la del rol de runtime `PGUSER`. Cambiar un archivo no cambia el rol de un volumen PostgreSQL existente. Haz una copia antes, abre una sesión local de `psql` como bootstrap y usa el comando interactivo `\password` para evitar escribir la contraseña en el historial:

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml exec -it db psql -U postgres
```

En `psql`, ejecuta `\password postgres` para rotar la contraseña bootstrap, o `\password <PGUSER>` con el nombre configurado en `database_settings` para rotar el rol de runtime. Actualiza solo el archivo correspondiente y recrea los servicios que consumen ese secreto; `db` para la contraseña bootstrap, `api`, `migrate` y `admin-provision` para la contraseña runtime. Conserva los demás archivos y volúmenes.

## Actualizar manualmente y migrar (si el CI está desactivado)

Conserva `.secrets`, `.env.production` y los volúmenes. Actualiza el código a una revisión elegida y ejecuta:

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml up -d --build
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml ps
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml logs --tail=100 migrate api
```

El servicio `migrate` termina antes de que se atienda tráfico nuevo. Las migraciones actuales se aplican en una transacción y registran cada versión; una falla revierte el lote y bloquea el arranque de la API. No marques manualmente una migración como aplicada. Corrige el código o restaura una copia compatible, y vuelve a arrancar. Si la base tiene un estado parcial que no puede recuperarse hacia delante, detén los servicios y restaura PostgreSQL y avatares desde una misma ventana de copia.

No uses `docker compose down -v` en producción, ni como actualización ni como solución de errores: elimina los volúmenes de PostgreSQL y avatares. `docker compose down` sin `-v` conserva los volúmenes, aunque para actualizar basta con `up -d --build`.

## Copias y restauración

Guarda copias cifradas fuera del VPS y prueba la restauración periódicamente. Crea un directorio privado de respaldo fuera del repositorio. Detén primero el proxy y la API para que la base y el volumen de avatares correspondan al mismo momento. El helper de PostgreSQL lee los nombres de base y usuario desde el secreto montado; las tuberías cifran los datos directamente sin crear dumps SQL ni tar en claro:

```sh
umask 077
backup_date=$(date +%F)
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml stop proxy api
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml exec -T db /usr/local/bin/grumphya-postgres-backup.sh dump | gpg --symmetric --cipher-algo AES256 --output /ruta/segura/grumphya-"$backup_date".sql.gpg
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml run --rm --entrypoint tar api -czf - -C /workspace/var/avatars . | gpg --symmetric --cipher-algo AES256 --output /ruta/segura/avatars-"$backup_date".tar.gz.gpg
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml start api proxy
```

GPG pide una frase de cifrado de forma interactiva; guárdala aparte de las copias. Comprueba que ambos archivos `.gpg` existen y se pueden descifrar antes de copiar solo esos archivos cifrados fuera del VPS.

Conserva cada copia externa solo mientras sea necesaria para prestar el servicio y recuperar datos ante incidencias. Cuando ya no sea necesaria para ese fin ni exista una obligación de conservación, elimina los archivos cifrados y sus copias. La rotación no está automatizada en este procedimiento: el operador debe revisar y retirar periódicamente las copias antiguas. Si restauras una copia que contiene datos ya vencidos o eliminados, el servicio de retención de la API los purgará en la siguiente ejecución; deja que termine y comprueba el estado antes de reabrir tráfico.

Para restaurar, detén API y proxy, confirma que tienes copias verificadas y recrea la base vacía antes de cargar el dump. Estos comandos eliminan los datos actuales de esa base; úsalos solo como parte de una restauración deliberada. No mezcles un dump antiguo con avatares de una fecha distinta:

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml stop proxy api
gpg --decrypt /ruta/segura/grumphya-fecha.sql.gpg | docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml exec -T db /usr/local/bin/grumphya-postgres-backup.sh restore
gpg --decrypt /ruta/segura/avatars-fecha.tar.gz.gpg | docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml run --rm --entrypoint tar api -xzf - -C /workspace/var/avatars
```

Si usas el despliegue automático, vuelve a arrancar la release activa para conservar exactamente sus imágenes: `sha=$(/usr/local/sbin/grumphya-deploy status)` y después `docker compose --project-name grumphya --env-file .env.production --env-file "/opt/grumphya/releases/$sha/release.env" -f "/opt/grumphya/releases/$sha/compose.production.yaml" up -d --no-build --wait`. En una instalación manual con CI desactivado, el `up -d` del bloque anterior es suficiente.

Para una restauración real sobre una base existente, crea una base limpia y restaura ahí, o sigue el procedimiento validado de `pg_restore`/`psql` para evitar duplicar objetos. Mantén una copia de la base y del archivo de avatares anterior hasta verificar `/api/health`, el acceso a cuentas y la lectura de avatares. El volumen Docker no sustituye a una copia externa.

## Límites operativos

- La compra de planes sigue simulada. Esta entrega no envía pagos.
- Una sola instancia mantiene el alcance de esta caja; los límites por IP no se distribuyen entre réplicas.
- Los logs no deben contener contraseñas, tokens ni texto de ideas. No uses `docker compose config` sin `--quiet` en terminales compartidas, aunque el Compose solo referencia rutas de secretos.
- La verificación de DNS, emisión del certificado, reglas del firewall, copia fuera del VPS, restauración y comportamiento del hardware quedan pendientes hasta disponer del dominio y servidor reales.
