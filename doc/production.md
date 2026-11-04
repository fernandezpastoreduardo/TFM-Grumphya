# Producción en un único VPS

Esta guía describe cómo operar Grumphya en un único VPS IONOS M+ con Docker Compose y cómo habilitar un despliegue manual desde GitHub Actions, protegido por una confirmación explícita de la cuenta autorizada. Leerla o seguir sus pasos de preparación no autoriza ni inicia un despliegue por sí solo: la publicación requiere la confirmación y las condiciones indicadas en la sección correspondiente. Antes de arrancar, asigna un dominio al VPS y permite tráfico entrante TCP 80/443 y UDP 443 en el firewall de IONOS y del sistema. Caddy obtiene y renueva automáticamente el certificado cuando el DNS público apunta al servidor.

## Topología

- Caddy es el único servicio publicado: HTTP 80 redirige a HTTPS y HTTPS 443 sirve el sitio, `/api/*` y las rutas de la SPA.
- La web React se compila en la imagen y Nginx sirve los archivos estáticos; Vite no se ejecuta en producción.
- La API NestJS solo está en la red privada de Compose, junto con PostgreSQL 17 (`pgvector/pgvector:0.8.7-pg17`).
- PostgreSQL y los avatares usan volúmenes nombrados persistentes. Caddy conserva también sus certificados.
- Un servicio de una sola ejecución aplica las migraciones y la API espera a que termine correctamente y a que PostgreSQL esté saludable.
- PostgreSQL solo pertenece a la red interna. La API también se conecta a una red privada de salida para poder llamar a OpenAI y SMTP; no publica ningún puerto del host.
- PostgreSQL mantiene separado el usuario bootstrap `postgres`, cuya contraseña está en `postgres_admin_settings` y solo se monta en `db`, del usuario de runtime configurado en `database_settings`. La inicialización crea el usuario de runtime como propietario de la base, sin privilegios de superusuario; API, migrador y aprovisionador Jappy usan solo este rol limitado. La contraseña bootstrap no se entrega a la API.
- Los archivos de secretos permanecen `root:root` con modo `0600` en el VPS. Los entrypoints de API y migraciones los leen al arrancar como root y bajan inmediatamente al usuario `node` antes de ejecutar la aplicación. El entrypoint de PostgreSQL lee los secretos antes de ceder el proceso a `postgres`; el script inicial recibe solo los datos que necesita. No amplíes los permisos de los archivos para resolver errores de lectura.

Nginx publica la web desde `docker/nginx-spa.conf`: `/` sirve el HTML de la SPA
mediante `try_files /index.html =404;` y envía una precarga de la ilustración
principal de Home solo a viewports de al menos 768 px. El telón compartido se
precarga con prioridad alta solo en Home, mediante el HTML prerenderizado de esa
ruta; el público decorativo y el telón de las demás rutas se descubren desde sus
hojas de estilo, sin precarga global. `/index.html` usa `Cache-Control: no-cache`; los
bundles JavaScript y CSS con nombre versionado
por hash usan `public, max-age=31536000, immutable`; el resto de `/assets/`
usa `public, max-age=2592000`. Los archivos inexistentes de `/assets/` devuelven
404 en vez de la página SPA. `/robots.txt` se sirve como archivo estático.
El directorio raíz `prototype/` se copia desde la etapa `web-build` a
`/usr/share/nginx/html/desarrollo-seguro/` en la imagen `web-production`.
Nginx redirige `/desarrollo-seguro` con una cabecera `Location` relativa a la
URL canónica con barra final (`/desarrollo-seguro/`), sin filtrar el esquema,
host o puerto interno del contenedor, y sirve allí explícitamente su
`index.html` estático;
los recursos bajo esa ruta se sirven como archivos exactos y los inexistentes
devuelven 404, sin caer en el HTML de la SPA. La página y sus recursos usan
`Cache-Control: no-cache`. Caddy aplica también las cabeceras de seguridad
globales, incluida la CSP aplicada y la CSP en modo `Report-Only`. No requiere
un proceso ni una API propios. La URL es pública aunque el único enlace interno
de Grumphya a ella sea el sello del footer. La ficha
`/acreditaciones/DS-GRUMPHYA-2026-001` continúa siendo una ruta de la SPA y
consulta el endpoint de acreditaciones de la API.
El healthcheck del servicio web solicita `/` por HTTPS directamente a Nginx,
valida la CA interna y el nombre `web`, y comprueba así la portada además de
que el proceso responda. Permite 30 segundos de arranque inicial antes de
contar fallos, para tolerar la carga fría del contenedor. El healthcheck de API
y la verificación de bootstrap del helper consultan también la API por HTTPS en
`127.0.0.1`, cuya dirección IP está incluida en su SAN y cuya CA se carga en
Node. El smoke de CI comprueba además `/` a través de Caddy y las rutas SPA por
el recorrido público local.

