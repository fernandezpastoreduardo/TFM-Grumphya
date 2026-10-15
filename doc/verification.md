# Pruebas de infraestructura

Fecha de verificación: 2026-10-09, macOS Apple Silicon.

## Resultado de esta sesión

- `node --version`: `v24.20.0`; `pnpm --version`: `12.5.1`.
- Docker Desktop `4.94.0`; Docker Engine `29.8.2`; Compose `5.5.1`.
- PostgreSQL 17 y `vector` `0.8.7` en Docker Compose (`127.0.0.1:5433`).
- `pnpm test`: correcto en la verificación inicial; los resultados de cada incremento posterior se registran en las secciones fechadas de este documento.
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
- Limitación histórica de ese incremento: 50/100 era una simulación explícita de seis criterios desconocidos, no un dictamen. La simulación se retiró después; el estado de implementación actual se recoge en las actualizaciones siguientes.

Actualización del incremento de entrada y contrato, 12 de octubre de 2026:

- La validación de backend acepta `ideaText` entre 10 y 2.000 unidades UTF-16 tras `trim` y requiere `tone` igual a `soft` o `hard`; valores inválidos generan HTTP 400 sin incluir la idea en el mensaje.
- El formulario conserva el límite de 2.000 caracteres. Home pasa `ideaText` y el tono seleccionado al adaptador, que envía ambos en el cuerpo JSON a `POST /api/evaluation-process`.
- RED: la prueba de integración de Home y la del adaptador fallaron al exigir `tone` en el POST; reproducían el payload incompleto previo. GREEN: ambas verifican el texto y tono elegidos en la solicitud.
- La API conserva el límite de cuerpo JSON de 8 KB y el rate limit existente. El parser puede rechazar un cuerpo grande antes de la validación del caso de uso.
- Verificación de este incremento: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`. No se volvió a ejecutar E2E en esta actualización.

Actualización del validador del contrato interno, 12 de octubre de 2026:

- RED: las pruebas de contrato fallaron porque no existía `validateModelDecision`; GREEN: sus 36 casos actuales aceptan estados válidos y rechazan prefijos/IDs incorrectos, puntuaciones inválidas, vetos inconsistentes, fragmentos ajenos y mensajes fuera de formato.
- El validador comprueba que un rechazo termina en el primer score menor de 15, y que `stop_at` y `reason_code` coinciden con el criterio; `SIN_BLOQUEO_EVIDENTE` exige los diez criterios, C10 puntuado y ningún veto, e `IDEA_INSUFICIENTE` no admite criterios ni datos de veto.
- La salida validada se reconstruye campo a campo: descarta propiedades adicionales del proveedor y no muta la respuesta original. Los errores usan un mensaje constante y no incluyen la idea ni el texto crudo del proveedor.
- Revisión de seguridad acotada: el validador comprueba en runtime que la decisión sea un objeto y que la idea de referencia sea texto; limita criterios a diez, scores a enteros 0–79 y mensajes a 25 palabras/160 unidades UTF-16. No se detectó una vulnerabilidad nueva en este incremento.
- Limitación en ese incremento: el validador aún no estaba conectado al caso de uso. Se conecta en la actualización descrita a continuación; las pruebas demuestran consistencia estructural, no la corrección semántica del juicio.
- Comprobaciones: `pnpm test` (63 API + 38 web, 101 total), `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`.

Actualización del renderer de tono, 12 de octubre de 2026:

- RED: cinco pruebas fallaron al no existir `renderMessage`. GREEN: `soft` conserva exactamente el mensaje neutral; `hard` añade únicamente `Menudo plan: `, sin mutar estado ni scores.
- La salida se valida tras renderizar: 8–30 palabras, una oración y máximo 180 unidades UTF-16. Un tono no permitido falla con mensaje genérico, sin reflejar el valor recibido.
- Revisión de seguridad acotada: el renderer recibe valores como `unknown`, valida la frase y el tono y no incorpora el tono del usuario salvo mediante un prefijo constante. No se detectó una vulnerabilidad nueva. La UI deberá mostrar el resultado como texto escapado, nunca como HTML.
- Limitación en ese incremento: el renderer todavía no estaba conectado al caso de uso ni a la respuesta HTTP; la integración posterior se describe en las actualizaciones siguientes.
- Comprobaciones: `pnpm test` (68 API + 38 web, 106 total), `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`.

Actualización del caso de uso con puerto de evaluación, 12 de octubre de 2026:

- RED: nueve pruebas del servicio fallaron con el caso de uso síncrono anterior: no invocaba un puerto, no generaba la respuesta pública ni manejaba fallos/timeout. GREEN: el servicio valida entrada, realiza una sola llamada con idea, política `grumphya-concept-v3` y `AbortSignal` (sin tono), valida la decisión, renderiza el modo y proyecta solo `status`, `score` y `message`. El spec del servicio tiene 12 casos.
- Scores: rechazo usa la nota de veto / 10; sin bloqueo usa la media aritmética de criterios `PUNTUADO` / 10, redondeada a dos decimales; sin criterios puntuados e idea insuficiente devuelven `null`.
- Errores: entrada inválida 400; proveedor no configurado/no disponible o respuesta inválida 503; timeout 504. No hay reintentos. `EVALUATION_TIMEOUT_MS` configura el timeout (60.000 ms por defecto; se aceptan enteros positivos hasta 120.000 ms); al vencer se aborta la señal si el adaptador la soporta. El front muestra un mensaje específico para este timeout sin reflejar el texto de la respuesta.
- Revisión de seguridad: errores y logs usan códigos constantes; no se registran idea, respuesta cruda ni mensajes del proveedor. Una prueba instancia el contexto Nest de `AppModule` sin fake de producción y comprueba que el servicio devuelve 503, no scoring simulado; no prueba el arranque HTTP completo. No se detectó vulnerabilidad nueva en este cambio.
- Limitación: no hay adaptador real ni fake registrado por inyección todavía; el siguiente incremento cubrirá el fake únicamente en tests/DI. Un proveedor que ignore `AbortSignal` podría continuar trabajando tras responder el timeout.
- Verificación final: `pnpm test` (80 API + 38 web, 118 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. No se volvió a ejecutar E2E ni una auditoría de dependencias en este incremento.

Actualización del fake de evaluación exclusivo de tests, 12 de octubre de 2026:

- RED: el spec falló al importar el módulo de pruebas que aún no existía. GREEN: `EvaluationTestingModule` registra `FakeEvaluationPort` bajo `EVALUATION_PORT`; el servicio real resuelto por Nest devuelve la decisión prefabricada, y el test confirma una invocación con idea, versión de política y señal de cancelación.
- El fake solo devuelve un objeto fijo y almacena las llamadas recibidas; no contiene cliente HTTP/SDK ni realiza acceso a red. `AppModule` de producción permanece sin proveedor, por lo que mantiene el 503 cuando no se configura un evaluador.
- Revisión de seguridad: el fake no es alcanzable desde el módulo productivo ni cambia autenticación, validación, cuotas, persistencia o superficie HTTP. No se añadieron dependencias ni se detectó vulnerabilidad nueva. No equivale a comprobar comportamiento semántico de un LLM.
- Verificación: `pnpm test` (81 API + 38 web, 119 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. E2E y auditoría de dependencias no ejecutadas en este incremento.

Actualización de integración HTTP de `evaluationProcess`, 12 de octubre de 2026:

- RED: la primera ejecución aislada no pudo abrir el puerto local (`EPERM`); al ejecutarse con permiso para localhost se observó 404 en éxito y 400 porque el módulo de pruebas no registraba el controller. GREEN: tras registrarlo, cuatro pruebas HTTP contra un puerto efímero pasan.
- Verifica POST exitoso (201) y proyección exacta de `status`, `score` y `message`; entrada inválida 400 sin reflejarla; `AppModule` sin evaluador 503; y puerto que excede el timeout 504. El caso de timeout usa timeout de 1 ms y se restaura la variable de entorno.
- Revisión de seguridad acotada: las respuestas probadas no reflejan la idea ni campos internos del proveedor; el fake sigue limitado al módulo de pruebas. Este harness no instala los middlewares de `main.ts`, por lo que no sustituye las pruebas existentes de rate limit/cabeceras/CORS ni comprueba el arranque productivo completo. Sin dependencias nuevas ni vulnerabilidades detectadas.
- Verificación: suite completa con permiso de bind local (85 API + 38 web, 123 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. E2E y auditoría de dependencias no ejecutadas en este incremento.

Actualización de UI de `evaluationProcess`, 12 de octubre de 2026:

- RED: las pruebas de adapter rechazaron el contrato actual (`status`, `score`, `message`) y las pruebas de Home detectaron el alert en vez del resultado accesible dentro de la vista. GREEN: el adapter valida y proyecta el contrato público; Home muestra carga, error recuperable y una única explicación con estado y score `es-ES` a dos decimales. El formulario conserva la idea ante errores y deshabilita el botón durante la solicitud.
- `EvaluationResult` muestra `Sin puntuación` cuando score es `null`; la respuesta se renderiza como texto React, no HTML. Se actualizó la nota de privacidad para quitar la afirmación obsoleta de que el scoring es simulado.
- Revisión de seguridad: el parser de frontend comprueba estado, score y mensaje en runtime, descarta propiedades internas adicionales, y usa errores genéricos que no reflejan el texto de idea ni detalles del proveedor. El test de UI confirma que un mensaje con markup queda como texto. No se añadieron dependencias ni se detectó vulnerabilidad nueva.
- Verificación: suite completa con permiso de bind local (85 API + 41 web, 126 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. El endpoint sigue respondiendo 503 en producción mientras no haya proveedor configurado. E2E y auditoría de dependencias no ejecutadas en este incremento.

Cierre de integración E2E de `evaluationProcess`, 12 de octubre de 2026:

- Se reemplazó el E2E obsoleto que esperaba el scoring demo retirado. Playwright levanta una API aislada con `EvaluationTestingModule`/`FakeEvaluationPort` y Vite con proxy dirigido a esa API; no arranca Docker ni usa PostgreSQL. La readiness route y el fake existen solo en el módulo de pruebas; la API escucha en loopback y conserva parser de 8 KB y middleware de seguridad.
- Un recorrido Chromium comprueba readiness del entorno, contrato HTTP, validación UI, primer envío con tono borde y segundo envío con tono normal. Verifica dos payloads distintos y resultados visibles, sin alertas ni HTML insertado. Los tests unitarios previos cubren explícitamente doble clic bloqueado mientras hay una solicitud pendiente.
- Este cierre no cambió lógica productiva: el RED/GREEN funcional ya quedó registrado en los incrementos anteriores. Las primeras ejecuciones de Playwright detectaron errores del harness (decoradores fuera del `tsconfig`, luego colisión con puertos 5173/5174 preexistentes); se corrigieron usando el módulo Nest ya compilado y puertos aislados configurables 3190/5190. No se detuvieron ni modificaron los servidores preexistentes.
- Revisión de seguridad: no hay fake registrado en `AppModule`, el test server solo se inicia desde Playwright y enlaza a `127.0.0.1`; no hay conexión con base de datos ni proveedor externo. El proxy conserva como destino por defecto `127.0.0.1:3000` y solo usa el target alternativo configurado para E2E. Sin nuevas dependencias ni vulnerabilidades detectadas.
- Verificación final: `pnpm test` (85 API + 41 web, 126 total), `pnpm test:e2e` (1 Chromium), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. Auditoría de dependencias no ejecutada.

Experimento de integración OpenAI en `experiment/openai-evaluation-provider`, 12 de octubre de 2026:

- RED: cuatro pruebas no pudieron cargar `OpenAiEvaluationPort`. GREEN: el adaptador usa Responses API, solicita `json_schema` estricto, `store: false`, razonamiento `medium`, una llamada sin reintentos y pasa el `AbortSignal` del caso de uso. La API key y el modelo solo se leen desde configuración del servidor; `EVALUATION_PROVIDER` requiere selección explícita y mantiene deshabilitada la evaluación si está ausente.
- El request transmite idea y versión de política como contenido de usuario separado; no envía el tono. El adaptador extrae y parsea el texto de salida sin registrar ni reflejar el body remoto. La validación semántica/invariantes existente continúa siendo obligatoria después del parseo.
- Revisión de seguridad: la URL del proveedor está fija (sin SSRF configurable), los errores no incluyen respuesta, idea ni API key, el secreto no se devuelve a la UI y el test confirma que una respuesta 401 con contenido sensible no se filtra. `store: false` desactiva el almacenamiento de respuesta, pero no elimina por sí solo los logs de abuso que OpenAI puede conservar según su política. Toda idea enviada se procesa en el proveedor externo. No se detectó una vulnerabilidad nueva.
- Verificación: `pnpm test` (94 API + 41 web, 135 total), `pnpm test:e2e` (1 Chromium), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. Las pruebas OpenAI usan fetch simulado; `.env.docker` no contiene `OPENAI_API_KEY`, por lo que no se ejecutó una llamada facturable. La salida estructurada real, la latencia y el comportamiento semántico de GPT-5.4 mini quedan por comprobar.

Actualización de rúbrica pesimista y mecanismos esenciales omitidos, 12 de octubre de 2026:

- RED: el test nuevo del prompt falló porque las instrucciones anteriores prohibían vetar por omisiones. GREEN: la política `grumphya-concept-v4` rechaza la ausencia de un mecanismo conceptual imprescindible cuando deja sin sustento la promesa central y perjudica directamente al usuario. No exige investigación de mercado, no inventa recompensas y no pide aclaraciones; un nuevo envío es una evaluación independiente.
- Caso de regresión: el mapa de plazas libres debe contemplar cómo caduca o se retira el aviso cuando la plaza vuelve a ocuparse. Se modela como veto C07 (`UTILIDAD_ANULADA`); score de criterio <15, motivo limitado al primer veto y mensaje claro/mordaz dirigido al mecanismo, no a la persona.
- Dos llamadas reales de prueba a GPT-5.4 mini antes de cerrar este cambio devolvieron HTTP 200, pero la primera no pasó la validación semántica. La respuesta diagnóstica sí clasificó el caso como RECHAZADA en C07 y describió el riesgo de datos obsoletos, pero añadió comillas alrededor de `basis`; como esas comillas no aparecen en la idea, el backend devolvió su error genérico. Uso reportado conjunto: 2.536 tokens de entrada y 1.420 de salida (1.032 de razonamiento), coste calculado de 0,008292 USD y latencias de 5,96 s y 5,76 s. No se presentó una evaluación válida al usuario.
- Refuerzo: el prompt exige que `basis` copie el fragmento sin comillas añadidas. En el adaptador se eliminan únicamente comillas dobles exteriores si, y solo si, el texto interior existe literalmente en la idea; después sigue ejecutándose el validador completo. El test reproduce la estructura de la respuesta observada sin hacer otra petición facturable y comprueba el rechazo si no hay coincidencia literal.
- Seguridad: el cambio no altera autenticación, cuotas, cuerpo HTTP, almacenamiento ni telemetría. No se relaja la validación de fragmento: la normalización solo retira puntuación envolvente verificable. No se registran ideas ni respuestas crudas. La evaluación sigue enviándose al proveedor externo conforme a `.env.openai`.
- Comprobaciones finales de este incremento: `pnpm test` (99 API + 41 web, 140 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. La suite E2E no se volvió a ejecutar: el cambio afecta al prompt/adaptador y no altera la UI ni el contrato HTTP.

Modelo de amenazas y rediseño del feedback de evaluación, 12 de octubre de 2026:

- RED: las pruebas nuevas fallaron al faltar el titular separado y las instrucciones adversariales genéricas. GREEN: la política `grumphya-concept-v7` pide identificar actor, ruta de abuso, impacto y salvaguardas conceptuales, no confiar en honestidad/buena intención y considerar encuentros entre desconocidos; comprueba si el canal transmite la cualidad central, incluye diferenciación en categorías maduras y exige nota para ideas funcionales. Prohíbe elevar riesgos exóticos a veto.
- C05 ahora incluye afirmaciones centrales falseables sin verificación/corrección conceptual; C06 cubre conflictos previsibles sin comprobación, contención ni reparación; C09 cubre dependencias de happy path sin alternativa segura. C02 conserva el daño grave inherente/facilitado. La rúbrica sigue exigiendo perjuicio previsible ligado a la mecánica, no una lista de controles técnicos.
- El prompt ya no contiene la idea del aparcamiento ni un escenario por dominio como prueba de regresión. Se conservaron tests genéricos de contrato literal y de instrucciones del modelo; la entrada de aparcamiento citada en el registro previo fue una prueba exploratoria histórica, no una regla universal.
- La respuesta pública incorpora `headline`; la UI muestra titular propio de Grumphya, score y explicación específica. No muestra la etiqueta «bloqueo»; además el validador rechaza mensajes del proveedor que la usen. La explicación admite hasta 40 palabras/280 unidades UTF-16 y React la renderiza como texto plano.
- Seguridad: el titular es una constante local por estado/tono y no interpola la idea; los valores del mensaje no se convierten en HTML ni se registran. La validación rechaza longitud, formato y etiqueta no deseada. No se relajaron validación de entrada, literalidad de `basis`, timeout, rate limiting ni protección de errores.
- Pendiente: una prueba lingüística con el proveedor real puede comprobar la consistencia semántica del prompt, pero conlleva coste de API; no se lanzó una llamada facturable en este incremento. Los tests simulados no certifican la precisión del modelo.
- Comprobación final: `pnpm test` (99 API + 41 web, 140 total), `pnpm test:e2e` (1 Chromium), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde.

## Revisión de seguridad de la aplicación actual

Revisión estática y pruebas añadidas el 11 de octubre de 2026:

- `POST /api/evaluation-process` aplica un límite en memoria de 10 solicitudes por minuto y dirección IP; el resto de la API comparte un máximo de 120 por minuto. Las respuestas limitadas devuelven HTTP 429 y `Retry-After`.
- El parser JSON de NestJS limita el cuerpo a 8 KB; el caso de uso restringe la idea a 10–2.000 unidades UTF-16 tras `trim` y valida el tono `soft`/`hard`.
- Se añaden `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`; HSTS solo se añade en `NODE_ENV=production`.
- CORS permite un origen exacto, métodos GET/POST y `Content-Type`. En producción es obligatorio configurar `WEB_ORIGIN`; no hay credenciales CORS habilitadas.
- Pruebas de middleware: headers, cuota de evaluación y preflight. Verificación ejecutada: `pnpm --filter @grumphya/api test`, `typecheck` y `lint`.
- `pnpm audit --prod` no devolvió resultado en este entorno y se interrumpió; el estado de vulnerabilidades conocidas de dependencias queda pendiente de ejecutar con acceso al registro.

Integración de `main` y diagnósticos seguros de validación, 13 de octubre de 2026:

- Se integraron los cambios de `main`; al no aparecer conflictos textuales, se conservaron sus versiones y la política de evaluación. La rama experimental local quedó preservada en `stash@{0}` antes de la integración.
- Los fallos de validación de la respuesta del proveedor ahora llevan un diagnóstico interno categorizado mediante una unión cerrada: `response_shape`, `criteria_prefix`, `criterion_value`, `decision_fields`, `visible_message` o `decision_semantics`. El log incluye únicamente `INVALID_EVALUATION_RESPONSE validation=<código>`; la respuesta HTTP sigue usando el mensaje genérico.
- Las pruebas comprueban las categorías esperadas y que ni secretos ni el texto de la idea se incluyen en el log. Los códigos no derivan de contenido externo ni interpolan valores arbitrarios, por lo que mejoran el diagnóstico sin ampliar la exposición de datos.

Límites de esta revisión: el rate limit por ruta en memoria es por proceso, se reinicia al reiniciar y no coordina réplicas; antes de exponer el servicio públicamente debe moverse a un almacén compartido o al gateway. Las ideas rechazadas sí se persisten para la similitud y Worst Ideas, con idempotencia y título seguro; no se conserva texto fuente ni historial personal de evaluaciones. Las cuotas diarias y autenticación/autorización de cuentas registradas siguen pendientes. Las pruebas unitarias cubren repositorio/orquestación con dobles, pero falta integración con PostgreSQL/pgvector aislado y un E2E del flujo completo de similitud. No se realizó pentest ni escaneo dinámico completo.

## Verificación de `manageUserUnknow`, 15 de octubre de 2026

- Visitantes: identidad con cookie persistente opaca y hash en PostgreSQL; 3 evaluaciones y 3 roasts de por vida por perfil de navegador. Reservas, confirmaciones, liberaciones y respuestas idempotentes durante 24 horas son transaccionales.
- Prevención secundaria: HMAC de IP sin dirección en claro, máximo 20 perfiles nuevos por IP cada 24 horas; límites por proceso de 10 envíos/minuto y 120 solicitudes/minuto generales. La IP no impone una cuota vitalicia ni un ban.
- Tests API sin apertura de puertos: 189 pasaron; 4 de persistencia quedaron omitidos (3 de uso anónimo y 1 de registro, todos requieren PostgreSQL). Tests web: 67 pasaron. `pnpm typecheck`, `pnpm lint`, `pnpm build` y `git diff --check` pasaron.
- Las pruebas HTTP existentes no pudieron abrir sockets en este entorno (`listen EPERM`); la prueba PostgreSQL aislada requiere configurar `ANONYMOUS_USAGE_TEST_DATABASE_URL`. El acceso al socket Docker fue denegado, así que no se ejecutó la migración contra PostgreSQL ni un E2E de los endpoints nuevos.
- La purga de respuestas idempotentes y HMAC caducados se realiza con solicitudes posteriores; no hay proceso periódico. La autenticación y las cuotas diarias de cuentas registradas siguen pendientes.
