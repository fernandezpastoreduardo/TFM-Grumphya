# Preparación para producción

No se ha elegido proveedor cloud ni se han creado cuentas, dominios o recursos de producción. Esta guía es el objetivo operativo, no una afirmación de que el despliegue exista.

## Topología recomendada

1. Compilar `apps/web` como sitio estático y servirlo por HTTPS desde CDN/hosting estático.
2. Ejecutar `apps/api` como servicio Node.js detrás de un reverse proxy HTTPS, con réplicas sin estado.
3. Usar PostgreSQL 17 gestionado con pgvector 0.8.x, TLS obligatorio, copias de seguridad cifradas y recuperación probada.
4. Mantener secretos en el secret manager del proveedor. No hornear secretos en imágenes, variables `VITE_*`, artefactos web o Git.
5. Aplicar migraciones como paso controlado de release con identidad de migración distinta de la cuenta de runtime. Esto es el objetivo de despliegue, aún no el comportamiento actual del repositorio.

La primera entrega no requiere Redis, Kubernetes, almacenamiento de archivos ni pagos reales. Añádelos solo con una necesidad funcional/operativa concreta.

## Build y ejecución

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- Artefactos web: `apps/web/dist/`.
- API compilada: `apps/api/dist/main.js`.
- Comando runtime API: `pnpm --filter @grumphya/api start`.
- Fija la imagen/runtime de Node en una versión LTS soportada y parcheada; no despliegues dependencias de desarrollo.
- Configura proxy para reenviar `/api/*` al servicio y servir rutas SPA; solo expón HTTPS en Internet.
- El host que sirve el HTML de la web debe enviar `Permissions-Policy: camera=(), microphone=(self), geolocation=(), on-device-speech-recognition=(self)` para permitir el dictado local desde el origen propio. El middleware de la API aplica esa cabecera a las respuestas de API, pero no configura las respuestas HTML del CDN/hosting estático. Verifica la cabecera en producción junto con la disponibilidad de reconocimiento local del navegador; la aplicación no debe habilitar reconocimiento remoto como alternativa.

## Estado actual de migraciones

La API ejecuta las migraciones pendientes de forma diferida cuando algunos
repositorios se inicializan por primera vez; `PostgresPlanUsageRepository`, por
ejemplo, llama a `runMigrations` desde `ensureSchema` al reservar o consultar
uso de plan. En ese flujo se usan las credenciales de PostgreSQL del runtime.
Las migraciones hasta `018_user_rejected_ideas.sql` forman parte del runner de
la API. La `018` crea el historial privado de ideas rechazadas por usuario.
Todavía no hay un paso de release separado que aplique las migraciones con la
identidad `grumphya_migrator`. Antes de desplegar con tráfico real, definir y
probar la estrategia de migración explícita, revisar los permisos necesarios y
evitar que el primer request de usuario tenga que ejecutar DDL.

## Variables requeridas para API

Configura como secretos/variables del servicio, nunca dentro del bundle web:

```text
NODE_ENV=production
API_PORT=3000
API_HOST=0.0.0.0
WEB_ORIGIN=https://<dominio-web>
PGHOST=<hostname-privado-postgres>
PGPORT=5432
PGDATABASE=<base-produccion>
PGUSER=<usuario-runtime-no-superusuario>
PGPASSWORD=<secreto-inyectado-por-secret-manager>
```

En producción la API escucha en la interfaz privada del contenedor/servicio; no la publiques directamente a Internet. Exige TLS PostgreSQL con verificación del certificado. La red de la base solo acepta conexiones desde la API y el migrador.

## Identidades y mínimos privilegios

- `grumphya_runtime`: cuenta de base de datos no-superusuario, limitada al esquema y operaciones que requiere la app; sin permisos de crear roles/extensiones.
- `grumphya_migrator`: identidad objetivo, separada para el pipeline de despliegue de migraciones. El comportamiento actual aún ejecuta migraciones desde la API con las credenciales runtime; separar esa operación es trabajo pendiente antes de producción.
- Usuarios de la aplicación: creados por el flujo de registro con plan; credenciales de usuario final se almacenan como hash de contraseña, nunca en claro.
- Administrador local: el bootstrap actual reserva el alias `jappy`, sincroniza su contraseña con `ADMIN_PASSWORD` y revoca sus sesiones previas en cada arranque de API no-test. El alta pública también rechaza ese alias sin distinguir mayúsculas/minúsculas, pero esta protección contra colisiones no convierte el bootstrap en apto para producción. El código también ejecutaría el bootstrap en producción si no se cambia. Antes de desplegar, eliminar/sustituirlo por aprovisionamiento individual controlado, rotación gestionada y MFA. El servidor consulta el rol en PostgreSQL para cada ruta admin; no confiar en claims del cliente.
- GitHub Actions/deploy: identidad OIDC o token de alcance mínimo, con expiración/rotación; nunca clave personal compartida.

Las identidades runtime y migrator son objetivos de configuración por crear en el proveedor elegido. Jappy se provisiona localmente, pero el bootstrap de código actual no está limitado a ese entorno y debe reemplazarse antes de producción.

## Operación mínima antes de publicar

- Secretos distintos por entorno, rotación y auditoría de acceso.
- TLS externo e interno, rate limits, cabeceras seguras y CORS limitado al dominio real.
- **IP y rate limits del proxy:** hoy `main.ts` fija `app.set('trust proxy', false)` y no hay configuración por allowlist. El middleware usa `request.ip`, así que detrás de un reverse proxy esta será la IP del proxy, no la dirección del cliente. Habilitar confianza acotada requiere un cambio de código que identifique proxies/redes concretos; nunca confíes indiscriminadamente en `X-Forwarded-For`. Para varias réplicas, traslada los contadores a almacenamiento compartido o a un gateway; si no, cada proceso conserva su propio cupo. El límite de avatar (3/minuto/IP) comparte estas restricciones operativas.
- Migraciones hacia delante, copias con retención y prueba de restauración.
- Logs sin contraseñas, cookies, tokens, texto de ideas ni datos personales; métricas de disponibilidad/latencia y alertas.
- Health/readiness separados: liveness no depende de Postgres; readiness sí valida dependencias.
- Revisión OWASP, WCAG AA, privacidad y política de retención antes de abrir acceso público. Completar la política de privacidad con la publicación de alias y contadores en los rankings Roast y Best Users, y revisar el posible carácter identificativo o de contacto de los alias elegidos.
