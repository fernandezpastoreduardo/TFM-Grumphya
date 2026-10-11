# Preparación para producción

No se ha elegido proveedor cloud ni se han creado cuentas, dominios o recursos de producción. Esta guía es el objetivo operativo, no una afirmación de que el despliegue exista.

## Topología recomendada

1. Compilar `apps/web` como sitio estático y servirlo por HTTPS desde CDN/hosting estático.
2. Ejecutar `apps/api` como servicio Node.js detrás de un reverse proxy HTTPS, con réplicas sin estado.
3. Usar PostgreSQL 17 gestionado con pgvector 0.8.x, TLS obligatorio, copias de seguridad cifradas y recuperación probada.
4. Mantener secretos en el secret manager del proveedor. No hornear secretos en imágenes, variables `VITE_*`, artefactos web o Git.
5. Aplicar migraciones como paso controlado de release con identidad de migración distinta de la cuenta de runtime.

La primera entrega no requiere Redis, Kubernetes, almacenamiento de archivos ni pagos reales. Añádelos solo con una necesidad funcional/operativa concreta.

## Build y ejecución

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

- Artefactos web: `apps/web/dist/`.
- API compilada: `apps/api/dist/main.js`.
- Comando runtime API: `pnpm --filter @grumphya/api start`.
- Fija la imagen/runtime de Node en una versión LTS soportada y parcheada; no despliegues dependencias de desarrollo.
- Configura proxy para reenviar `/api/*` al servicio y servir rutas SPA; solo expón HTTPS en Internet.

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
- `grumphya_migrator`: credencial separada, usada únicamente por el pipeline de despliegue para migraciones. No está presente en procesos de usuario.
- Usuarios de la aplicación: creados por el flujo de registro con plan; credenciales de usuario final se almacenan como hash de contraseña, nunca en claro.
- Administrador de aplicación: no se crea una cuenta predefinida ni un usuario/clave compartidos. Definir un proceso de bootstrap auditado antes de añadir funciones administrativas.
- GitHub Actions/deploy: identidad OIDC o token de alcance mínimo, con expiración/rotación; nunca clave personal compartida.

Los nombres son convenciones por crear en el proveedor elegido; no son cuentas existentes.

## Operación mínima antes de publicar

- Secretos distintos por entorno, rotación y auditoría de acceso.
- TLS externo e interno, rate limits, cabeceras seguras y CORS limitado al dominio real.
- Migraciones hacia delante, copias con retención y prueba de restauración.
- Logs sin contraseñas, cookies, tokens, texto de ideas ni datos personales; métricas de disponibilidad/latencia y alertas.
- Health/readiness separados: liveness no depende de Postgres; readiness sí valida dependencias.
- Revisión OWASP, WCAG AA, privacidad y política de retención antes de abrir acceso público.
