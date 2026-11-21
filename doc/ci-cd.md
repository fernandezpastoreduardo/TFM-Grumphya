# CI/CD y seguridad de la imagen

## Línea base Lighthouse sintética

El job `performance-lab` construye la web de producción y mide Inicio, Precios y
Peores ideas en móvil y escritorio con Lighthouse CI y Chromium local de
Playwright. La ejecución usa tres repeticiones por ruta y dispositivo; guarda
los informes solo durante el job. Sirve la compilación en `127.0.0.1:4173`.
El servidor de preview responde con datos públicos sintéticos y estables para
el ranking, la ficha demostrativa local y los cupos anónimos, y con `204` para
la analítica y la renovación de una sesión ausente. Así Lighthouse mide las
vistas cargadas y no estados de error por ausencia de API. Una petición
registrada con estado HTTP 4xx/5xx, URL inválida u origen distinto de
`http://127.0.0.1:4173` invalida el resumen. El widget externo del sello no se
solicita en este preview porque la página servida en `127.0.0.1` no lleva el
nonce CSP requerido para cargarlo bajo `strict-dynamic`; la ficha sintética
local sí se puede consultar. La muestra
sigue siendo de laboratorio y no incluye la latencia, el contenido cambiante,
la sesión ni las cabeceras de producción.
No visita producción ni envía mediciones de personas usuarias, y no instala RUM,
cookies o SDKs de analítica. Móvil usa el perfil predeterminado de Lighthouse;
escritorio usa `preset: desktop`, que aplica también su perfil de red y CPU.
Antes, el perfil de escritorio cambiaba solo viewport y agente de usuario, por
lo que conservaba el throttling móvil y podía parecer más lento que el móvil.
El resumen rechaza informes con error, rutas ajenas o métricas ausentes; cada
cifra mostrada es la mediana independiente de las tres ejecuciones, no una
captura única de Lighthouse. Evalúa las categorías de Lighthouse y usa umbrales
iniciales de aviso para puntuación, LCP (4,5 s) y CLS (0,25), no gates, hasta revisar la
variación de CI. Lighthouse de esta configuración no mide INP. Estas
puntuaciones son mediciones de laboratorio:
no representan Core Web Vitals de campo ni sustituyen datos RUM. `@lhci/cli`
está fijado como dependencia de desarrollo exacta y su árbol queda en
`pnpm-lock.yaml`.

