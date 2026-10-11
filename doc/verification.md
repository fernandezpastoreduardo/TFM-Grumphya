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

## Verificación de dictado `transcriptUserIdea`

Validación añadida el 11 de octubre de 2026 con TDD:

- RED: las pruebas fallaron porque aún no existían el adaptador de voz ni el control de dictado.
- GREEN: reconocimiento `es-ES`, errores normalizados, incorporación del texto al textarea, conservación del texto ya escrito, disponibilidad de entrada manual y parada al desmontar.
- Cobertura específica: 10 pruebas unitarias/de componente y 3 pruebas de integración del dictado con el formulario (texto previo tras denegación, concatenación y límite de longitud).
- Comprobaciones: `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build`.
- Limitación: el soporte y el tratamiento del audio dependen del navegador y su proveedor de reconocimiento. No se ha añadido ni probado un proveedor local ni transcripción del lado servidor.

## Verificación de scoring `evaluationProcess`

Validación añadida el 11 de octubre de 2026 con TDD:

- RED: los tests de la rúbrica y del alert fallaron antes de añadir el caso de uso/API.
- GREEN: NestJS valida la idea, calcula la puntuación ponderada con la rúbrica v1 y responde con el scoring simulado; el frontend realiza el POST y muestra un alert accesible del navegador sin repetir el texto de la idea.
- Cobertura específica: 19 tests de API y 4 tests del adaptador de evaluación web; Home comprueba envío válido, validación, respuesta de scoring, fallo seguro de red y que el texto no se filtra al alert.
- Comprobaciones: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `pnpm test:e2e`.
- Limitación: 50/100 es una simulación explícita de seis criterios desconocidos, no un dictamen de la idea. No hay proveedor de IA, persistencia, historial, similitud ni consumo de intentos en esta entrega.