La red interna confía en el proxy Caddy por su dirección privada fija. Express usa `TRUST_PROXY=172.31.0.254/32`, la IP de Caddy en la red `backend`; Caddy determina la dirección remota del socket y la API no está expuesta a Internet. Si cambias las subredes o la IP de Caddy en Compose, actualiza esta allowlist. No configures `trust proxy=true` ni confíes en cabeceras reenviadas desde clientes.

## Transporte y límites del cifrado

Caddy termina HTTPS para el navegador y enruta `/api/*` al mismo origen seguro. Obtiene y renueva el certificado público automáticamente, redirige HTTP a HTTPS y limita TLS explícitamente a las versiones 1.2 y 1.3. La respuesta HTTPS incluye HSTS (`max-age=31536000; includeSubDomains`). Para verificar el borde desplegado, comprueba el certificado y las cabeceras en `https://<dominio>` y que `http://<dominio>` redirija a HTTPS; no uses esas comprobaciones como prueba de los tramos internos.

Compose cifra los tramos entre servicios y el cliente valida la identidad del servidor: Caddy usa HTTPS y valida la cadena de la CA interna y el nombre DNS de Nest (`api:3000`) y Nginx (`web:8443`); Nest usa TLS `verify-full` con esa CA hacia PostgreSQL (`db:5432`). Nginx y PostgreSQL tienen TLS 1.2 como versión mínima explícita. No se configura TLS mutuo ni certificados de cliente: TLS cifra la conexión y autentica el servidor frente al cliente, pero no sustituye el aislamiento de red ni la autenticación de la aplicación. PostgreSQL carga un certificado y una clave propios; su `pg_hba.conf` rechaza todas las conexiones TCP sin TLS y exige SCRAM al rol de runtime. La regla `local ... trust` solo permite conexiones por socket Unix dentro del contenedor para el bootstrap local de PostgreSQL; no abre acceso TCP. Los puertos internos siguen sin publicarse en el host. No se desactiva la validación de cadena ni nombre.

La CA privada y las claves de servicio no se incluyen en las imágenes ni en Git. Para preparar el primer despliegue, ejecuta `bash scripts/generate-internal-tls.sh /ruta/segura/grumphya-internal-tls` en una máquina administrativa confiable con OpenSSL y un directorio de salida nuevo y vacío. El script crea una CA y tres certificados de servidor con SAN `api`, `web` y `db`; los certificados de API y web incluyen además `127.0.0.1` para sus sondas locales. No sobrescribe material existente. Copia a `.secrets/` del VPS `internal_tls_ca.crt`, `api_tls.crt`, `api_tls.key`, `web_tls.crt`, `web_tls.key`, `postgres_tls.crt` y `postgres_tls.key`; conserva `internal_tls_ca.key` fuera del VPS y con una copia offline protegida. Después aplica los permisos de `.secrets/` descritos abajo y arranca Compose. La CA raíz dura diez años y los certificados de servicio 397 días.

Antes de que caduque el certificado de servicio más próximo, rota el conjunto completo en la máquina administrativa. El script actual siempre genera una CA nueva junto con los tres certificados; no ofrece renovación de certificados hoja bajo la CA existente. Usa un directorio de salida nuevo y vacío, y reemplaza juntos en `.secrets/` la CA y los tres pares de certificado/clave. No reemplaces certificados individualmente: todos los servicios deben confiar en la misma CA activa. Copiar el conjunto y ejecutar `docker compose ... up -d --force-recreate --wait` con los mismos argumentos de proyecto, archivo y entorno recrea los servicios activos y puede causar una interrupción breve. Verifica periódicamente las fechas de expiración con `openssl x509 -in .secrets/api_tls.crt -noout -enddate` (repite para `web_tls.crt` y `postgres_tls.crt`). Tras rotar, comprueba que todos los servicios estén saludables, que `/api/health` responda por HTTPS y que los certificados nuevos tengan margen antes de caducar; no hay alerta ni renovación automática para los certificados internos. El smoke de Compose de CI genera certificados efímeros y prueba la configuración sin depender de los secretos reales.

