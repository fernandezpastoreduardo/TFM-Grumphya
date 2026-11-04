# Pruebas de infraestructura

Fecha de verificación: 2026-10-09, macOS Apple Silicon.

Este documento conserva los resultados y comandos de aquella sesión; no es un
informe de la última ejecución. La versión de Node.js anotada abajo pertenece a
ese registro histórico. Para requisitos y versiones vigentes, consulta
[Desarrollo local](development.md) y [Stack instalado](stack.md).

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

## Verificación de la evaluación de ideas

Validación añadida el 11 de octubre de 2026 con TDD:

- La API valida el texto y el tono antes de invocar el evaluador. Sin un `EvaluationPort` configurado, el endpoint responde 503.
- Las pruebas de validación cubren entradas inválidas, límites de longitud, normalización del texto y la respuesta HTTP 400; las pruebas del servicio y del validador cubren la evaluación vigente.
- Comprobaciones: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `pnpm test:e2e`.

Actualización del incremento de entrada y contrato, 12 de octubre de 2026:

- La validación de backend acepta `ideaText` entre 10 y 2.000 unidades UTF-16 tras `trim` y requiere `tone` igual a `soft` o `hard`; valores inválidos generan HTTP 400 sin incluir la idea en el mensaje.
- El formulario conserva el límite de 2.000 caracteres. Home pasa `ideaText` y el tono seleccionado al adaptador, que envía ambos en el cuerpo JSON a `POST /api/evaluation-process`.
- RED: la prueba de integración de Home y la del adaptador fallaron al exigir `tone` en el POST; reproducían el payload incompleto previo. GREEN: ambas verifican el texto y tono elegidos en la solicitud.
- La API conserva el límite de cuerpo JSON de 8 KB y el rate limit existente. El parser puede rechazar un cuerpo grande antes de la validación del caso de uso.
- Verificación de este incremento: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm format:check`. No se volvió a ejecutar E2E en esta actualización.

Actualización del validador del contrato interno, 12 de octubre de 2026:

- RED: las pruebas de contrato fallaron porque no existía `validateModelDecision`; GREEN: sus 36 casos actuales aceptan estados válidos y rechazan prefijos/IDs incorrectos, puntuaciones inválidas, vetos inconsistentes, fragmentos ajenos y mensajes fuera de formato.
- El validador comprueba que un rechazo termina en el primer score menor de 15, y que `stop_at` y `reason_code` coinciden con el criterio; los estados sin veto exigen los diez criterios, C10 puntuado y ningún veto. La respuesta pública es `REQUIERE_REVISION` si la media queda por debajo de 7/10; `IDEA_INSUFICIENTE` no admite criterios ni datos de veto.
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

- RED: las pruebas del servicio exigían invocar un puerto, generar la respuesta pública y manejar fallos y timeout. GREEN: el servicio valida entrada, realiza una sola llamada con idea, política `grumphya-concept-v3` y `AbortSignal` (sin tono), valida la decisión, renderiza el modo y proyecta solo `status`, `score` y `message`. El spec del servicio tenía 12 casos en ese incremento.
- Scores: rechazo usa la nota de veto / 10; sin bloqueo usa la media aritmética de criterios `PUNTUADO` / 10, redondeada a dos decimales; sin criterios puntuados e idea insuficiente devuelven `null`.
- Errores: entrada inválida 400; proveedor no configurado/no disponible o respuesta inválida 503; timeout 504. La evaluación reintenta una vez ante errores de mensaje visible, campos de decisión inválidos o incoherencia semántica; otros errores no se reintentan. El esfuerzo de razonamiento predeterminado es `low` para reducir latencia, configurable con `OPENAI_REASONING_EFFORT`. `EVALUATION_TIMEOUT_MS` configura el timeout (120.000 ms por defecto y máximo); al vencer se aborta la señal si el adaptador la soporta. El front muestra un mensaje específico para este timeout sin reflejar el texto de la respuesta. La normalización semántica y la comparación de candidatas tienen un timeout de 30.000 ms cada una.
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
- Caso de regresión: el mapa de plazas libres debe contemplar cómo caduca o se retira el aviso cuando la plaza vuelve a ocuparse. Se modela como veto C07 (`UTILIDAD_ANULADA`); score de criterio <15, `stop_at` y `reason_code` apuntan al primer criterio fallido, y el mensaje explica todos los criterios fallidos con claridad y sin atacar a la persona.
- Dos llamadas reales de prueba a GPT-5.4 mini antes de cerrar este cambio devolvieron HTTP 200, pero la primera no pasó la validación semántica. La respuesta diagnóstica sí clasificó el caso como RECHAZADA en C07 y describió el riesgo de datos obsoletos, pero añadió comillas alrededor de `basis`; como esas comillas no aparecen en la idea, el backend devolvió su error genérico. Uso reportado conjunto: 2.536 tokens de entrada y 1.420 de salida (1.032 de razonamiento), coste calculado de 0,008292 USD y latencias de 5,96 s y 5,76 s. No se presentó una evaluación válida al usuario.
- Refuerzo: el prompt exige que `basis` copie el fragmento sin comillas añadidas. En el adaptador se eliminan únicamente comillas dobles exteriores si, y solo si, el texto interior existe literalmente en la idea; después sigue ejecutándose el validador completo. El test reproduce la estructura de la respuesta observada sin hacer otra petición facturable y comprueba el rechazo si no hay coincidencia literal.
- Seguridad: el cambio no altera autenticación, cuotas, cuerpo HTTP, almacenamiento ni telemetría. No se relaja la validación de fragmento: la normalización solo retira puntuación envolvente verificable. No se registran ideas ni respuestas crudas. La evaluación sigue enviándose al proveedor externo conforme a `.env.openai`.
- Comprobaciones finales de este incremento: `pnpm test` (99 API + 41 web, 140 total), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde. La suite E2E no se volvió a ejecutar: el cambio afecta al prompt/adaptador y no altera la UI ni el contrato HTTP.

Modelo de amenazas y rediseño del feedback de evaluación, 12 de octubre de 2026 (registro histórico del estado de ese incremento):

- RED: las pruebas nuevas fallaron al faltar el titular separado y las instrucciones adversariales genéricas. GREEN: la política `grumphya-concept-v7` pide identificar actor, ruta de abuso, impacto y salvaguardas conceptuales, no confiar en honestidad/buena intención y considerar encuentros entre desconocidos; comprueba si el canal transmite la cualidad central, incluye diferenciación en categorías maduras y exige nota para ideas funcionales. Prohíbe elevar riesgos exóticos a veto.
- C05 ahora incluye afirmaciones centrales falseables sin verificación/corrección conceptual; C06 cubre conflictos previsibles sin comprobación, contención ni reparación; C09 cubre dependencias de happy path sin alternativa segura. C02 conserva el daño grave inherente/facilitado. La rúbrica sigue exigiendo perjuicio previsible ligado a la mecánica, no una lista de controles técnicos.
- El prompt ya no contiene la idea del aparcamiento ni un escenario por dominio como prueba de regresión. Se conservaron tests genéricos de contrato literal y de instrucciones del modelo; la entrada de aparcamiento citada en el registro previo fue una prueba exploratoria histórica, no una regla universal.
- La respuesta pública incorpora `headline`; la UI muestra titular propio de Grumphya, score y explicación específica. No muestra la etiqueta «bloqueo»; además el validador rechaza mensajes del proveedor que la usen. La explicación neutral del proveedor admite hasta 40 palabras/280 unidades UTF-16; el servidor añade la introducción del tono seleccionado y la UI acepta hasta 360 unidades (1.000 en rechazos). React lo renderiza como texto plano.
- Seguridad en ese incremento: el titular era una constante local por estado/tono y no interpolaba la idea; los valores del mensaje no se convertían en HTML ni se registraban. La validación rechazaba longitud, formato y etiqueta no deseada. La generación de titulares por resultado, añadida el 27 de octubre, está documentada en `agentic-guidelines/features.md` y `agentic-guidelines/scoring-viability-software.md`.
- Pendiente: una prueba lingüística con el proveedor real puede comprobar la consistencia semántica del prompt, pero conlleva coste de API; no se lanzó una llamada facturable en este incremento. Los tests simulados no certifican la precisión del modelo.
- Comprobación final: `pnpm test` (99 API + 41 web, 140 total), `pnpm test:e2e` (1 Chromium), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` y `git diff --check`, todo en verde.

