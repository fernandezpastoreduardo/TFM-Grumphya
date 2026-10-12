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
- GREEN inicial: NestJS validaba la idea y devolvía el scoring simulado v1; el frontend realizaba el POST y mostraba un alert accesible sin repetir el texto. El endpoint ya no usa esa simulación: sin un `EvaluationPort` configurado responde 503.
- Cobertura actual: API 23 tests del helper v1, 36 del validador de decisión, 5 del renderer, 11 del servicio, 3 del middleware y 1 de health; web 38 tests, incluidos 4 del adaptador y 7 de Home.
- Comprobaciones: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `pnpm test:e2e`.
- Limitación histórica: 50/100 era una simulación explícita de seis criterios desconocidos, no un dictamen. No hay proveedor de IA real, persistencia, historial, similitud ni consumo de intentos en esta entrega.

Actualización del incremento de entrada y contrato, 12 de octubre de 2026:

- La validación de backend acepta `ideaText` entre 10 y 2.000 unidades UTF-16 tras `trim` y requiere `tone` igual a `soft` o `hard`; valores inválidos generan HTTP 400 sin incluir la idea en el mensaje.
- El formulario conserva el límite de 2.000 caracteres. Home pasa `ideaText` y el tono seleccionado al adaptador, que envía ambos en el cuerpo JSON a `POST /api/evaluation-process`.
- RED: la prueba de integración de Home y la del adaptador fallaron al exigir `tone` en el POST; reproducían el payload incompleto previo. GREEN: ambas verifican el texto y tono elegidos en la solicitud.
- La API conserva el límite de cuerpo JSON de 8 KB y el rate limit existente. El parser puede rechazar un cuerpo grande antes de la validación del caso de uso.
- Verificación de este incremento: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`. No se volvió a ejecutar E2E en esta actualización.

Actualización del validador del contrato interno, 12 de octubre de 2026:

- RED: las pruebas de contrato fallaron porque no existía `validateModelDecision`; GREEN: sus 36 casos actuales aceptan estados válidos y rechazan prefijos/IDs incorrectos, puntuaciones inválidas, vetos inconsistentes, fragmentos ajenos y mensajes fuera de formato.
- El validador comprueba que un rechazo termina en el primer score menor de 15, y que `stop_at` y `reason_code` coinciden con el criterio; `SIN_BLOQUEO_EVIDENTE` exige los nueve criterios sin veto e `IDEA_INSUFICIENTE` no admite criterios ni datos de veto.
- La salida validada se reconstruye campo a campo: descarta propiedades adicionales del proveedor y no muta la respuesta original. Los errores usan un mensaje constante y no incluyen la idea ni el texto crudo del proveedor.
- Revisión de seguridad acotada: el validador comprueba en runtime que la decisión sea un objeto y que la idea de referencia sea texto; limita criterios a nueve, scores a enteros 0–79 y mensajes a 25 palabras/160 unidades UTF-16. No se detectó una vulnerabilidad nueva en este incremento.
- Limitación en ese incremento: el validador aún no estaba conectado al caso de uso. Se conecta en la actualización descrita a continuación; las pruebas demuestran consistencia estructural, no la corrección semántica del juicio.
- Comprobaciones: `pnpm test` (63 API + 38 web, 101 total), `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`.

Actualización del renderer de tono, 12 de octubre de 2026:

- RED: cinco pruebas fallaron al no existir `renderMessage`. GREEN: `soft` conserva exactamente el mensaje neutral; `hard` añade únicamente `Menudo plan: `, sin mutar estado ni scores.
- La salida se valida tras renderizar: 8–30 palabras, una oración y máximo 180 unidades UTF-16. Un tono no permitido falla con mensaje genérico, sin reflejar el valor recibido.
- Revisión de seguridad acotada: el renderer recibe valores como `unknown`, valida la frase y el tono y no incorpora el tono del usuario salvo mediante un prefijo constante. No se detectó una vulnerabilidad nueva. La UI deberá mostrar el resultado como texto escapado, nunca como HTML.
- Limitación: el renderer todavía no está conectado al caso de uso ni a la respuesta HTTP; presupone que la frase neutral proviene de una decisión validada y no reemplaza esa validación.
- Comprobaciones: `pnpm test` (68 API + 38 web, 106 total), `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`.

Actualización del caso de uso con puerto de evaluación, 12 de octubre de 2026:

- RED: nueve pruebas del servicio fallaron con el caso de uso síncrono anterior: no invocaba un puerto, no generaba la respuesta pública ni manejaba fallos/timeout. GREEN: el servicio valida entrada, realiza una sola llamada con idea, política `grumphya-concept-v3` y `AbortSignal` (sin tono), valida la decisión, renderiza el modo y proyecta solo `status`, `score` y `message`. El spec del servicio tiene 12 casos.
- Scores: rechazo usa la nota de veto / 10; sin bloqueo usa la media aritmética de criterios `PUNTUADO` / 10, redondeada a dos decimales; sin criterios puntuados e idea insuficiente devuelven `null`.
- Errores: entrada inválida 400; proveedor no configurado/no disponible o respuesta inválida 503; timeout 504. No hay reintentos. `EVALUATION_TIMEOUT_MS` configura el timeout (15.000 ms por defecto; se aceptan enteros positivos hasta 120.000 ms); al vencer se aborta la señal si el adaptador la soporta.
- Revisión de seguridad: errores y logs usan códigos constantes; no se registran idea, respuesta cruda ni mensajes del proveedor. Una prueba instancia el contexto Nest de `AppModule` sin fake de producción y comprueba que el servicio devuelve 503, no scoring simulado; no prueba el arranque HTTP completo. No se detectó vulnerabilidad nueva en este cambio.
- Limitación: no hay adaptador real ni fake registrado por inyección todavía; el siguiente incremento cubrirá el fake únicamente en tests/DI. Un proveedor que ignore `AbortSignal` podría continuar trabajando tras responder el timeout.
- Verificación final: `pnpm test` (80 API + 38 web, 118 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. No se volvió a ejecutar E2E ni una auditoría de dependencias en este incremento.

Actualización del fake de evaluación exclusivo de tests, 12 de octubre de 2026:

- RED: el spec falló al importar el módulo de pruebas que aún no existía. GREEN: `EvaluationTestingModule` registra `FakeEvaluationPort` bajo `EVALUATION_PORT`; el servicio real resuelto por Nest devuelve la decisión prefabricada, y el test confirma una invocación con idea, versión de política y señal de cancelación.
- El fake solo devuelve un objeto fijo y almacena las llamadas recibidas; no contiene cliente HTTP/SDK ni realiza acceso a red. `AppModule` de producción permanece sin proveedor, por lo que mantiene el 503 cuando no se configura un evaluador.
- Revisión de seguridad: el fake no es alcanzable desde el módulo productivo ni cambia autenticación, validación, cuotas, persistencia o superficie HTTP. No se añadieron dependencias ni se detectó vulnerabilidad nueva. No equivale a comprobar comportamiento semántico de un LLM.
- Verificación: `pnpm test` (81 API + 38 web, 119 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. E2E y auditoría de dependencias no ejecutadas en este incremento.

## Revisión de seguridad de la aplicación actual

Revisión estática y pruebas añadidas el 11 de octubre de 2026:

- `POST /api/evaluation-process` aplica un límite en memoria de 10 solicitudes por minuto y dirección IP; el resto de la API comparte un máximo de 120 por minuto. Las respuestas limitadas devuelven HTTP 429 y `Retry-After`.
- El parser JSON de NestJS limita el cuerpo a 8 KB; el caso de uso restringe la idea a 10–2.000 unidades UTF-16 tras `trim` y valida el tono `soft`/`hard`.
- Se añaden `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`; HSTS solo se añade en `NODE_ENV=production`.
- CORS permite un origen exacto, métodos GET/POST y `Content-Type`. En producción es obligatorio configurar `WEB_ORIGIN`; no hay credenciales CORS habilitadas.
- Pruebas de middleware: headers, cuota de evaluación y preflight. Verificación ejecutada: `pnpm --filter @grumphya/api test`, `typecheck` y `lint`.
- `pnpm audit --prod` no devolvió resultado en este entorno y se interrumpió; el estado de vulnerabilidades conocidas de dependencias queda pendiente de ejecutar con acceso al registro.

Límites de esta revisión: el rate limit en memoria es por proceso, se reinicia al reiniciar y no coordina réplicas; antes de exponer el servicio públicamente debe moverse a un almacén compartido o al gateway. No hay aún autenticación, autorización, cuotas de negocio, persistencia de ideas ni protección CSRF asociada a cookies; no deben darse por implementadas. No se realizó pentest ni escaneo dinámico completo.