La aplicación usa `Authorization: Bearer` para el access token y cookies de refresh `HttpOnly`, `Secure` y `SameSite=Strict` en producción. Los tokens de verificación y recuperación se entregan en el fragmento de la URL, que el navegador no envía en la petición HTTP, y se remiten a la API en el cuerpo de solicitudes POST; las credenciales de login también se envían en POST. No añadas secretos, tokens ni datos personales a rutas o parámetros de consulta. La API evita incluir ideas, credenciales o mensajes de excepción sensibles en logs.

El cifrado de transporte protege cada conexión de red, pero no es cifrado de extremo a extremo: Caddy termina el TLS público y la API procesa los datos en claro. Quien controle el host Docker, los procesos de los servicios o sus claves puede acceder al contenido. El cifrado en reposo de PostgreSQL y sus copias de seguridad requiere controles separados. Caddy confía en la IP fija del proxy a través de la allowlist `TRUST_PROXY`, no en todos los proxies.

Caddy publica `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp`; los recursos de la app se sirven desde el mismo origen. La CSP aplicada en modo de bloqueo es deliberadamente limitada a `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'` y `form-action 'self'`. La política completa se entrega inicialmente como `Content-Security-Policy-Report-Only`, para observar `default-src`, scripts, estilos, imágenes, fuentes y conexiones antes de bloquearlos. Los informes se reciben en `/api/csp-reports` y se escriben en los logs de API como `csp_violation`; el receptor descarta consultas, fragmentos y cargas de datos antes de registrarlos. Revisa periódicamente los informes con `docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml logs --since=24h api | grep csp_violation`. Mantén Report-Only durante al menos siete días consecutivos y hasta observar un ciclo representativo que cubra inicio de sesión, perfil y avatar, dictado, evaluación, rankings y móvil/escritorio. Registra el intervalo revisado, la versión desplegada, los destinos legítimos detectados y la decisión de cada tipo de infracción. Corrige cualquier recurso legítimo bloqueado. La salida es **no-go** mientras haya informes sin clasificar o una infracción legítima que vaya a bloquearse; es **go** cuando todos los destinos observados estén clasificados, los recursos necesarios estén permitidos explícitamente y el responsable de la revisión haya aprobado el resumen. Solo entonces amplía la política `Content-Security-Policy` de `docker/Caddyfile` para aplicar las directivas observadas, conserva temporalmente `Report-Only` para detectar regresiones y despliega de nuevo. No bloquees las directivas de recursos hasta completar y registrar esta revisión de tráfico real.

La API, las migraciones y el aprovisionamiento usan exclusivamente `PGSSL_MODE=verify-full` en producción. El pool exige la ruta a la CA y falla al arrancar si no puede leerla; no existe una excepción de TLS desactivado para PostgreSQL interno. Esta configuración Compose fija PostgreSQL en `db` y monta su CA interna. Un despliegue con una base externa queda fuera de esta topología; cada proceso que se conecte a ella debe configurar su entrypoint para que `PGSSL_CA_FILE` apunte a una CA legible que valide el certificado y nombre de `PGHOST`.

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