## Revisión de seguridad de la aplicación actual

Registro histórico de revisión estática y pruebas del 11 de octubre de 2026 (el estado de autenticación y otros controles se actualizó en secciones posteriores):

- `POST /api/evaluation-process` aplica un límite en memoria de 10 solicitudes por minuto y dirección IP; el resto de la API comparte un máximo de 120 por minuto. Las respuestas limitadas devuelven HTTP 429 y `Retry-After`.
- El parser JSON de NestJS limita el cuerpo a 8 KB; el caso de uso restringe la idea a 10–2.000 unidades UTF-16 tras `trim` y valida el tono `soft`/`hard`.
- Se añaden `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`; HSTS solo se añade en `NODE_ENV=production`.
- En esa revisión, CORS permitía un origen exacto, métodos GET/POST y `Content-Type`, sin credenciales. Este dato es histórico y no describe el contrato actual: las sesiones actuales usan cookie de refresh y sus mutaciones validan `Origin`/CSRF; consultar los tests de auth y la implementación vigente.
- Pruebas de middleware: headers, cuota de evaluación y preflight. Verificación ejecutada: `pnpm --filter @grumphya/api test`, `typecheck` y `lint`.
- `pnpm audit --prod` no devolvió resultado en este entorno y se interrumpió; el estado de vulnerabilidades conocidas de dependencias queda pendiente de ejecutar con acceso al registro.

Integración de `main` y diagnósticos seguros de validación, 13 de octubre de 2026:

- Se integraron los cambios de `main`; al no aparecer conflictos textuales, se conservaron sus versiones y la política de evaluación. La rama experimental local quedó preservada en `stash@{0}` antes de la integración.
- Los fallos de validación de la respuesta del proveedor ahora llevan un diagnóstico interno categorizado mediante una unión cerrada: `response_shape`, `criteria_prefix`, `criterion_value`, `decision_fields`, `visible_message` o `decision_semantics`. El log incluye únicamente `INVALID_EVALUATION_RESPONSE validation=<código>`; la respuesta HTTP sigue usando el mensaje genérico.
- Las pruebas comprueban las categorías esperadas y que ni secretos ni el texto de la idea se incluyen en el log. Los códigos no derivan de contenido externo ni interpolan valores arbitrarios, por lo que mejoran el diagnóstico sin ampliar la exposición de datos.

Diagnóstico persistente de errores de evaluación y última ocurrencia, 22 de octubre de 2026:

- El historial técnico explica una causa concreta ya reproducida: GPT envolvió `basis` en comillas aunque la idea no las contenía. El adaptador elimina comillas exteriores solo si el contenido interior coincide literalmente; ahora reconoce comillas rectas, tipográficas y españolas sin relajar esta comprobación. Los eventos registrados antes de la migración `029` no tienen `diagnostic_code` y quedan con `NULL`; por tanto, no se les puede atribuir una categoría retrospectiva.
- La excepción de respuesta inválida conserva el código público genérico y transporta internamente la categoría cerrada del validador. El filtro global la persiste junto al evento, y el panel muestra el último diagnóstico disponible y la fecha/hora de la ocurrencia más reciente. La persistencia se espera antes de responder para que el fallo no se pierda como escritura en segundo plano.
- La migración `029_application_error_diagnostics.sql` añade la columna opcional de diagnóstico; los eventos históricos quedan con `NULL`. No se almacena idea, salida del modelo ni mensaje de excepción.

Detalle de errores administrativos, 24 de octubre de 2026:

- La tabla del panel ahora separa grupos por código y diagnóstico; cada denominación abre en una pestaña nueva el evento más reciente de ese grupo. El endpoint de detalle valida el identificador y requiere las guardas de acceso y rol administrador.
- Para errores HTTP 5xx de `POST /api/evaluation-process`, el evento puede conservar el caso de uso y hasta 2.000 caracteres del texto de idea en `context_json`, además del diagnóstico categorizado cuando está disponible. Solo lo devuelve el endpoint administrativo de detalle. No se guardan cuerpos de otras rutas, texto de excepción ni respuesta cruda del proveedor. El evento y su contexto se purgan a los 30 días.
- La migración `031_application_error_context.sql`, los tests de filtro, repositorio, servicio, controlador y UI cubren persistencia, autorización de caso, etiquetas específicas y renderizado seguro del texto. La política de privacidad versión 4 y los términos informan del uso temporal del texto para depuración.

Límites registrados en esa revisión: el rate limit por ruta en memoria es por proceso y no coordina réplicas; antes de producción multiinstancia debe moverse a un almacén compartido o gateway. En aquel momento las cuotas diarias y autenticación/autorización de cuentas estaban pendientes; el alta, login y rutas de perfil protegidas se implementaron después. Esta revisión no fue un pentest ni escaneo dinámico completo.

## Verificación de `manageUserUnknow`, 15 de octubre de 2026

- Visitantes (verificación histórica del 15 de octubre): identidad con cookie opaca y hash en PostgreSQL; 3 evaluaciones y 3 roasts por perfil de navegador. La decisión posterior de retención purga el perfil tras 400 días sin actividad. Reservas, confirmaciones, liberaciones y respuestas idempotentes durante 24 horas son transaccionales.
- Prevención secundaria: HMAC de IP sin dirección en claro, máximo 20 perfiles nuevos por IP cada 24 horas; límites por proceso de 10 envíos/minuto y 120 solicitudes/minuto generales. La IP no impone una cuota vitalicia ni un ban.
- Tests API sin apertura de puertos: 189 pasaron; 4 de persistencia quedaron omitidos (3 de uso anónimo y 1 de registro, todos requieren PostgreSQL). Tests web: 67 pasaron. `pnpm typecheck`, `pnpm lint`, `pnpm build` y `git diff --check` pasaron.
- Las pruebas HTTP existentes no pudieron abrir sockets en este entorno (`listen EPERM`); la prueba PostgreSQL aislada requiere configurar `ANONYMOUS_USAGE_TEST_DATABASE_URL`. El acceso al socket Docker fue denegado, así que no se ejecutó la migración contra PostgreSQL ni un E2E de los endpoints nuevos.
- En aquella revisión, la purga de respuestas idempotentes y HMAC caducados era oportunista y no había proceso periódico. `DataRetentionService` la sustituyó después: purga datos vencidos al arrancar y cada hora. La nota de autenticación pendiente también era histórica y quedó superada por la sección de perfil/autenticación del 16 de octubre.

## Verificación de perfil e ideas aprobadas, 16 de octubre de 2026