Para comparar con Chrome DevTools, ejecuta Lighthouse tres veces en la misma
revisión, ruta, modo móvil/escritorio y configuración de limpieza de datos; usa
una ventana sin sesión. Incluso así, el inspector sobre `https://grumphya.com`
mide la red, el servidor y el contenido reales, incluido el sello cuando el
dominio está autorizado; CI usa localhost y datos sintéticos para el ranking.
La CPU del equipo y la versión de Chrome
también influyen. No atribuyas una diferencia a un cambio de código sin
igualar estas condiciones y revisar los informes de cada ejecución. Consulta
las guías de [emulación](https://github.com/GoogleChrome/lighthouse/blob/main/docs/emulation.md),
[variabilidad](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md)
y [Lighthouse en DevTools](https://developer.chrome.com/docs/devtools/lighthouse/).

El laboratorio entrega únicamente el resumen allowlisted como salida temporal
del job, sin artefactos. Después de que `supply-chain` confirme el despliegue,
un job posterior lo publica en el panel con un `POST` a
`/api/internal/lighthouse-quality/ingest`. CI solo ejecuta esta publicación
cuando el evento es `workflow_dispatch` con despliegue aprobado, la rama es
`main` y tanto `github.actor` como `github.triggering_actor` son
`fernandezpastoreduardo`. Configura los secretos
de Actions `LIGHTHOUSE_INGEST_URL` (exactamente
`https://<PRODUCTION_DOMAIN>/api/internal/lighthouse-quality/ingest`) y
`LIGHTHOUSE_INGEST_TOKEN`; el token debe coincidir con
`QUALITY_METRICS_INGEST_TOKEN` en el secreto runtime `grumphya_env` de la API y
ser Base64URL de al menos 32 caracteres. Se recomiendan 32 bytes aleatorios
codificados en Base64URL. Este formato funciona con la cabecera Bearer que
construye el workflow. El laboratorio no recibe el token; se entrega solo al
paso posterior autorizado. No se envía el secreto a jobs de pull request ni al
navegador. Si faltan los secretos de Actions, su formato no es válido o el
endpoint no responde, la publicación opcional se omite con un aviso sin hacer
fallar el laboratorio ni el despliegue. Los informes completos no se suben ni
se conservan como artefactos de Actions.

El script de resumen conserva solo commit, fecha, una ruta y dispositivo de
listas cerradas, cantidad de muestras, puntuaciones de categorías y métricas
técnicas; no envía informes LHR completos. La API valida la estructura y guarda
resultados sintéticos, sin datos de ideas, IP, cookies, sesiones o visitantes.
Tras desplegar la API/web y aplicar la migración, Jappy puede consultar
`GET /api/admin/web-quality` en la pestaña **Calidad web** de `/panel-control`.
La respuesta contiene hasta seis resúmenes: el más reciente para cada una de
tres rutas y dos dispositivos. `DataRetentionService` ejecuta la purga cada
hora y elimina resultados de más de 90 días.

## Evidencia medida y manifiesto Beta D

En una ejecución de release aprobada, `performance-lab` vuelve a construir la
web de producción sin fixtures y
`apps/web/scripts/collect-audit-browser-evidence.mjs` recoge evidencia con
Chromium local. Mide respuesta HTML, FCP, duración de interacción, violaciones
críticas WCAG A/AA, almacenamiento previo a la elección, orígenes de terceros,
casilla de lectura de la política seleccionada, política visible y aviso de IA.
La ficha de alta usa un plan sintético para mostrar el formulario; no se envían
ideas ni credenciales. El widget externo del sello se carga desde
`desarrolloseguro.org` y ese único origen está allowlisted. La medición es de
laboratorio sobre la build, no RUM ni dato de campo.

Con esos resultados, la evidencia de Compose (TLS, cabeceras y superficie de
red), los escaneos Trivy de vulnerabilidades y secretos, y los resultados de
calidad, E2E y dependencias, `scripts/build-release-audit-evidence.mjs` genera
17 señales distribuidas entre infraestructura, despliegue, dependencias,
autenticación, calidad, privacidad e IA. Los límites relevantes incluyen cero
violaciones críticas, respuesta HTML hasta 2.500 ms, FCP hasta 1.800 ms,
interacción hasta 200 ms, almacenamiento esencial, la casilla de lectura
seleccionada y solo orígenes de terceros permitidos. Si una señal falla, no se
crea ni firma el manifiesto y el job no puede desplegar.

Con `approve_production_deploy=true`, el smoke real de evaluación y roast con
OpenAI debe pasar además de los gates anteriores. CI liga las siete envolventes
de recursos al SHA y a los digests de las imágenes, firma cada envolvente con
EdDSA y firma también el manifiesto. El `audit-writer` valida y persiste esas
evidencias en el VPS durante el despliegue; la publicación no habilita ingesta
externa ni agrega rutas. En el despliegue de `e30caa3` del 20 de noviembre de
2026, el run [44772841616](https://github.com/fernandezpastoreduardo/TFM-Grumphya/actions/runs/44772841616)
pasó todos los gates, generó 17 señales `pass` y 0 `fail`, confirmó el
despliegue y publicó el resumen Lighthouse. El smoke firmado desde el
consumidor Desarrollo Seguro sigue siendo una comprobación separada; consulta
el estado y sus límites en [audit-integration.md](audit-integration.md).

El incidente del 28 de octubre de 2026 —recuperación SSH del VPS, actualización del helper y excepción restringida para la migración `034`— está documentado en [recuperación de acceso y despliegue](incident-vps-access-and-deployment-2026-10.md).

Los fallos de Compose y del preflight de migraciones del 29 de octubre de 2026 están resumidos en [fallos recientes de CI](ci-failures-2026-10-29.md).

El 6 de noviembre de 2026, el smoke de Compose detectó que la API no llegaba a estar sana. La imagen local del commit `de1935a` reprodujo el fallo: Nest trataba el parámetro opcional `Pool` de `PendingEmailVerificationService` como una dependencia `Function` y lanzó `UnknownDependenciesException`. `AuthSecurityModule` registra ahora el servicio mediante una factoría explícita. Tras el cambio, el smoke aislado de Compose pasó con salud de API y persistencia tras recrear servicios. Esta prueba usó una imagen local; no acredita una publicación en producción.

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests y mediante `workflow_dispatch`; no tiene un disparador `push`, así que ningún push inicia Actions automáticamente. Los jobs usan `ubuntu-24.04` para evitar cambios imprevistos de imagen y avisos por migraciones de `ubuntu-latest`. Tras checkout, el job `quality-and-e2e` ejecuta `bash scripts/ci-preflight.sh`, que ejecuta las políticas de contenedor y la prueba de TLS interno antes de configurar pnpm o instalar dependencias. El segundo genera certificados efímeros y verifica la cadena de confianza, SAN DNS/IP, uso TLS de servidor (EKU), correspondencia entre cada certificado y su clave privada, permisos privados y rechazo a sobrescribir material existente. Este preflight comprueba, entre otras políticas del contenedor, que `location = /` resuelva `/index.html` con `try_files` y no use `alias`, y que cada migración numerada desde `029_` inclusive empiece con `-- deployment-rollback-compatible: true`. Después fija Node mediante `.node-version` (`26.13.1`), pnpm (`12.5.1`) e instala desde `pnpm-lock.yaml` con `--frozen-lockfile`. El job prepara PostgreSQL/pgvector y ejecuta `pnpm ci:verify quality`, que comprueba la alineación de versiones de React y el registro de migraciones SQL y luego corre formato, lint, typecheck, tests y build. Dependabot agrupa las actualizaciones de versión y seguridad de React para mantener `react` y `react-dom` coordinados. También prueba la política del despliegue y el helper del VPS con comandos Docker simulados, incluidos checksum, compatibilidad de migraciones y rollback. El mismo comando está en el hook Husky `pre-commit`, así un cambio que falle una puerta local se rechaza antes de crear el commit. `e2e` ejecuta Playwright en la imagen oficial `mcr.microsoft.com/playwright:v1.65.1-noble`, que incluye Chromium y sus dependencias del sistema; el paquete del proyecto está fijado por el lockfile a `1.65.1`. `supply-chain` espera a los dos jobs de prueba y al job de auditoría. El hook Husky `pre-push` ejecuta `pnpm migrations:check` en todos los pushes. Si uno de los destinos es `refs/heads/main`, exige que el SHA enviado sea `HEAD`, el árbol esté limpio y la referencia remota previa esté disponible y sea antecesora del candidato; después ejecuta `pnpm sonar:verify` contra esa referencia y `pnpm test:e2e`. Cualquier fallo impide el push normal. Los pushes a ramas de trabajo no repiten SonarQube ni E2E. El hook se instala con `pnpm install --frozen-lockfile`, se puede omitir con `--no-verify` y no aplica a cambios enviados desde GitHub ni a otros clones; la sección [Análisis SonarQube](#análisis-sonarqube) documenta ese límite. Para preparar el navegador local, instala Chromium con `pnpm --filter @grumphya/web exec playwright install chromium`. CI no modifica ni formatea archivos automáticamente.

Los tests PostgreSQL reciben un servicio temporal `pgvector/pgvector:0.8.7-pg17-bookworm`. Antes de la suite, `prepare-test-database.ts` habilita `vector` en `public` y comprueba que está disponible. Cada spec que necesita persistencia crea un esquema aleatorio, ejecuta las migraciones registradas en `apps/api/src/infrastructure/database/run-migrations.ts` y lo elimina al terminar. El registro es explícito: añadir un archivo `.sql` sin añadirlo a esa lista deja el esquema de pruebas incompleto, aunque el archivo se incluya en la imagen de producción. Por eso `pnpm ci:verify quality` también ejecuta `pnpm migrations:check`, que compara el inventario de `apps/api/migrations/*.sql` con el registro del migrador; una migración nueva debe añadirse a ambos. La compatibilidad de rollback se valida aparte y no sustituye este control de coherencia. Playwright arranca API y web en puertos de test dedicados, con repositorios en memoria y el adaptador de evaluación simulado; no usa credenciales ni datos de desarrollo/producción. La suite E2E corre con un worker porque comparte ese servidor de prueba y sus contadores de rate limit. Los jobs de PR no reciben la clave de OpenAI ni llaman al proveedor.

Para replicar localmente los tests SQL, usa una base PostgreSQL/pgvector desechable dedicada exclusivamente a pruebas. Define `TEST_DATABASE_URL` y las variables `*_TEST_DATABASE_URL` que consuman los specs para que apunten a esa base antes de ejecutar `prepare-test-database.ts` y `pnpm test`. No reutilices la base de desarrollo: los tests preparan la extensión y crean/eliminan esquemas temporales. CI usa un servicio efímero separado.

El Dockerfile separa las etapas `development` y `production`. Docker Compose selecciona `development`, que instala las dependencias completas para Vite, tests y desarrollo local. CI construye y comprueba `production`: compila la API en una etapa de build, instala solo sus dependencias de producción y omite los gestores de paquetes del contenedor final. Antes de escanearla con Trivy, CI ejecuta `scripts/test-production-image.mjs` dentro de la imagen y verifica que `NODE_ENV` sea `production`, que el proceso no use UID 0, que estén disponibles las dependencias de runtime de NestJS, bcryptjs, PostgreSQL y sharp, que la imagen incluya migraciones SQL, que el `AuthSecurityModule` compilado arranque mediante Nest y que no queden ejecutables npm, npx, Corepack, pnpm ni Yarn. En el `workflow_dispatch` autorizado desde `main`, cuando se confirma el despliegue, `supply-chain` ejecuta además `production-ai-smoke.js` dentro de esa misma imagen antes de continuar con el release. Comprueba una evaluación sintética y una respuesta de roast con OpenAI real; el paso falla si falta `OPENAI_API_KEY` o cualquiera de las operaciones falla. Configura `OPENAI_API_KEY` como secreto de Actions. Usa `gpt-5.4-mini` con esfuerzo de razonamiento bajo para evaluación y sin razonamiento para roast, entradas sintéticas fijas y `store: false`; el test puede hacer hasta cuatro completions de evaluación por los reintentos actuales y hasta dos solicitudes de roast dentro de un presupuesto total de 30 segundos si el primer intento falla de forma transitoria o queda incompleto por tokens. Así el smoke real no se ejecuta con código de pull requests y bloquea el release manual si el proveedor no responde correctamente. El smoke que ya corre en el VPS se mantiene como comprobación adicional de las credenciales y la configuración de producción. Así el escaneo cubre la imagen ejecutable y no herramientas de desarrollo que no se despliegan. La base usa Node `26.13.1-trixie-slim` y actualiza los paquetes Debian durante el build, incluida la versión corregida de `zlib1g`; el build de CI usa `--pull` para recibir la última reconstrucción publicada de esa versión. La etiqueta es mutable: `--pull` ayuda a recibir actualizaciones de seguridad, pero dos ejecuciones pueden usar distintos digests y no garantizan una reconstrucción idéntica. Para repetir exactamente un build debe registrarse y fijarse el digest de la imagen base.

El job `dependency-audit` empieza en paralelo con calidad y E2E, para detectar pronto fallos de auditoría. Ejecuta `pnpm audit --audit-level moderate` para todo el workspace y `pnpm audit --prod --audit-level high` para dependencias de producción. Trivy analiza las cuatro imágenes finales (API, web, PostgreSQL y Caddy) con severidad alta/crítica e `ignore-unfixed`. Durante el build paralelo de imágenes, una descarga única obtiene la base de vulnerabilidades de Trivy para reutilizarla en los análisis; la base Java se omite porque estos escaneos solo usan el detector `vuln`. Después, Trivy analiza las imágenes de una en una y reutiliza la misma caché local. El escaneo secuencial limita el espacio temporal usado al exportar capas de Docker; cada análisis conserva su propio registro y el job falla si cualquiera devuelve un error o detecta vulnerabilidades que superen el umbral. `--skip-version-check` y `--disable-telemetry` se usan juntas para suprimir el aviso de versión y desactivar las llamadas opcionales a `check.trivy.dev`, sin cambiar los resultados ni el umbral del análisis. El job `supply-chain` configura Buildx y selecciona su builder con `BUILDX_BUILDER`, compatible con las versiones de Compose del runner, y construye las cuatro imágenes en paralelo con `docker compose --parallel 4 ... build`; las etiquetas llevan el SHA del commit. Un override temporal habilita la caché remota de BuildKit solo para el build de Caddy, que es la parte lenta; el contexto de Compose de producción no cambia. La caché usa el backend `type=gha`, no crea artefactos de Actions ni cambia el bundle publicado, y su exportación está marcada `ignore-error=true`: si GitHub no permite guardar la caché, el build sigue siendo válido y solo tardará más la siguiente vez. La descarga de la base de Trivy sigue en paralelo con el build. Después escanea las imágenes construidas y arranca exactamente esas mismas imágenes con `compose.production.yaml`, CA y certificados efímeros, secretos ficticios y volúmenes de prueba exclusivos del run. El smoke comprueba TLS de servidor entre Caddy y ambos upstreams, con verificación de CA y hostname, TLS `verify-full` entre API y PostgreSQL, rechazo de conexiones PostgreSQL sin TLS, HTTPS local en Caddy, `/api/health`, pgvector, `NODE_ENV=production`, que API y PostgreSQL no publiquen puertos y que PostgreSQL y avatares sobrevivan a recrear servicios. También comprueba que las rutas heredadas `/desarrollo-seguro` y `/desarrollo-seguro/*` respondan con `308` y `Location: https://desarrolloseguro.org/`; el prototipo ya no se empaqueta en Grumphya. El smoke comprueba además que `/crear-cuenta` y `/crear-cuenta/planes` respondan `200` sin `Location` a través de Caddy; así detecta una redirección accidental al host interno `web:8443` causada por el directorio prerenderizado. Estas son comprobaciones locales de las imágenes del run, no una validación del despliegue público. El healthcheck de `web` consulta ahora `/` por HTTPS a Nginx y valida la CA y el hostname `web`; el smoke mantiene además la comprobación de `/` a través de Caddy, que cubre el recorrido público. Si el smoke falla, conserva en la salida de Actions el estado de Compose, los estados de salud de base de datos, API y web, y los últimos 100 registros de web, migración y proxy. No publica registros sin filtrar de la API ni de la base de datos. No llama a OpenAI ni a SMTP. La limpieza elimina únicamente los volúmenes etiquetados para la prueba; nunca ejecuta `down -v` ni `volume prune`. La imagen web ejecuta `nginx -t` durante su construcción. La imagen PostgreSQL conserva Debian Bookworm para no cambiar la plataforma del volumen existente, actualiza paquetes y recompila `gosu` 1.19 con Go 1.27.4. Caddy 2.11.7 se recompila con Go 1.27.4 y `golang.org/x/net` 0.62.0; la imagen final actualiza Alpine. Las versiones fuente se fijan a commits exactos y el escaneo no excluye archivos ni tipos de vulnerabilidad. Las etapas de compilación no entran en las imágenes finales. Dependabot propone actualizaciones semanales de dependencias y acciones. Ignora TypeScript `>=7.0.0` mientras el parser `typescript-eslint` no declare soporte para esa versión.

Los pull requests ejecutan las comprobaciones de CI. Un push a `main` no inicia Actions: el despliegue se solicita manualmente desde la pestaña Actions, seleccionando `main` y confirmando `approve_production_deploy`. Solo `fernandezpastoreduardo` puede iniciar el flujo o volver a ejecutar un run. También se requiere `PRODUCTION_DEPLOY_ENABLED=true` y los secretos SSH del VPS. `quality-and-e2e`, `e2e` y `dependency-audit` corren en paralelo; `supply-chain` espera a que los tres pasen. Dentro de `supply-chain`, Buildx compila en paralelo las imágenes etiquetadas por SHA mientras Trivy descarga una vez su base de vulnerabilidades; la caché GitHub de BuildKit se limita a Caddy. Después, Trivy analiza las imágenes secuencialmente con la misma caché de vulnerabilidades, lo que reduce el espacio temporal requerido para exportar capas. `--skip-version-check` y `--disable-telemetry` se usan juntas para suprimir el aviso de versión y desactivar las llamadas opcionales a `check.trivy.dev`, sin cambiar los resultados del escaneo. El smoke valida esas mismas imágenes. En la vista del job se distinguen ahora `Save scanned release images`, `Assemble production release bundle`, `Preflight production deployment` y `Deploy and verify`; el helper del VPS registra hitos al recibir/verificar el bundle, validar migraciones y configuración, cargar imágenes y comenzar la actualización de Compose. El job empaqueta el bundle y lo envía al VPS sin reconstruir ni descargar tags mutables. Actions ya no sube el bundle a GitHub: antes solo lo archivaba después de desplegar y comprobar públicamente una versión sana, de modo que no consumía cuota cuando CI fallaba, pero retenía copias grandes redundantes y podía hacer que una publicación ya activa apareciera como fallida si se agotaba la cuota. Para Caddy, Compose usa `docker/Caddy.Dockerfile`, que recompila el binario parcheado y actualiza Alpine; `PROXY_IMAGE` apunta a la imagen escaneada y el helper arranca con `--no-build`. El helper root-owned valida el paquete y las migraciones, conserva la release anterior, espera healthchecks y permite rollback. No hay publicación a un registry. Consulta [production.md](production.md) para prerrequisitos, permisos SSH/sudoers, huella del host, activación y límites operativos. Los tests de CI cubren políticas, seguridad de contenedores, arranque con imágenes/datos desechables y rollback simulado. Los jobs `quality-and-e2e`, `e2e`, `dependency-audit`, `supply-chain`, `publish-lighthouse` y `deploy-production` permiten distinguir fallos de calidad, navegador, auditoría, imagen, ingesta opcional y publicación en Actions. Todas las GitHub Actions están fijadas a SHA inmutables con etiquetas legibles; Dependabot propone actualizaciones semanales. Trivy `v0.76.0` se instala mediante `aquasecurity/setup-trivy` `v0.3.1`, fijado por SHA.

En un reintento manual, el preflight puede encontrar que el SHA solicitado ya
está activo. En ese caso Actions solo verifica los endpoints públicos: no
transfiere el bundle, no recrea contenedores y no arma un rollback para una
comprobación de solo lectura. El 9 de noviembre de 2026, con el flujo anterior
que enviaba el resumen desde `performance-lab` antes del despliegue, la primera
ejecución de `5732a66` desplegó correctamente, pero el laboratorio falló por un
token de ingesta Lighthouse con formato inválido. Un reintento intentó desplegar el mismo
SHA, recibió `release directory already exists` y revirtió la release sana. La
ingesta opcional ahora avisa si la configuración o el endpoint fallan, sin
invalidar la publicación de la aplicación. Ese mismo día se rotó el token en
los dos extremos, Actions y el secreto del VPS, sin registrar su valor aquí.
Antes del siguiente despliegue se verificó por SSH y en la API pública que la
release activa y sana era `71d1ec1684a380f29c8e05296aeac1986619fd0a`;
esa observación fechada no acredita el resultado de ejecuciones posteriores.

## Ejecución local equivalente

```sh
bash scripts/ci-local.sh
bash scripts/ci-local.sh quality
bash scripts/ci-local.sh e2e
bash scripts/ci-local.sh audit
```

El comando crea un runner `linux/amd64` con Node de `.node-version`, pnpm `12.5.1`, Playwright `1.65.1` y PostgreSQL `pgvector/pgvector:0.8.7-pg17-bookworm`. Instala sobre una copia temporal, sin sustituir `node_modules` del host, montar archivos `.env` ni exponer el socket Docker a los servicios. PostgreSQL usa una red aislada sin puertos publicados ni volúmenes persistentes. Los logs, los resultados y los traces de Playwright se guardan en `.ci-artifacts/` también cuando falla una prueba. CI y la ejecución local comparten `scripts/ci-preflight.sh` y `scripts/ci-verify.sh` para evitar que sus puertas diverjan.

`quality` incluye checks de React y migraciones, formato, lint, typecheck, tests, build, seguridad de contenedores/TLS y políticas de despliegue. `e2e` ejecuta Playwright; `audit` ejecuta ambas auditorías pnpm. El modo predeterminado corre los tres grupos de forma secuencial. La auditoría necesita acceso al registry y a los avisos actuales.

### Puerta local antes de enviar cambios a CI

Antes de hacer commit/push o solicitar un workflow, reproduce localmente las puertas
que pueda afectar el cambio. El orden recomendado es: contratos y sintaxis; tests
dirigidos; integración del entorno afectado; y después `pnpm lint`, `pnpm typecheck`,
`pnpm test`, build o auditoría cuando proceda. Así los bugs de Compose, migraciones,
Dockerfiles, entrypoints y scripts de despliegue se detectan sin consumir minutos de
GitHub Actions ni tocar el VPS.

Para cambios de producción o auditoría, usa el preflight aislado cuando aplique:

```sh
bash scripts/test-production-compose.sh "$(git rev-parse HEAD)" --audit-only
```

Este modo usa imágenes y secretos efímeros, conserva `AUDIT_ENABLED=false` y limpia
sus recursos al terminar. Las pruebas E2E no son una puerta automática: se omiten si
la evidencia del cambio demuestra que no puede afectar al navegador o al runtime E2E,
y se registra esa decisión junto con las comprobaciones ejecutadas. Las variables,
secretos, permisos del repositorio y comportamiento exclusivo de GitHub siguen
requiriendo una revisión explícita de Actions después de esta puerta local.

En el checkout enlazado, ejecuta desde el primer intento con acceso elevado los
comandos que escriban el índice Git o usen Docker (`git add`, `git commit`, `git push`,
`docker compose` y el preflight de Compose). Así se evita confundir una denegación del
sandbox sobre `.git/worktrees/...` o `docker.sock` con un bug del proyecto. La
elevación solo afecta al índice Git y al daemon Docker locales; no toca el VPS ni
consume Actions.

La construcción, el escaneo Trivy y el smoke de las imágenes finales se ejecutan aparte del runner para que el socket Docker no entre en el contenedor de la aplicación:

```sh
SHA=$(git rev-parse HEAD)
DOCKER_DEFAULT_PLATFORM=linux/amd64 DOMAIN=ci.invalid DEPLOY_SHA="$SHA" \
  API_IMAGE="grumphya-api:$SHA" WEB_IMAGE="grumphya-web:$SHA" \
  DATABASE_IMAGE="grumphya-database:$SHA" PROXY_IMAGE="grumphya-proxy:$SHA" \
  docker compose --parallel 4 --file compose.production.yaml build --pull api web db proxy
node scripts/test-production-image.mjs "grumphya-api:$SHA"
bash scripts/test-production-compose.sh "$SHA"
```

`DOMAIN=ci.invalid` solo se pasa al comando de build; no lo exportes antes del smoke, que genera certificados efímeros para `localhost`. Trivy `v0.76.0` puede escanear las imágenes con `--scanners vuln --severity HIGH,CRITICAL --ignore-unfixed`; requiere descargar su base actual. Estas comprobaciones no ejecutan Actions ni despliegues. Los checks de PR, secretos y variables de GitHub, el backend de caché `gha` y el destino remoto de producción solo se pueden validar desde GitHub.

## Análisis SonarQube

SonarQube no forma parte de GitHub Actions. El análisis privado se ejecuta localmente con `pnpm sonar:verify` y el hook Husky lo exige antes del `git push` normal a `main`. El workflow de GitHub mantiene sus comprobaciones y despliegue existentes sin conexiones ni secretos Sonar. La [guía de SonarQube](sonarqube.md) documenta el Quality Gate, el comando bajo demanda, el hook y el límite de enforcement del cliente Git.