2. Genera los certificados internos en una máquina administrativa confiable como se indica en [Transporte y límites del cifrado](#transporte-y-límites-del-cifrado), y copia los siete archivos requeridos a `.secrets/` del VPS. No copies allí `internal_tls_ca.key`.
3. Deja los archivos bajo control de `root` y con permisos privados: `chown -R root:root .secrets .env.production && chmod 700 .secrets && chmod 600 .secrets/* .env.production`. Ejecuta Compose como `root` en este VPS; el helper comprueba el propietario y los permisos antes de actualizar.
4. Rellena los archivos en el VPS con secretos nuevos y únicos. No los copies al repositorio ni a la imagen. No los pongas en comandos, historial de shell, argumentos de construcción, `VITE_*` ni registros.
5. En `postgres_admin_settings`, define una contraseña aleatoria y única para el usuario bootstrap `postgres`. En `database_settings`, define el nombre de la base, el usuario runtime dedicado y otra contraseña larga aleatoria. El usuario runtime no es superusuario. En `grumphya_env`, define `ACCESS_TOKEN_SECRET` y `ANONYMOUS_IP_HMAC_SECRET` con al menos 32 bytes aleatorios cada uno. No reutilices valores entre campos o entornos.
6. Completa `openai_key` con la clave del servidor y `openai_settings` con el proveedor/modelo elegido. Completa `mail_settings` con las credenciales SMTP. Son credenciales independientes; la API exige estos cinco archivos: `grumphya_env`, `database_settings`, `openai_settings`, `openai_key` y `mail_settings`. `postgres_admin_settings` se reserva al contenedor de PostgreSQL.
7. `admin_settings` solo se monta en el comando explícito de aprovisionamiento de Jappy. No se carga al iniciar la API. Guarda ahí una contraseña inicial que cumpla 12–128 caracteres e incluya mayúscula, minúscula, número y símbolo.
8. En `.env.production`, configura `DOMAIN` como nombre DNS sin esquema ni ruta. `WEB_ORIGIN` puede quedar vacío para usar `https://$DOMAIN`, o contener el origen HTTPS exacto. `DEPLOY_SHA` puede quedar vacío para una instalación manual; antes del bootstrap de CI escribe ahí el SHA completo (40 caracteres) de la versión inicial que acabas de probar.

Los `.example` son plantillas vacías versionadas. Los archivos reales bajo `.secrets/` y `.env.production` están ignorados por Git. Verifica DNS antes de arrancar: el registro A (y AAAA si existe) debe apuntar al VPS; un AAAA incorrecto puede impedir el desafío ACME.

## Arrancar y comprobar

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml config --quiet
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml up -d --build --wait
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml ps
```

Este arranque manual construye la web estática, la API, PostgreSQL/pgvector y el proxy desde sus Dockerfiles; Caddy usa `docker/Caddy.Dockerfile`, que recompila la versión fijada con parches de Go y actualiza los paquetes Alpine de la imagen final. Espera a PostgreSQL, ejecuta las migraciones y solo entonces inicia la API. Si la migración falla, la API permanece detenida y Compose informa que su dependencia no completó. Revisa el estado con:

```sh
docker compose --project-name grumphya --env-file .env.production -f compose.production.yaml logs --tail=100 db migrate api proxy
curl --fail https://<tu-dominio>/api/health
curl --fail https://<tu-dominio>/
curl --fail https://<tu-dominio>/una-ruta-interna-de-la-spa
```

La respuesta de salud confirma PostgreSQL y pgvector. Comprueba también en el navegador que la página y `/api/*` usan HTTPS y que el HTML recibe `Permissions-Policy: camera=(), microphone=(self), geolocation=(), on-device-speech-recognition=(self)`. La disponibilidad del dictado depende además del navegador del usuario.

## Despliegue manual desde GitHub (opcional)

Los pull requests ejecutan las pruebas, construcción y escaneos, pero nunca reciben credenciales SSH ni despliegan. Un push a `main` no inicia el workflow. Para publicar, la cuenta `fernandezpastoreduardo` debe abrir Actions, seleccionar el workflow `CI`, elegir la rama `main` y marcar `approve_production_deploy` antes de pulsar “Run workflow”. El workflow también verifica que quien reejecuta el run sea esa misma cuenta. La publicación requiere que pasen las comprobaciones y que `PRODUCTION_DEPLOY_ENABLED` valga exactamente `true`.

La recuperación real del acceso SSH y del helper v2, incluida la vía live Grml y las comprobaciones posteriores, quedó registrada en [la incidencia del 28 de octubre de 2026](incident-vps-access-and-deployment-2026-10.md). Ese registro no sustituye la comprobación del resultado de cada ejecución de Actions ni la verificación de salud tras publicar.

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

   El gateway solo admite `preflight`, `deploy`, `rollback`, `status` y `helper-version` con argumentos validados; no acepta comandos arbitrarios. La clave no permite iniciar una sesión interactiva ni usar forwarding.

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

### Cómo aprobar un despliegue de `main`

Al iniciar manualmente el workflow desde `main` con la confirmación marcada, `quality-and-e2e`, `e2e` y `dependency-audit` corren en paralelo. `supply-chain` solo comienza si los tres pasan. Compose construye API, web estática, PostgreSQL/pgvector y Caddy en paralelo con tags derivados de `github.sha`, y Trivy escanea cada imagen. El job empaqueta esas mismas imágenes y las envía al VPS; no reconstruye ni descarga tags mutables. En Compose, `PROXY_IMAGE` selecciona la imagen Caddy escaneada y el helper arranca la release con `--no-build`. El arranque manual sin `PROXY_IMAGE` usa `grumphya-proxy:production` y construye el proxy desde `docker/Caddy.Dockerfile`. El archivo de Actions anterior se generaba solo después de desplegar y validar la versión nueva, así que los fallos previos de CI ya dejaban cero artefactos de release. Se elimina ese archivo igualmente: el VPS conserva las dos releases necesarias para operar y hacer rollback, mientras que las copias de Actions ocupaban cuota redundante y podían convertir una publicación sana en un run fallido.

Si el último job de Actions falla durante las comprobaciones públicas, comprueba `https://<tu-dominio>/api/health` y `https://<tu-dominio>/build.json`. Si ambos anuncian el SHA del run y la salud indica `status: ok`, la publicación está activa; el helper restaura automáticamente la versión anterior cuando falla el healthcheck local del VPS. Actions ya no sube bundles, por lo que un problema de cuota de artefactos no puede fallar después de una publicación sana.

La etapa de despliegue está dentro de `supply-chain` y solo se ejecuta en un `workflow_dispatch` autorizado desde `main`, con la confirmación manual marcada y `PRODUCTION_DEPLOY_ENABLED=true`. `supply-chain` depende de `quality-and-e2e`, `e2e` y `dependency-audit`, por lo que espera a la calidad, las pruebas de navegador y las auditorías. Los pull requests, otras ramas, fallos y variable ausente/desactivada no acceden a secretos SSH. El job final `deploy-production` solo confirma que el flujo integrado terminó con éxito. La concurrencia no cancela un run en curso; además, el helper del VPS usa un lock para excluir ejecuciones simultáneas.

Antes de sustituir servicios, el helper comprueba la release actual, configuración, espacio disponible y todos los secretos requeridos, incluidos los siete archivos TLS (`internal_tls_ca.crt` y los pares de certificado/clave de API, web y PostgreSQL). Exige que `.secrets/` y sus archivos sean propiedad de root, que el directorio y los archivos no den permisos a grupo u otros, y que los secretos requeridos sean archivos regulares, legibles y no enlaces simbólicos; aplica controles equivalentes a `.env.production`. También rechaza que `internal_tls_ca.key` esté presente en `.secrets/`, incluso si es un enlace simbólico, para mantener la clave privada de la CA fuera del VPS. El helper comprueba el tamaño y SHA-256 recibido, carga las imágenes inmutables de esa revisión y valida la configuración. Compose espera a las migraciones y a los healthchecks. Durante el bootstrap inicial, el helper consulta la API local por HTTPS en `127.0.0.1` con la CA interna y comprueba que la revisión servida coincide con el SHA previsto. Si `up --wait` falla porque un servicio todavía no está saludable (por ejemplo, un fallo temporal del healthcheck de la web), el helper restaura la release anterior y espera sus healthchecks antes de devolver un error; Actions comprueba entonces que vuelve a responder la revisión anterior. Si también falla la restauración, el helper lo informa y requiere inspección manual. Los tags y directorios de la release actual/anterior se retienen; PostgreSQL, avatares y certificados usan nombres de volumen estables. El despliegue y el rollback no llaman `down -v`, `volume prune` ni hacen restauraciones destructivas.

Tras arrancar, Actions consulta la web, una ruta SPA y `/api/health` por HTTPS y comprueba que la API anuncia el mismo SHA. Si la comprobación pública falla, el workflow pide al VPS volver a Compose de la release anterior y vuelve a probar el dominio. Si el propio SSH falla durante una transferencia no se cambia la release actual; si se corta una conexión después de activarla, la verificación del workflow fuerza el rollback. La anterior se conserva en el VPS para una recuperación manual.

Antes de confirmar la release, el helper ejecuta además un smoke de proveedores
de IA dentro de la API nueva: evalúa una propuesta sintética deliberadamente
incompleta y genera una respuesta de roast usando la configuración y credenciales
reales del VPS. La evaluación se reintenta una sola vez, con una pausa de
1 segundo, únicamente si falla con el
diagnóstico `visible_message`; otros errores no se reintentan. Cada llamada a
`evaluate` puede hacer también su propio reintento semántico, por lo que el
smoke puede generar hasta cuatro completions de evaluación en total y una de
roast. Si el smoke sigue fallando, el helper restaura la release anterior y no
confirma la candidata. Estas llamadas pueden generar coste en el proveedor.
Este smoke real del despliegue es distinto del smoke integrado local de Compose,
que usa secretos ficticios y no llama a OpenAI ni envía correo.

### Migraciones y seguridad del rollback

Una reversión de imágenes no revierte PostgreSQL. Para cada migración nueva, crea el archivo `apps/api/migrations/*.sql`, regístralo también en `apps/api/src/infrastructure/database/run-migrations.ts` y añade la declaración exacta `-- deployment-rollback-compatible: true`. Desde la migración numerada `029_` inclusive, el preflight estático de CI verifica que todas las migraciones numeradas empiecen con esa declaración; se ejecuta justo después del checkout y antes de configurar pnpm o instalar dependencias. `pnpm migrations:check` compara ambos inventarios y forma parte de `pnpm quality:check`; si el archivo SQL queda fuera del registro, las pruebas de PostgreSQL crearían esquemas sin el cambio de estructura requerido por el código. Usa el patrón expand/contract: primero añade elementos compatibles con las dos versiones; elimina o renombra datos/columnas solo en una release posterior cuando la versión antigua ya no sea objetivo de rollback. El helper bloquea migraciones eliminadas o editadas y rechaza operaciones SQL reconocidas como destructivas, además de exigir la declaración.

La declaración es una revisión explícita del desarrollador, no una prueba matemática de compatibilidad; un análisis estático no puede demostrar que el comportamiento de una migración preserve todos los usos de la versión anterior. Revisa cada diff SQL y prueba migración, healthcheck y rollback de ambas imágenes con una base desechable antes de integrar una migración. Si una migración no puede ser compatible con la release anterior, no la publiques con el despliegue de producción: divide el cambio en releases expand/contract y conserva una copia externa reciente. Un fallo de migración bloquea el inicio de la nueva API; no se intenta reparar con `down -v` ni restaurar encima de los datos actuales.

La migración `034_illuminado_price_retroactive.sql` es una excepción de datos deliberada: fija `plans.monthly_price_eur` de Iluminado en 3 € y reexpresa a 3 € todos los `simulated_purchases` asociados a suscripciones Iluminado, incluidos los importes históricos que alimentan los KPI. No modifica el estado ni las fechas de las suscripciones. Un rollback de código o de imágenes no revierte esos valores de PostgreSQL; además, la API anterior seguirá leyendo el precio de 3 € para compras nuevas aunque su UI antigua aún muestre 2 €. Si se vuelve a desplegar una release anterior, hay que mantener el copy del precio en 3 € con un cambio compatible antes de atender tráfico. Solo si se decide volver deliberadamente al precio de 2 €, prepara y revisa una migración correctiva explícita que actualice tanto `plans.monthly_price_eur` como los `amount_eur` históricos de las compras Iluminado; no intentes revertirlo restaurando la migración ni con un rollback de código.

#### Actualizar y recuperar el helper persistente del VPS

`/usr/local/sbin/grumphya-deploy` es root-owned. Desde la versión 2, el preflight comprueba su versión antes de transferir el bundle y cada despliegue validado instala atómicamente el helper incluido en esa misma release, antes de arrancar sus servicios. Así el helper se mantiene alineado con el código revisado en los despliegues normales. El usuario `grumphya-deploy` sigue sin shell interactiva y no puede instalar código root por su cuenta.

Si Actions informa que el helper está desactualizado o no puede consultarlo, ese es un bloqueo de recuperación del host: hace falta acceso administrativo root por SSH o por la consola remota del proveedor para instalar la versión revisada una vez. No vuelvas a transferir el bundle ni cambies la migración para esquivar el detector. Desde un checkout confiable que esté en el commit revisado deseado, ejecuta como root:

```sh
cd /opt/grumphya
git fetch origin main
git checkout --detach <commit-revisado>
bash -n docker/vps-deploy.sh
grep -q 'is_approved_illuminado_repricing_migration' docker/vps-deploy.sh
install -o root -g root -m 0755 docker/vps-deploy.sh /usr/local/sbin/grumphya-deploy
/usr/local/sbin/grumphya-deploy helper-version
```

El último comando debe mostrar `2` antes de reintentar Actions. Las excepciones a la detección de SQL destructivo son específicas y comparan nombre, marcador y SQL normalizado exacto: `034_illuminado_price_retroactive.sql` permite solo las dos actualizaciones de precio previstas; `036_redact_application_error_context.sql` permite poner a `NULL` únicamente los contextos históricos de errores. La release anterior trata un contexto `NULL` como ausente, así que el rollback de aplicación sigue siendo compatible mientras se purgan esos datos sensibles. Las pruebas del helper rechazan cualquier SQL destructivo adicional dentro de estas migraciones. No relajes el detector general. Una vez recuperada la versión 2, las siguientes releases actualizan el helper dentro del flujo normal.

### Errores y recuperación

Consulta el run de Actions para identificar qué control falló. Los fallos de tests, build o Trivy no abren SSH. Para errores del helper, revisa en el VPS `docker compose --project-name grumphya --env-file .env.production -f <release>/compose.production.yaml ps` y los logs de `migrate`, `api`, `web` y `proxy`; inspecciona también el estado y las últimas comprobaciones de salud del contenedor que falló con `docker inspect <id-del-contenedor>`. No compartas la salida de secretos. El helper solo informa estados, SHA y códigos de error.

Si el helper informa `new release failed; automatic rollback completed`, la activación no se confirmó y la release anterior se restauró automáticamente. En esa ruta, el helper puede eliminar la candidata fallida al limpiar releases antiguas; conserva el run y los logs del VPS para investigar. Si el run informa un fallo de verificación pública después de que el helper activara la nueva release, Actions solicita el rollback y comprueba la revisión anterior; la release fallida queda como anterior para permitir otro rollback. En ambos casos, confirma en el run que el dominio vuelve a responder con el SHA previo. Si informa que falló también el rollback, o el runner perdió contacto, inspecciona `status`, `ps` y los logs antes de reintentar; si la anterior sigue disponible, solicita `rollback` mediante el gateway. Las migraciones aditivas aplicadas permanecen en PostgreSQL, de modo que el código anterior debe tolerarlas. Para recuperación de datos usa el procedimiento de copia/restauración de abajo, solo después de parar API y proxy y comprobar la copia correspondiente; una restauración de base no forma parte del rollback de código.

### Alcance que requiere el VPS real

CI también ejecuta un smoke integrado de Compose con las cuatro imágenes exactas ya escaneadas, secretos y datos ficticios, HTTPS local con certificado interno, y volúmenes desechables etiquetados que elimina al terminar. Si falla, el smoke imprime el estado de Compose, el estado de salud de `web` y sus últimos 100 registros para facilitar el diagnóstico. Puede repetirse en local con Docker, como se explica en [ci-cd.md](ci-cd.md); no llama a OpenAI ni envía correo. Esto comprueba la topología y persistencia del Compose, pero no equivale a publicar ni hacer rollback en un VPS. El 28 de octubre de 2026 se recuperó el acceso root por SSH y se verificó el helper v2 en el VPS real; esa recuperación no demuestra por sí sola que una release posterior se haya publicado. Para cada despliegue hay que comprobar el resultado de Actions, el SHA activo, la salud pública y, si procede, el comportamiento de rollback.

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

Si usas el despliegue desde GitHub, vuelve a arrancar la release activa para conservar exactamente sus imágenes: `sha=$(/usr/local/sbin/grumphya-deploy status)` y después `docker compose --project-name grumphya --env-file .env.production --env-file "/opt/grumphya/releases/$sha/release.env" -f "/opt/grumphya/releases/$sha/compose.production.yaml" up -d --no-build --wait`. En una instalación manual con CI desactivado, el `up -d` del bloque anterior es suficiente.

Para una restauración real sobre una base existente, crea una base limpia y restaura ahí, o sigue el procedimiento validado de `pg_restore`/`psql` para evitar duplicar objetos. Mantén una copia de la base y del archivo de avatares anterior hasta verificar `/api/health`, el acceso a cuentas y la lectura de avatares. El volumen Docker no sustituye a una copia externa.

## Límites operativos

- La compra de planes sigue simulada. Esta entrega no envía pagos.
- Una sola instancia mantiene el alcance de esta caja; los límites por IP no se distribuyen entre réplicas.
- Los logs no deben contener contraseñas, tokens ni texto de ideas. No uses `docker compose config` sin `--quiet` en terminales compartidas, aunque el Compose solo referencia rutas de secretos.
- La verificación de DNS, emisión del certificado, reglas del firewall, copia fuera del VPS, restauración y comportamiento del hardware quedan pendientes hasta disponer del dominio y servidor reales.
