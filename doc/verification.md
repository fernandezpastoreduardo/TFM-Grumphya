# Pruebas de infraestructura

Fecha de verificación: 2026-10-09, macOS Apple Silicon.

## Resultado de esta sesión

- `node --version`: `v24.20.0`; `pnpm --version`: `12.5.1`.
- Docker Desktop `4.94.0`; Docker Engine `29.8.2`; Compose `5.5.1`.
- PostgreSQL 17 y `vector` `0.8.7` en Docker Compose (`127.0.0.1:5433`).
- `pnpm test`: correcto, 2 archivos y 2 tests unitarios.
- `pnpm typecheck`: correcto para API y web.
- `pnpm lint`: correcto para API y web.
- `pnpm format:check`: correcto.
- `pnpm build`: correcto; generó `apps/api/dist` y `apps/web/dist`.
- `pnpm test:e2e`: correcto, 1 test Chromium; arrancó ambos servidores, comprobó `/api/health` directamente y a través del proxy Vite, y validó PostgreSQL/pgvector.
- `docker compose ps`: contenedor `db` sano tras el healthcheck de `pg_isready`.
- La extensión vector en el contenedor devuelve versión `0.8.7`.
- Docker Desktop queda instalado y activo. PostgreSQL Homebrew preexistente en `5432` no se modificó.
- `pnpm dev` imprime comprobaciones de arranque separadas para PostgreSQL, pgvector, NestJS y el proxy React/Vite→NestJS.

## Pruebas esperadas

```sh
node --version
pnpm --version
psql --version
docker compose --env-file .env.docker exec db psql -U grumphya_dev -d grumphya_dev -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm db:up
pnpm dev
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:5173/api/health
```

Durante `pnpm dev` deben aparecer estas líneas:

```text
[infra] PostgreSQL levantado OK
[infra] pgvector 0.8.7 habilitado OK
[infra] NestJS levantado OK
[infra] Comunicación React/Vite → NestJS OK
[infra] Health check completo: frontend, API y base de datos OK
```

Estas líneas aparecen en la terminal integrada de VS Code si `pnpm dev` se
ejecuta desde `Terminal > New Terminal`.

## Smoke test manual

1. Arranca `pnpm dev`.
2. Abre `http://127.0.0.1:5173`; debe aparecer el prototipo de entrada de idea.
3. Comprueba `http://127.0.0.1:3000/api/health`; respuesta sana incluye `database: ok` y versión pgvector.
4. Comprueba `http://127.0.0.1:5173/api/health`; confirma el proxy de Vite hasta NestJS.
5. Si se para PostgreSQL, health responde 503; vuelve a iniciarlo con `pnpm db:up`.

Una compilación verde solo prueba el esqueleto técnico, no la lógica de negocio documentada. El E2E actual solo cubre el arranque y conectividad de la infraestructura, no evaluación de ideas.