- El perfil carga datos de cuenta, planes e ideas aprobadas mediante API autenticada; la tabla queda vacía cuando no hay filas. `GET /api/account/good-ideas` devuelve solo diez ideas del propietario, ordenadas por fecha e ID descendentes. El endpoint no acepta `userId` del cliente.
- Solo las evaluaciones `SIN_BLOQUEO_EVIDENTE` asociadas a un access JWT válido guardan título privado. `submission_hash` es SHA-256 de la clave de idempotencia; `request_hash` liga esa clave al payload mediante HMAC-SHA-256. Un reintento idéntico no duplica filas; una clave reutilizada con otro payload da conflicto genérico sin reemplazar el título.
- `pnpm test`: API 236/236 (33 archivos) y web 81/81 (19 archivos), cero omisiones. La suite SQL usó cuatro `*_TEST_DATABASE_URL` y un `ACCESS_TOKEN_SECRET` temporal contra un cluster PostgreSQL aislado en `127.0.0.1:55439`. Los specs crean schemas UUID, ajustan `search_path=<schema UUID>,public` y eliminan solo el schema que ellos mismos crearon; `vector` se habilitó en `public` únicamente dentro de esa base temporal.
- `pnpm lint`, `pnpm typecheck` y `pnpm test:e2e` (2/2) pasan. También pasaron `pnpm --filter @grumphya/api typecheck`, `pnpm --filter @grumphya/api lint` y el test focalizado de middleware/repositorio (10 passed, 1 PostgreSQL skip en una ejecución sin URL). Las pruebas HTTP cubren login/«Recordarme», refresh y logout con revocación inmediata y jti, owner scoping de good-ideas y baja protegida. La persistencia PostgreSQL verifica el borrado físico y el teardown solo del schema UUID propio. UI cubre login y baja; E2E cubre alta, perfil y diálogo/confirmación de baja. La prueba de conflicto en registro compara las sesiones antes/después sin asumir una sola sesión legítima por cuenta.
- `security.middleware.spec.ts` comprueba `Cache-Control: no-store` en GET `/api/account/profile`; el middleware aplica la cabecera a `/api/account/**`, `/api/auth/**` y `/api/registration*`. Tokens JWT nuevos reciben un `jti` aleatorio por emisión; access-token specs 4/4 y regresión HTTP login-refresh-logout 4/4 confirman unicidad y revocación.
- En la verificación del 16 de octubre, la limpieza de intenciones y sesiones era oportunista y no purgaba registros pendientes históricos. Después se añadió `DataRetentionService`, que elimina intenciones vencidas, tokens, sesiones y cuentas no verificadas al arrancar y cada hora.
- En la verificación del 16 de octubre, la API Nest aún escuchaba HTTP detrás del reverse proxy. La configuración de producción cifra Caddy–API, Caddy–web y API–PostgreSQL; cada cliente valida la CA y el nombre del certificado de servidor, y PostgreSQL rechaza conexiones TCP sin TLS. No se configura TLS mutuo. La guía de [producción](production.md#transporte-y-límites-del-cifrado) documenta su provisión, rotación y comprobaciones; la configuración debe seguir verificándose en cada despliegue.

## Integración de cuotas diarias para cuentas, estado verificado el 16 de octubre de 2026

- Iluminado consume hasta 11 evaluaciones y Faltón hasta 11 roasts por día de `Europe/Madrid`. La API valida sesión y suscripción vigente. La fecha se calcula en PostgreSQL con la zona `Europe/Madrid`, por lo que el cambio estacional de hora conserva el reinicio a medianoche local.
- La cuota se reserva transaccionalmente antes de evaluar o responder al roast. Solo una respuesta completa y válida confirma el consumo; los errores de búsqueda, evaluación, validación o persistencia liberan la reserva. Mostrar solo el aviso de coincidencia semántica no consume; continuar reserva el uso de Iluminado. En la verificación del 16 de octubre, la respuesta de roast seguía siendo una fixture y su respuesta válida consumía el intento. Este estado se actualizó posteriormente; véase la revisión del 18 de octubre.
- La idempotencia es por usuario, plan, hash de clave y hash HMAC del payload. Repetir la misma clave con el mismo payload devuelve el cuerpo cacheado sin otro consumo; otro payload con esa clave se rechaza. El TTL lógico vence 24 horas después de la reserva original, sin renovarse al reintentar. `response_json` contiene el cuerpo completo de respuesta y puede incluir salida generada derivada del payload, pero no guarda el payload fuente como campo independiente. `DataRetentionService` elimina físicamente las filas vencidas por lotes al arrancar la API y cada hora; el borrado puede ocurrir hasta una hora después del TTL. Una reserva incompleta responde `409 REQUEST_IN_PROGRESS` durante 30 minutos y luego se puede recuperar.
- Las claves UUID de idempotencia se normalizan a minúsculas antes de calcular los hashes, de modo que la misma clave en mayúsculas y minúsculas representa la misma petición. Dos pruebas enfocadas cubren evaluación y roast (2/2).
- Verificación del incremento del 16 de octubre: `pnpm test` pasó con API 250/250 (35 archivos) y web 81/81 (19 archivos), cero omisiones. `pnpm lint` y `pnpm typecheck` pasaron; `pnpm test:e2e` pasó 2/2. La suite SQL usó todas las variables de test contra el cluster PostgreSQL temporal `postgres` en `127.0.0.1:55439`; cada spec creó y eliminó únicamente sus schemas UUID, sin modificar bases de datos existentes.

Actualización del prompt de roast, 18 de octubre de 2026:

- La instrucción de generación exige que la réplica aluda claramente a un detalle concreto e inocuo del mensaje y lo convierta en el remate; prohíbe respuestas genéricas intercambiables, citas literales y la inclusión de datos personales, credenciales o información sensible. También trata el mensaje recibido como contenido no confiable y conserva las restricciones de tono y lenguaje.
- La prueba del adaptador comprueba que el prompt enviado al proveedor incluye esas reglas. Es una prueba contractual con el proveedor simulado: no demuestra que cada respuesta real cumpla semánticamente la instrucción. En producción, la validación automática comprueba el formato JSON, la longitud y la ausencia de expresiones explícitamente abusivas; la alusión concreta al contenido sigue dependiendo del modelo.
- Verificación del cambio: prueba focal de roast 25/25; suite API 317/332, con 15 pruebas PostgreSQL omitidas por falta de configuración; web 128/128. `pnpm lint` y `pnpm typecheck` pasaron.

Actualización de instrucciones de evaluación y roast, 22 de octubre de 2026:

- La evaluación ahora instruye explícitamente que C10 no sea un motivo por defecto: primero deben valorarse los fallos concretos de C01–C09; tener alternativas o ser una función común no basta, y no se deben inventar defectos para diversificar respuestas. La variación esperada procede de aplicar los criterios a la mecánica de cada idea.
- El roast pide una frase sencilla y cotidiana, de hasta 200 caracteres, vinculada a un detalle concreto e inocuo. El backend valida el formato, la longitud y el lenguaje explícitamente abusivo; la claridad y pertinencia siguen dependiendo del modelo.
- La actualización es una instrucción de generación, no una garantía semántica. La claridad del roast y la selección equilibrada de criterios deben revisarse con casos sintéticos y evaluación humana.

Incidente de respuesta de evaluación demasiado larga, 23 de octubre de 2026:

- Se reprodujo el fallo con una idea de carga de camiones. OpenAI devolvió `SIN_BLOQUEO_EVIDENTE` y los diez criterios, pero `validateModelDecision` rechazó la respuesta con `visible_message` porque `message` excedía el máximo neutral de 280 caracteres. Una reproducción emitió 287 caracteres.
- La causa era un límite contradictorio: el prompt permitía hasta 900 caracteres para cualquier respuesta, aunque el validador permite hasta 900 solo para `RECHAZADA`; los otros estados admiten 280 para que el mensaje quepa tras la introducción de tono.
- Se corrigió el prompt para aplicar por estado los mismos límites que el validador. No se almacenó el texto de la idea ni la respuesta completa.

## Páginas de error de la interfaz, 16 de octubre de 2026

- Las rutas desconocidas muestran el 404; un error de renderizado React muestra el 500; el límite temporal `ANONYMOUS_PROFILE_RATE_LIMITED` muestra el 429 con su ventana `Retry-After`. Los errores recuperables de API en formularios siguen en contexto.
- Se unificaron mascota y accesorios de cada lámina en tres ilustraciones PNG transparentes por estado, conservando sus escalas, posiciones y solapes. El marco existente aporta navegación, telón, público, tema y pie.
- Verificación: `pnpm --filter @grumphya/web test` (93 pruebas), `typecheck`, `lint` y `build` pasan. `pnpm --filter @grumphya/web test:e2e -- error-pages.spec.ts` pasó 4 pruebas Chromium en total: los dos nuevos casos de errores y los dos E2E preexistentes.
- La apertura de los tres estados quedó disponible en las pestañas de revisión de `http://127.0.0.1:4173/__preview/errors/{404,429,500}`. Las previsualizaciones se compilan solo para desarrollo. En producción, el servidor SPA debe redirigir las rutas frontend desconocidas a `index.html` para que React pueda representar el 404.

## Contraste del modo oscuro, 16 de octubre de 2026

- Se ajustaron colores de texto para superficies claras en controles, avisos,
  listados y menús móviles; los diálogos oscuros conservan texto claro y sus
  acciones sobre fondos claros usan texto oscuro. La regla visual queda en
  `doc/ui.md`.
- Verificación: `pnpm test` pasó con API 239/239 y web 93/93; 11 pruebas de API
  que requieren PostgreSQL se omitieron. `pnpm lint`,
  `pnpm --filter @grumphya/web build` y `git diff --check` pasaron. La revisión
  visual en modo oscuro no detectó texto claro sobre superficies claras en la
  vista inspeccionada.

## Carrera entre refresh y logout, 16 de octubre de 2026

- La migración `016_auth_refresh_rotation_history.sql` añade `previous_refresh_token_hash`. Cada rotación conserva solo el hash del refresh inmediatamente anterior y lo reemplaza en la siguiente; logout acepta el hash actual o el inmediatamente anterior. No persiste tokens claros ni permite revocar con tokens de dos o más rotaciones atrás.
- La regresión HTTP hace refresh y luego logout con la cookie anterior, como en dos solicitudes concurrentes ya despachadas, y comprueba que el refresh actual queda revocado. El test de repositorio comprueba la búsqueda por hash actual o anterior; en la web, las renovaciones concurrentes comparten un solo refresh y un logout no restaura una sesión borrada.
- En la ejecución de revisión de seguridad: API 244 pasaron y 11 se omitieron; las pruebas de persistencia PostgreSQL no se ejecutaron por falta de sus variables de test. Tras los ajustes de UI, la suite web final pasó con 95 pruebas en 20 archivos; typecheck y lint web también pasaron. Las pruebas dirigidas de sesión concurrente pasaron 7/7; lint y typecheck de API pasaron. La integración de la migración con PostgreSQL aislado queda pendiente de esa configuración.
- Alcance restante: la web deduplica refresh concurrentes dentro de una pestaña, pero no coordina entre pestañas. En ese caso el backend falla cerrado y una pestaña podría solicitar un nuevo login aunque otra conserve una sesión válida; no se considera un bypass de autenticación. La coordinación single-flight entre pestañas queda pendiente.

## Integración de `origin/main` en `feat/ui`, 16 de octubre de 2026

- El merge incorpora las protecciones de sesión concurrente, validación de
  criterios de evaluación y los ajustes recientes de límites y autenticación.
  Se conservaron las rutas de error, la persistencia del tema y los cambios de
  UI de esta rama; los menús portaleados reciben explícitamente el tema activo.
- Verificación tras resolver conflictos: `pnpm test` pasó con API 244/244 y
  web 107/107; 11 pruebas de API que requieren PostgreSQL se omitieron.
  `pnpm lint`, `pnpm typecheck` y `pnpm build` pasaron.

## Copy de resultados de evaluación, 17 de octubre de 2026

- Se retiró el prefijo «¿Menudo chiringuito:» de la respuesta de evaluación en tono `hard`; el titular del tono permanece separado de la explicación.
- La API transforma códigos internos de criterios (`C01`–`C10`) y reason codes en descripciones en español común antes de devolver el mensaje público. El prompt también indica que no se deben exponer esos códigos.
- TDD: se añadieron regresiones para el prefijo y para mensajes que incluyan `C05`/`C10`; pruebas focalizadas de renderer, servicio y adaptador de evaluación pasan (85/85).

## Regresión completa y arranque Docker, 17 de octubre de 2026

- `pnpm test`: API 284 aprobadas y 14 omitidas (34 archivos pasaron; 8 se omitieron); web 120 aprobadas. Las pruebas omitidas requieren una URL de base de datos de pruebas aislada que no estaba configurada en esta ejecución.
- `pnpm lint`: correcto. La comprobación de seguridad y validación de Compose también pasó.
- Smoke test de la aplicación en Compose: API, PostgreSQL y pgvector saludables; web respondió HTTP 200. Los servicios API y web se ejecutan como `node`; API y PostgreSQL leen sus ajustes mediante entrypoints y secretos respaldados por archivos locales. El entrypoint de API aplica allowlists separadas por archivo de origen: DB/JWT/HMAC desde `.env.docker`, configuración OpenAI desde `.env.openai` y solo `OPENAI_API_KEY` desde `.env`.
- No se hizo una llamada live al proveedor OpenAI como parte de esta verificación. Los tests no demuestran disponibilidad de credenciales ni una evaluación en producción.
- Rotación de secretos Docker local es manual. Recrear API vuelve a leer cambios de configuración; cambiar la contraseña DB requiere actualizar el rol PostgreSQL existente de forma coordinada. Los detalles y efectos de rotación están en [credenciales](credentials.md).

## Evaluación del evaluador, telemetría e integración continua, 19 de octubre de 2026

- Se añadió un corpus sintético y un runner que compara modelos y versiones de prompt con el validador de producción; el informe contiene solo acuerdos agregados. No se llamó a un modelo real durante esta verificación porque el benchmark puede incurrir en coste.
- Se instrumentaron evaluación, embeddings, equivalencia semántica y roast con eventos JSON sin contenido de ideas, mensajes, cuentas ni sesión. El coste queda `null` hasta configurar las tarifas por operación.
- El workflow de CI instala con lockfile congelado, prepara los tests PostgreSQL con una base `pgvector` temporal y ejecuta `format:check`, lint, typecheck, tests, build y Playwright aislado; el job separado audita dependencias e imagen. `pnpm audit --prod --audit-level high` no encontró vulnerabilidades conocidas y `docker build --pull` terminó correctamente. Se verificó la suite con una base temporal real; las pruebas de persistencia y aislamiento entre cuentas pasaron tras habilitar pgvector en `public` y aportar el secreto de test.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` y `pnpm test:e2e` pasaron. Playwright: 10/10. Se corrigió el selector de registro y se elevó el límite de refresh solo en el servidor E2E para impedir que otras pruebas compartidas agoten su rate limit.
- Alcance de verificación en esa ejecución: no se ejecutó Trivy localmente porque la revisión automática rechazó montar `docker.sock` en un contenedor externo. Trivy queda configurado para el job CI. Entonces `pnpm format:check` detectó 24 archivos preexistentes fuera del formato y aún no era una puerta de CI. Después se normalizaron 28 archivos y el chequeo se incorporó como puerta bloqueante de `quality-and-e2e`; cualquier cambio futuro que incumpla Prettier hará fallar ese job. El procedimiento vigente está en [`ci-cd.md`](ci-cd.md).

## Corrección del escaneo de la imagen, 19 de octubre de 2026

- El job `supply-chain` ahora construye y analiza la etapa `production` del Dockerfile, que excluye herramientas y dependencias de desarrollo. La imagen final usa `node:24.21.0-trixie-slim`; `docker build --pull --target production` terminó correctamente y `pnpm audit --prod --audit-level high` no encontró vulnerabilidades conocidas en las dependencias de producción.
- Antes de Trivy, CI ejecuta `scripts/test-production-image.mjs` contra la imagen construida. La comprobación valida dependencias de runtime, migraciones incluidas, ejecución con usuario no-root y ausencia de ejecutables de gestores de paquetes; no inicia la API ni requiere PostgreSQL. El comando local está documentado en [`ci-cd.md`](ci-cd.md).
- No se volvió a ejecutar Trivy localmente: la revisión automática rechazó montar `docker.sock` en un contenedor externo. La ejecución de Trivy posterior al cambio queda pendiente de un evento que active CI. En esa fecha, el workflow se activaba en pull requests y pushes a `main`; los disparadores actuales se describen en [`ci-cd.md`](ci-cd.md).

## Verificación de correo para nuevas cuentas, 20 de octubre de 2026

- El alta ahora crea una cuenta pendiente y guarda solo el hash SHA-256 del token de verificación de un solo uso. No crea sesión, suscripción, cuota ni compra simulada antes de verificar el correo y confirmar la contratación. Las cuentas que ya estaban activas mantienen su acceso.
- El mensaje de verificación se envía por el puerto SMTP de la API con plantilla Grumphya HTML y texto plano. El enlace usa `WEB_ORIGIN`, la ruta `/verificar-cuenta` y un fragmento URL para que el token no viaje en solicitudes HTTP ni en logs del servidor. Sin SMTP configurado en desarrollo, MailService guarda una previsualización en memoria (no envía correo) consultable en `GET /api/dev/mail-preview/latest`; el endpoint no está disponible en producción.
- El reenvío responde de forma genérica, rota el token anterior, aplica espera y máximo por cuenta, y queda sujeto al límite por IP existente. Si SMTP falla, el registro queda pendiente y se puede solicitar otro enlace sin repetir el alta. No se registran token, contraseña ni correo en logs.
- Las pruebas locales cubren el flujo de registro pendiente, verificación y confirmación, expiración/reutilización del token, reenvío, fallo de entrega y ausencia de permisos antes de confirmar. SMTP se simula en pruebas; no se envió correo real.
- El recorrido Playwright de registro también sigue la secuencia completa: alta pendiente, lectura del enlace desde la previsualización local de correo, verificación y confirmación de compra simulada. La confirmación inicia sesión y el recorrido llega al perfil con esa sesión creada; después prueba logout, un nuevo login y el borrado de la cuenta. El servidor E2E usa repositorios y mail preview en memoria; no envía correo real ni requiere PostgreSQL. Así se cubre el flujo vigente de verificación en el navegador, en vez del contrato antiguo de activación directa.
- El E2E dedicado de «Ni galletitas ni galletitos» confirma que descartar el popup se conserva entre secciones y tras recargar. El `storageState` compartido inicia los demás recorridos con ese aviso descartado para que no bloquee la interacción que están probando.

## Restablecimiento de contraseña y respuestas desde el panel, 20 de octubre de 2026

- Se añadió solicitud genérica de recuperación, token de un solo uso con vigencia de 20 minutos, actualización de contraseña bcrypt y revocación transaccional de sesiones. Los enlaces usan fragmento URL y el envío SMTP falla de forma cerrada invalidando el token.
- Se añadió `postgres-password-reset.repository.postgres.spec.ts`, que crea un esquema aleatorio en `REGISTRATION_TEST_DATABASE_URL` y lo elimina al terminar. En esta ejecución local la variable no estaba configurada, así que la prueba de integración PostgreSQL se omitió. La salida de dos tests pasados corresponde al spec unitario `postgres-password-reset.repository.spec.ts`; no acredita una ejecución contra PostgreSQL. CI configura la URL de test; no se debe apuntar a una base de producción.
- La bandeja admin puede enviar respuesta al correo de la cuenta; el texto de respuesta no se persiste. El estado incierto requiere revisar el webmail antes de un segundo intento. El correo de contacto tiene límite de tres intentos y estado de envío, con vista previa local sin SMTP.
- Validación local final: `pnpm lint`, `pnpm typecheck` y `pnpm format:check` pasaron. `pnpm test`: API 452 pasados y 20 omitidos; web 208 pasados. El test de integración PostgreSQL de reset está entre los omitidos por falta de `REGISTRATION_TEST_DATABASE_URL`; no se comprobó aquí el comportamiento de persistencia real. No se probó entrega SMTP real.

## Auditoría completa de dependencias, 20 de octubre de 2026

- Se actualizaron Vitest a `4.1.12` en API y web y se fijó `shell-quote` en `1.12.0` mediante un override del workspace para corregir los hallazgos del árbol de dependencias.
- `pnpm audit --audit-level moderate` (dependencias de producción y desarrollo del workspace) y `pnpm audit --prod --audit-level high` (solo dependencias de producción) terminaron ambos con `No known vulnerabilities found`.
- Los umbrales, alcances y comandos están descritos en [`ci-cd.md`](ci-cd.md); la auditoría completa incluye herramientas de desarrollo que no forman parte de la imagen final.

## Ajustes de evaluación, responsive y correo, 22 de octubre de 2026

- El timeout por defecto de evaluación pasó de 60.000 a 120.000 ms; el máximo configurable sigue en 120.000 ms. La normalización semántica y la comparación de candidatas conservan 30.000 ms cada una. El proveedor de evaluación recibe la idea y la política, sin el tono; el renderer del servidor añade una introducción `soft` o un prefijo `hard`. En rechazos se validan `hardSetup` y `hardConsequence`, aunque el copy visible actual no los incorpora.
- Los E2E comprueban algunos aspectos del layout móvil a 390 × 844 px; la inspección visual manual en ese viewport sigue pendiente. Se recoloca la mascota de sección tras el contenido principal en móvil, se corrige la capa de diálogos y se acerca el error del avatar al botón que lo origina. Las plantillas HTML de correo usan ahora la paleta y el estilo visual de Grumphya.
- Verificación comunicada: `pnpm lint` pasó. `pnpm test`: web, 224 pruebas en 38 archivos pasaron; API, 448 pasaron y 20 quedaron omitidas en 12 archivos. Otras 19 pruebas HTTP de API no pudieron abrir `127.0.0.1` y fallaron con `listen EPERM: operation not permitted`; esto limita la verificación HTTP en este entorno. Los specs focalizados añadidos del hook de diálogo y middleware pasaron (2 y 20 pruebas, respectivamente). No se comunicó resultado de `test:e2e` para esta actualización.

## Valor de usuario en la evaluación, 23 de octubre de 2026

- RED: las pruebas nuevas fallaron porque `VALOR_USUARIO_NO_DEFINIDO` aún no era un motivo válido de C07, el renderer no ocultaba ese código y el prompt no fijaba la regla. GREEN: `grumphya-concept-v8` hace que una función que solo cuenta o registra una acción, sin explicar qué problema resuelve o qué resultado útil aporta, suspenda C07 con nota inferior a 15. Una finalidad expresada como bienestar, aprendizaje, ahorro, comodidad o entretenimiento sí cuenta como valor; no se exige resolver un dolor ni demostrar demanda externa. La novedad en C10 no puede compensar el suspenso de C07.
- El backend valida el nuevo motivo exclusivamente en C07, lo incluye en el esquema de salida y lo convierte en una explicación legible sin filtrar el código interno. El banco añade un ejemplo sintético de recuento sin valor; no incorpora la idea real comunicada por una persona usuaria.
- La regla no afirma que nadie vaya a usar una idea: distingue entre demanda empírica desconocida y falta de valor descrito. No se cambia almacenamiento, cuotas, contrato HTTP ni tratamiento de ideas aprobadas.
- Verificación de este cambio: las cuatro suites focalizadas pasaron (116 pruebas); `pnpm quality:check` pasó formato, lint, typecheck, suite completa (API: 483 pasadas y 20 omitidas; web: 239 pasadas) y build. Las omitidas requieren `REGISTRATION_TEST_DATABASE_URL` para PostgreSQL. No se ejecutó el benchmark contra proveedor real ni se enviaron ideas a OpenAI.

## Ajustes de correo, responsive y disponibilidad de dictado, 24 de octubre de 2026

- La plantilla HTML de correo ahora centra su tarjeta mediante tablas con `align="center"`, ancho fluido y máximo de 600 px, para mejorar el centrado en clientes de correo que no aplican de forma consistente los márgenes CSS. El contenido de la tarjeta conserva su alineación propia; la versión de texto plano no cambia.
- Las comprobaciones E2E añadidas cubren que el perfil no desborde el viewport de 390 px, que «Borrar idea» tenga un objetivo de 40 × 40 px y que el callout de roast use una sola columna en móvil. Son aserciones de geometría/layout; no equivalen a una inspección visual manual en dispositivos reales.
- La detección de dictado ahora oculta el control en Android incluso si el navegador anuncia la API; se conserva la ruta de escritura manual. El reconocimiento sigue solicitando procesamiento local (`processLocally`) en `es-ES` y no activa una alternativa remota. Esta decisión evita ofrecer dictado en esa plataforma basándose solo en la presencia de la API.

## Corrección de vulnerabilidades de dependencias, 24 de octubre de 2026

- Tras el fallo de `supply-chain` en CI, se corrigieron los avisos de severidad alta de `body-parser` anterior a `2.4.0` y `multer` anterior a `2.5.0`: `pnpm-workspace.yaml` fija los overrides de ambas dependencias en `2.4.0` y `2.5.0`, respectivamente, y `apps/api/package.json` declara `multer` directamente como `^2.5.0`.
- `pnpm audit --audit-level moderate` terminó sin vulnerabilidades conocidas en el árbol auditado.

## Ejemplos de productos conocidos en evaluación, 24 de octubre de 2026

- `grumphya-concept-v9` permite que un rechazo con C10 como primer veto (`stop_at: C10`) muestre un nombre de producto solo cuando el evaluador reconoce con alta confianza una coincidencia de funciones esenciales. Un competidor de categoría no basta. El campo es contexto orientativo: no se buscan datos externos, no se afirma disponibilidad actual y no cambia nota ni veredicto.
- El backend conserva el nombre solo si es texto plano seguro y C10 es el primer veto (`stop_at: C10`); descarta a `null` URLs, correos, teléfonos, controles, contenido fuera del patrón permitido y ejemplos que no correspondan a ese primer veto. El campo es accesorio: su omisión no altera una evaluación válida. La API y la interfaz lo tratan como opcional para mantener compatibilidad con resultados previos.
- La interfaz rechaza u omite `existingProductExample` si la decisión no es `RECHAZADA`, para no mostrar el ejemplo fuera de un rechazo.
- TDD: se cubren nombre válido, campo en casos no aplicables, coincidencia cuando C10 es el primer veto (`stop_at: C10`), omisión de nombres inseguros y renderizado del nombre en el resultado.
- Verificación: `pnpm format:check`, `pnpm lint` y `pnpm typecheck` pasan. La primera ejecución de la suite completa dentro del sandbox falló porque las pruebas HTTP no pudieron abrir sockets (`listen EPERM`); al repetirla fuera del aislamiento, la API pasó 491 pruebas y omitió 20 por no tener configurada la base PostgreSQL, y la web pasó 246/246. Las suites enfocadas pasaron API 97/97 y web 17/17. `pnpm build` pasó. No se realizó una llamada real al proveedor.

## Correcciones tras errores intermitentes de scoring, 24 de octubre de 2026

- `existingProductExample` ya no puede mostrar los marcadores literales `"null"` o `"undefined"`. La API y el adaptador web omiten esos valores y cualquier ejemplo inseguro/no aplicable sin invalidar una evaluación válida.
- Si falla una evaluación que continuaba un aviso de similitud, el servidor libera la reserva de uso y también el claim de continuación. El usuario puede reintentar la misma solicitud con su clave de idempotencia; una continuación simultánea sigue estando limitada a una.
- Las pruebas cubren el marcador `null`, ejemplos inválidos, resultado de scoring conservado y reintento de continuación. Falta confirmar la causa concreta de un `INVALID_EVALUATION_RESPONSE` observado en producción: se necesita el campo agregado `latestDiagnosticCode` (`visible_message`, `decision_semantics`, etc.). No se envían ideas ni salidas del modelo a los logs.

## Ampliación de cobertura de persistencia y correo, 27 de octubre de 2026

- Se ampliaron las pruebas de `PostgresRegistrationRepository` y `PostgresContactMessageRepository`; se añadieron pruebas del repositorio PostgreSQL de uso anónimo, de cuotas de planes y del transporte SMTP.
- El transporte SMTP ahora destruye el socket cuando la conexión TCP/TLS falla o vence antes de iniciar el envío, evitando dejar sockets abiertos en esos errores.
- En la corrida completa de API con permiso para enlazar `127.0.0.1`, pasaron 688 pruebas y 21 quedaron omitidas por requisitos de base de datos. La cobertura API resultante y la cobertura web de referencia están registradas en [`quality-baseline.md`](quality-baseline.md). Sin permiso de loopback, las pruebas HTTP que abren sockets fallan con `listen EPERM`, por lo que esa corrida restringida no sirve para medir la suite completa.
- El siguiente foco de cobertura es `PostgresAdminDashboardRepository` (75,86 % statements, 55,31 % branches, 69,23 % functions y 79,24 % lines en esa medición). Después se pueden definir umbrales graduales con excepciones justificadas para arranque y adaptadores externos.

## Ampliación de cobertura y umbrales graduales, 27 de octubre de 2026

- Las pruebas de `PostgresAdminDashboardRepository` suben de 12 a 24 y cubren snapshot vacío y sin cuentas, listado y estados de respuesta de mensajes, reintento revisado en webmail, registros de uso AI, clasificación de errores y reutilización de migración. El repositorio alcanza 100 % de sentencias, líneas y funciones, y 87,23 % de ramas.
- Se añaden cuatro pruebas de `PostgresUserAvatarRepository`: avatar anterior bajo bloqueo transaccional, ausencia de avatar, cuenta inactiva y migración fallida/reutilizada. El repositorio queda con 100 % de líneas, funciones y ramas.
- Se añaden cuatro pruebas para `PostgresAccessTokenSessionLookup` y `hashAccessToken`, que comprueban sesiones activas/no coincidentes, la creación del pool por defecto y el digest estable del token. El archivo alcanza 100 % de líneas, funciones y ramas.
- `AnonymousUsageService` pasa de 6 a 18 pruebas. Se cubren validación de token y hashes de idempotencia, perfil no disponible, cuotas restantes, reservas y sus errores mapeados, commit, liberación y propagación de fallos desconocidos. Alcanza 100 % de líneas y funciones, y 96,88 % de ramas.
- `PlanUsageService` amplía su cobertura de validación de UUID/ámbitos/hashes, reservas duplicadas o en curso, planes ausentes, cuota agotada y fallos al confirmar/liberar/registrar roasts históricos. Comprueba también que los detalles internos de persistencia no se filtren en respuestas 503. Alcanza 100 % de líneas y funciones, y 94,74 % de ramas.
- `MailService` pasa de 3 a 17 pruebas. Se cubren configuración de producción, puertos y dirección de remitente, entrega SMTP simulada, rechazo de entrega, previsualizaciones locales y validación de destinatario, asunto, `replyTo` y cuerpos. Un fallo SMTP se propaga y no crea una previsualización local. Alcanza 96,77 % de líneas, 96,43 % de ramas y 100 % de funciones.
- `UserDeleteController` pasa de una a cuatro pruebas. Se comprueba que una petición sin usuario autenticado, una cuenta que el repositorio no encuentra y un fallo inesperado del repositorio no borren la cookie de refresh; el borrado exitoso sí la limpia. El controlador alcanza 100 % de líneas, ramas y funciones.
- Vitest aplica umbrales globales iniciales: API 80 % de sentencias, 75 % de ramas, 85 % de funciones y 85 % de líneas; web 82 %, 78 %, 80 % y 85 %, respectivamente. No son mínimos por archivo; se elevarán por etapas cuando la cobertura dé margen.
- La suite completa de API pasa con 750 pruebas y 21 omitidas por requisitos de base aislada; la cobertura es 89,63 % de sentencias, 83,70 % de ramas, 94,47 % de funciones y 91,14 % de líneas. Web pasa 321 pruebas; cobertura: 86,98 %, 84,01 %, 87,42 % y 89,66 %, respectivamente. La comprobación de umbrales se valida con `pnpm --filter @grumphya/api test:coverage` y `pnpm --filter @grumphya/web test:coverage`.
- También pasan `pnpm --filter @grumphya/api lint`, `pnpm --filter @grumphya/api typecheck`, `pnpm format:check` y `git diff --check`.
- El siguiente foco recomendado es `PasswordResetController`, con 66,67 % de líneas en esta corrida. Se dejan fuera del objetivo los entrypoints y comandos operativos que no se benefician de pruebas unitarias artificiales.

## Cobertura del controlador de recuperación de contraseña, 27 de octubre de 2026

- Se añaden dos pruebas de `PasswordResetController` para confirmar que los endpoints de solicitud y finalización delegan el cuerpo al servicio y devuelven su resultado. El controlador alcanza 100 % de sentencias, líneas, funciones y ramas.
- La suite completa de API pasa con 752 pruebas y 21 omitidas por requisitos de base aislada. La cobertura es 89,68 % de sentencias, 83,70 % de ramas, 94,74 % de funciones y 91,20 % de líneas.
- `pnpm --filter @grumphya/api lint`, `pnpm --filter @grumphya/api typecheck`, `pnpm format:check` y `git diff --check` pasan. La medición de cobertura se ejecutó con permiso para enlazar `127.0.0.1`; el sandbox bloquea las pruebas HTTP con `listen EPERM`.
- El siguiente foco recomendado es `SubmitContactMessageController`, con 66,67 % de líneas en esta medición.

## Cobertura del controlador de mensajes de contacto, 27 de octubre de 2026

- Se añaden seis pruebas de `SubmitContactMessageController`: envío y reintento exponen solo campos públicos; los errores de dominio se traducen a respuestas HTTP y los errores inesperados se propagan intactos. El controlador alcanza 100 % de sentencias, líneas, funciones y ramas.
- La suite completa de API pasa con 758 pruebas y 21 omitidas por requisitos de base aislada. La cobertura es 89,87 % de sentencias, 83,86 % de ramas, 94,87 % de funciones y 91,40 % de líneas.
- `pnpm --filter @grumphya/api lint`, `pnpm --filter @grumphya/api typecheck`, `pnpm format:check` y `git diff --check` pasan. La cobertura completa se ejecutó con permiso para enlazar `127.0.0.1`; el sandbox bloquea las pruebas HTTP con `listen EPERM`.
- El siguiente foco recomendado es `UserAvatarController`, con 83,33 % de líneas y 66,67 % de funciones en esta medición.

## Cobertura del controlador de avatar, 27 de octubre de 2026

- Se amplían las pruebas de `UserAvatarController` para cubrir los tres MIME permitidos, el rechazo de SVG, la conversión de `UserAvatarError` a una respuesta HTTP segura y la propagación de errores inesperados. El controlador alcanza 100 % de sentencias, líneas, funciones y ramas.
- La suite completa de API pasa con 764 pruebas y 21 omitidas por requisitos de base aislada. La cobertura es 90,00 % de sentencias, 83,95 % de ramas, 95,14 % de funciones y 91,54 % de líneas.
- `pnpm --filter @grumphya/api lint`, `pnpm --filter @grumphya/api typecheck`, `pnpm format:check` y `git diff --check` pasan. La cobertura completa se ejecutó con permiso para enlazar `127.0.0.1`; el sandbox bloquea las pruebas HTTP con `listen EPERM`.
- El siguiente foco recomendado es `RegistrationController`, con 85,71 % de líneas y 89,47 % de funciones en esta medición.

## Cobertura del controlador de registro, 27 de octubre de 2026

- La suite unitaria de `RegistrationController` se amplía a 26 pruebas que cubren todas sus rutas, incluidos errores de sesión, validación de payloads y respuestas delegadas al servicio. El controlador alcanza 100 % de sentencias, líneas y funciones, y 87,09 % de ramas en la cobertura global.
- La suite completa de API pasa con 790 pruebas y 21 omitidas por requisitos de base aislada. La cobertura es 90,32 % de sentencias, 84,35 % de ramas, 95,41 % de funciones y 91,86 % de líneas.
- `pnpm --filter @grumphya/api lint`, `pnpm --filter @grumphya/api typecheck`, `pnpm format:check` y `git diff --check` pasan. La cobertura completa se ejecutó con permiso para enlazar `127.0.0.1`; el sandbox bloquea las pruebas HTTP con `listen EPERM`.
- El siguiente foco recomendado es `AdminDashboardController`, con 80 % de líneas en esta medición.

## Corrección de expiración inmediata de cookies, 27 de octubre de 2026

- `privateCookieOptions` omitía `maxAge: 0` porque trataba cualquier valor falsy como si no se hubiera proporcionado. Ahora solo omite `maxAge` cuando es `undefined`, por lo que conserva la expiración inmediata usada para borrar cookies.

## Cobertura del panel administrativo y nueva línea base, 27 de octubre de 2026

- Se añaden dos pruebas de `AdminDashboardController`: una verifica que los errores de dominio al responder mensajes de contacto se convierten en una excepción HTTP con código, estado y mensaje previstos; la otra confirma que un fallo inesperado se propaga sin que el controlador fabrique una respuesta con detalles internos. El controlador alcanza 100 % de sentencias, ramas, funciones y líneas (7 pruebas).
- La cobertura completa de API pasa con 792 pruebas y 21 omitidas, estas últimas condicionadas a bases de datos aisladas. La cobertura es 90,40 % de sentencias, 84,43 % de ramas, 95,41 % de funciones y 91,95 % de líneas; se actualiza [`quality-baseline.md`](quality-baseline.md).
- La cobertura por archivo identifica `HealthController` y `LocalMailPreviewController` como los controladores con menor cobertura de líneas (37,5 % cada uno). El siguiente paso es valorar pruebas para las respuestas de disponibilidad del health check y para las restricciones de entorno/sin previsualización del endpoint local de correo.
- Pasan `pnpm --filter @grumphya/api lint`, `pnpm --filter @grumphya/api typecheck`, `pnpm format:check` y `git diff --check`. La cobertura completa necesitó permiso para abrir servidores HTTP en `127.0.0.1`; dentro del sandbox esas pruebas fallaban con `listen EPERM`.

## Cobertura de health check y previsualización local de correo, 27 de octubre de 2026

- Se añaden cuatro pruebas de `HealthController`: estado saludable con revisión local o desplegada, extensión pgvector ausente y error de consulta. La respuesta de fallo sigue siendo 503 genérico. Se añaden tres pruebas de `LocalMailPreviewController`: endpoint oculto en producción, previsualización ausente y previsualización local disponible. Ambos controladores alcanzan 100 % de sentencias, ramas, funciones y líneas.
- La cobertura completa de API pasa con 798 pruebas y 21 omitidas, condicionadas a bases PostgreSQL aisladas. La cobertura es 90,72 % de sentencias, 84,75 % de ramas, 95,68 % de funciones y 92,23 % de líneas; la línea base se actualiza en [`quality-baseline.md`](quality-baseline.md).
- Al excluir entrypoints y módulos de preparación de pruebas, el siguiente foco recomendado es `AnonymousUsageController` (85,71 % de líneas), que maneja cuotas y errores expuestos por la API.
- La cobertura de API se ejecutó con permiso para abrir servidores HTTP en `127.0.0.1`; dentro del sandbox esas pruebas fallaban con `listen EPERM`.

## Cobertura de uso anónimo y lectura de cookies, 27 de octubre de 2026

- `AnonymousUsageController` amplía su suite de 14 a 21 pruebas. Se cubren el encabezado `Retry-After` ante límites temporales, el fallback de IP, proveedores ausentes, errores del flujo autenticado y validación adicional del mensaje e idempotency key. Llega a 100 % de sentencias, líneas y funciones, y 98,27 % de ramas.
- Se añaden cinco pruebas a `read-cookie.ts`, utilitario compartido por evaluación, registro y uso anónimo: ausencia de cabecera, espacios, decodificación, valores con `=` y codificación inválida. Alcanza 100 % de sentencias, ramas, funciones y líneas.
- La cobertura completa de API pasa con 810 pruebas y 21 omitidas por requisitos de bases PostgreSQL aisladas. La cobertura es 91,06 % de sentencias, 85,15 % de ramas, 95,68 % de funciones y 92,61 % de líneas; la línea base se actualiza en [`quality-baseline.md`](quality-baseline.md).
- El siguiente foco de cobertura es `InMemoryVerificationDelivery` (`verification-delivery.ts`), con 83,33 % de líneas; su adaptador conserva el token en memoria para los flujos de prueba.
- La corrida completa necesitó permiso para enlazar `127.0.0.1`; las pruebas HTTP fallan con `listen EPERM` dentro del sandbox.

## Cobertura de entrega de verificación y registro, 27 de octubre de 2026

- Se añade una prueba que confirma que `InMemoryVerificationDelivery` conserva el token más reciente para los flujos de prueba. El archivo `verification-delivery.ts` alcanza 100 % de sentencias, ramas, funciones y líneas.
- `RegistrationService` amplía su suite de 18 a 23 pruebas. Se cubren planes e intents inválidos, payloads mal formados, origen web no válido con liberación del cooldown, errores de persistencia traducidos a respuesta genérica y rechazo de tokens inválidos antes de consultar el repositorio. La cobertura focal del servicio es 87,27 % de sentencias, 81,69 % de ramas, 97,14 % de funciones y 89,8 % de líneas.
- La cobertura completa de API pasa con 816 pruebas y 21 omitidas por requisitos de bases PostgreSQL aisladas. La cobertura global es 91,43 % de sentencias, 85,72 % de ramas, 95,82 % de funciones y 92,98 % de líneas; la tabla de [`quality-baseline.md`](quality-baseline.md) queda actualizada.
- El siguiente foco recomendado es `IdeaSubmissionService` (86,14 % de líneas), que orquesta las reservas de uso, la evaluación y la persistencia del resultado.
- La corrida completa necesitó permiso para enlazar `127.0.0.1`; las pruebas HTTP fallan con `listen EPERM` dentro del sandbox.

## Cobertura de envío de ideas y recuperación de contraseña, 27 de octubre de 2026

- Se añaden seis pruebas de `IdeaSubmissionService` para validar el usuario autenticado antes de consultar, traducir fallos de idempotencia y búsqueda semántica, liberar cuota si el buscador no está configurado o falla, ocultar errores al actualizar el contador de similitudes y responder de forma segura si falla la consulta previa de una continuación. La suite focal queda en 37 pruebas y el servicio alcanza 89,52 % de sentencias, 76,51 % de ramas, 95,65 % de funciones y 90,59 % de líneas.
- Se añaden tres pruebas de `PasswordResetService`: validación de solicitudes mal formadas, finalización correcta con almacenamiento solo del hash y anulación del token sin envío si `WEB_ORIGIN` contiene una ruta inesperada. La suite focal queda en 10 pruebas y el servicio alcanza 92,2 % de sentencias, 83,33 % de ramas, 93,75 % de funciones y 95,65 % de líneas.
- La cobertura completa de API pasa con 825 pruebas y 21 omitidas por requisitos de bases PostgreSQL aisladas. La cobertura global es 91,86 % de sentencias, 86,00 % de ramas, 95,82 % de funciones y 93,41 % de líneas; se actualiza [`quality-baseline.md`](quality-baseline.md).
- El siguiente foco recomendado es `PostgresPasswordResetRepository` (86,96 % de líneas), priorizando ramas que puedan comprobarse con su suite unitaria aislada.
- La corrida completa necesitó permiso para enlazar `127.0.0.1`; dentro del sandbox las pruebas HTTP fallan con `listen EPERM`.

## Reintentos y validación de uso anónimo, 27 de octubre de 2026

- Se añaden dos pruebas de `AnonymousUsageController`: la validación del mensaje y de la clave de idempotencia ocurre antes de reservar uso (incluye arrays, valores vacíos y UUID inválidos, y conserva saltos de línea válidos); además, un roast cacheado puede reintentarse si falla la escritura del ranking después de consumir el uso.
- La corrida final de API pasa con 827 pruebas aprobadas y 21 omitidas por requisitos de bases PostgreSQL aisladas. Las 827 aprobadas incluyen estos dos casos. La cobertura se mantiene en 91,86 % de sentencias, 86,00 % de ramas, 95,82 % de funciones y 93,41 % de líneas; la tabla de [`quality-baseline.md`](quality-baseline.md) refleja el total final.

## Cobertura del repositorio de recuperación de contraseña, 27 de octubre de 2026

- Se añaden tres pruebas unitarias de `PostgresPasswordResetRepository`: devuelve `null` si no hay una cuenta elegible, invalida únicamente el token asociado al usuario y revierte la transacción/libera la conexión si falla el cambio de contraseña. El repositorio llega a 100 % de sentencias, líneas, ramas y funciones sin necesitar una base de datos.
- `pnpm --filter @grumphya/api exec vitest run src/password-reset/postgres-password-reset.repository.spec.ts` pasa con 5 pruebas.

## Cobertura de fallos del proveedor de evaluación OpenAI, 27 de octubre de 2026

- Se amplía `OpenAiEvaluationPort` con casos para errores HTTP 403, 429, 5xx y otros 4xx; errores de transporte frente a cancelación solicitada por el llamador; JSON malformado; texto de decisión inválido; respuestas incompletas sin truncamiento por tokens; y citas que no aparecen literalmente en la idea. El adaptador queda en 97,8 % de sentencias, 100 % de líneas y funciones, y 95 % de ramas.
- La corrida final de API pasa con 838 pruebas aprobadas y 21 omitidas por requisitos de bases PostgreSQL aisladas. La cobertura global sube a 92,31 % de sentencias, 86,52 % de ramas, 95,95 % de funciones y 93,79 % de líneas; se actualiza [`quality-baseline.md`](quality-baseline.md).
- `pnpm test` pasa con 838 pruebas API aprobadas, 21 omitidas y 321 pruebas web aprobadas. También pasan `pnpm lint`, `pnpm typecheck`, `pnpm format:check` y `git diff --check`.
- El siguiente foco recomendado es `OpenAiIdeaEquivalencePort` (87,5 % de líneas); la medición completa de API necesitó permiso para enlazar `127.0.0.1` en las pruebas HTTP.

## Diez incrementos de cobertura del código de producción, 27 de octubre de 2026

1. `OpenAiIdeaEquivalencePort`: rechaza lotes sin candidatas o por encima de 20 antes de llamar al proveedor y acepta un lote válido de 20 candidatas.
2. `SubmitContactMessage`: detiene y traduce los reintentos de correo al alcanzar el límite, sin crear otro mensaje ni enviar correo.
3. `PostgresWorstIdeasRepository`: rechaza hashes de idempotencia vacíos antes de consultar la base de datos.
4. `UserAvatarService`: descarta imágenes que no puede decodificar antes de moderar o almacenar.
5. `DataRetentionService`: vuelve a inicializar el esquema y reintenta la limpieza tras un fallo temporal de migración.
6. `readTokenUsage`: ignora cantidades fraccionarias, negativas o superiores al entero seguro.
7. `OpenAiSemanticIdeaFingerprintPort`: oculta el cuerpo privado cuando el proveedor devuelve JSON malformado.
8. `detectSpecialIdeaCase`: no confunde texto vacío o compuesto solo por espacios con una idea demasiado breve.
9. `issueAccessToken`: rechaza identificadores de usuario inválidos antes de leer el secreto de firma.
10. `OptionalAccessTokenGuard`: rechaza cabeceras bearer malformadas sin consultar la sesión.

- Las diez suites focalizadas suman 101 pruebas aprobadas; los 12 archivos de pruebas focales de este bloque suman 125. La suite completa de API pasa con 854 pruebas aprobadas y 21 omitidas, e incluye el caso válido de 20 candidatas. Su cobertura global queda en 92,63 % de sentencias, 86,76 % de ramas, 96,36 % de funciones y 94,07 % de líneas. Web pasa 321 pruebas.
- También pasan `pnpm lint`, `pnpm typecheck`, `pnpm format:check` y `git diff --check`. La corrida de cobertura de API necesitó permiso para abrir listeners locales en `127.0.0.1`.
- El siguiente paso es evaluar el cableado de proveedores de `app.module.ts` con pruebas de integración que verifiquen configuración observable, no detalles internos de Nest.
