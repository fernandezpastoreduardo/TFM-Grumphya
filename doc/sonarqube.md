# SonarQube Community Build privado

SonarQube es una herramienta de análisis interna para el código de Grumphya. Se ejecuta fuera de los servicios de producción, con PostgreSQL propio, y no forma parte del runtime público. El proyecto no usa SonarQube Cloud. El servidor no envía análisis a un servicio externo: el escáner del workflow transmite el análisis por un túnel SSH a la instancia privada.

## Requisitos y configuración inicial

- Docker Engine y Docker Compose v2 en un servidor Linux administrado por el equipo.
- Una cuenta SSH sin privilegios de administrador y un acceso de red restringido al servidor. El panel SonarQube solo escucha en `127.0.0.1:9000` del host.
- Memoria y límites de kernel compatibles con Elasticsearch incluido en SonarQube; antes del primer arranque, verifica `vm.max_map_count` según la [documentación oficial de SonarSource](https://docs.sonarsource.com/sonarqube-server/latest/server-installation/pre-installation/linux/).

Desde el directorio del proyecto en el servidor, prepara un secreto aleatorio para la base de datos y arranca los servicios:

```sh
cp .env.sonarqube.example .env.sonarqube
# Sustituye el valor de ejemplo por un secreto largo y aleatorio.
chmod 600 .env.sonarqube
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml config
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml up -d
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml ps
```

La base de datos `sonarqube` es independiente de PostgreSQL de producción. Los volúmenes Compose conservan datos, extensiones y registros. No borres volúmenes al detener el servicio. Para detenerlo sin eliminar datos:

```sh
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml stop
```

Para volver a iniciarlo usa `up -d`. No ejecutes `down -v` salvo que se haya aprobado expresamente eliminar permanentemente el historial y la configuración del servidor.

La red Compose está marcada `internal`, no publica el puerto de PostgreSQL y el puerto web se enlaza a loopback. `internal: true` bloquea el egress de runtime de los contenedores conectados a esa red; esto describe la configuración del repositorio y no demuestra por sí solo el comportamiento de una instancia desplegada, su host Docker, DNS o firewall. `SONAR_TELEMETRY_ENABLE=false` y `SONAR_UPDATECENTER_ACTIVATE=false` desactivan telemetría y Update Center. No instales plugins desde una fuente externa ni habilites conexiones de salida del servidor sin revisar y documentar su necesidad. Las actualizaciones de imágenes deben descargarse y aplicarse de forma controlada por el operador.

## Proyecto, Quality Gate y dashboard

En la interfaz local, crea el proyecto con la clave `grumphya` y genera un token de análisis de proyecto. Configura un Quality Gate llamado `Grumphya Release Gate` y asígnalo al proyecto. Criterios requeridos para código nuevo:

| Métrica                     | Condición |
| --------------------------- | --------- |
| Bugs nuevos                 | = 0       |
| Vulnerabilidades nuevas     | = 0       |
| Security Hotspots revisados | = 100%    |
| Cobertura nueva             | >= 80%    |
| Duplicación nueva           | <= 3%     |

Usa la definición de código nuevo del servidor basada en la rama de referencia `main`. El umbral de cobertura se evalúa cuando SonarQube recibe los informes LCOV; CI exige que ambos informes existan y no acepta un análisis sin terminar. No se configura un umbral histórico global, para que deuda anterior no se confunda con una regresión nueva. La rúbrica deberá revisarse al cambiar la línea base del proyecto.

El fichero [sonar-project.properties](../sonar-project.properties) incluye `apps/api/src` y `apps/web/src`, excluye los tests de las fuentes y señala `apps/api/coverage/lcov.info` y `apps/web/coverage/lcov.info`. El workflow genera ambas coberturas antes del análisis. Un resultado `ERROR`, `WARN`, ausente o que no termine dentro del tiempo configurado bloquea la publicación.

La creación del proyecto, la asignación del Quality Gate y la coincidencia de métricas con esta tabla son configuración del servidor: el repositorio no puede imponerlas mediante Compose. Antes de habilitar despliegues, comprueba en el dashboard que el gate esté asignado y que una evaluación con infracción resulte fallida. Consulta el proyecto desde el servidor o mediante un túnel local:

```sh
ssh -N -L 127.0.0.1:9000:127.0.0.1:9000 usuario-sonar@servidor-sonar
```

Abre `http://127.0.0.1:9000` en el navegador de la máquina que mantiene el túnel. No publiques el puerto 9000 en una interfaz externa ni configures un proxy público.

## Workflow de release y secretos

El job `sonar-analysis` corre en un runner GitHub-hosted (`ubuntu-24.04`) únicamente para un `workflow_dispatch` autorizado desde `main`, cuando se confirma `approve_production_deploy` y `PRODUCTION_DEPLOY_ENABLED=true`. No se usa un runner self-hosted: el código de pull requests no se ejecuta en un host que tenga acceso persistente al servidor. El acceso se realiza mediante un túnel SSH temporal creado dentro de ese job, después de las comprobaciones y cobertura, con verificación estricta de host y reenvío local limitado al servicio SonarQube.

Configura en GitHub:

- Secretos `SONAR_SSH_HOST`, `SONAR_SSH_USER`, `SONAR_SSH_PRIVATE_KEY` y `SONAR_SSH_KNOWN_HOSTS` (entrada `known_hosts` verificada fuera de banda).
- Variable opcional `SONAR_SSH_PORT` (por defecto 22).
- Secreto `SONAR_TOKEN`, limitado al proyecto `grumphya` y con permiso de análisis.
- Variable `PRODUCTION_DEPLOY_ENABLED=true` solo cuando se habilite el flujo de release.

Usa una cuenta SSH dedicada sin sudo ni acceso interactivo. En `sshd_config` y/o las opciones de `authorized_keys`, deshabilita shell/PTY, agent forwarding y X11 forwarding; permite solo TCP forwarding local y limita `PermitOpen`/la clave a `127.0.0.1:9000`. Comprueba que la clave no permita otros destinos ni reenvío remoto. Restringe el acceso SSH en el firewall/bastión a los orígenes administrados que correspondan. Nunca abras SonarQube a Internet. Los rangos de salida de runners GitHub-hosted pueden cambiar; si no es viable aplicar una política SSH de origen suficientemente acotada, usa un bastión o conectividad privada administrada. No montes un runner self-hosted compartido con producción para resolver el acceso: tendría que aislarse, actualizarse, limpiarse por ejecución y aceptar únicamente código confiable, sin privilegios del host disponibles para jobs.

Fija la host key en `SONAR_SSH_KNOWN_HOSTS` después de verificarla por un canal independiente; no uses `StrictHostKeyChecking=no`. Rota y revoca la clave privada al terminar su necesidad, ante cambio de responsable o sospecha de exposición. El workflow la crea con permisos `0600` en almacenamiento temporal, elimina los archivos tras abrir el túnel y limita el secreto al job de análisis. El token Sonar y las credenciales SSH solo se exponen al job manual autorizado en `main`; no están disponibles en jobs de pull request.

El job recibe solo los secretos Sonar y crea la llave temporal con permisos restrictivos; los jobs de PR, tests y auditoría no reciben estas credenciales. El escáner oficial fijado por SHA se comunica con `127.0.0.1:9000`; la validación posterior comprueba que el informe, el servidor, la tarea de cómputo y el análisis correspondan al proyecto esperado, y requiere `Quality Gate OK`. Fallo SSH, autenticación, servidor, análisis, cobertura ausente, timeout o Quality Gate bloquea `supply-chain` y cada paso de despliegue. La rama main requiere además protección de rama que exija el workflow/estado de CI pertinente; la condición del job no sustituye la configuración de protección en GitHub.

## Análisis bajo demanda y evidencias

El flujo actual analiza automáticamente durante el despacho de release autorizado. Para inspeccionar un cambio antes de una release, puede ejecutarse localmente en una estación administrada con Docker y acceso autorizado a la red privada:

```sh
set -e
trap 'unset SONAR_TOKEN' EXIT
pnpm --filter @grumphya/api exec tsx scripts/prepare-test-database.ts
pnpm --filter @grumphya/api test:coverage
pnpm --filter @grumphya/web test:coverage
IFS= read -r -s -p 'Token SonarQube: ' SONAR_TOKEN
printf '\n'
export SONAR_TOKEN
SONAR_HOST_URL=http://127.0.0.1:9000 \
  pnpm exec sonar-scanner -Dsonar.qualitygate.wait=true
```

El escáner local debe instalarse desde una fuente aprobada y su versión debe coincidir con el scanner del workflow. Protege el token como secreto y no lo incluyas en argumentos persistidos, shell history, logs o archivos versionados. La verificación exacta del gate de una tarea CI la realiza `node scripts/verify-sonarqube-gate.mjs` dentro del workflow, donde existe `.scannerwork/report-task.txt`.

Para conservar evidencia, registra el SHA analizado, fecha, URL/ID de análisis del dashboard y estado del Quality Gate en el registro interno de releases. El análisis transmite los ficheros fuente del proyecto, metadatos SCM y los informes LCOV de cobertura al servidor privado de SonarQube. No copies al proyecto SonarQube texto de ideas introducidas por usuarios, datos de usuarios ni secretos; comprueba también que no queden incluidos en el repositorio o los artefactos de análisis. Esos datos técnicos se guardan en la infraestructura propia de SonarQube; aplica controles de acceso, backup y retención del servidor.

## Comprobaciones y límites de verificación

`node scripts/test-sonarqube-gate.mjs` ejercita el verificador con respuestas sintéticas e incluye fallos, timeouts, servidor no disponible y gate no aprobado. `scripts/test-deploy-policy.mjs` verifica estáticamente que la release aprobada exige el éxito de SonarQube. Estas pruebas demuestran el comportamiento de bloqueo del código, pero no sustituyen un análisis real ni una comprobación de la política guardada en GitHub.

La configuración del servidor, la restricción efectiva de SSH, la no exposición desde el firewall, la conectividad del runner, las reglas de branch protection y el tráfico observado deben verificarse en el entorno administrado antes de considerar la integración operativa. `internal: true` y las opciones de telemetría son evidencia de configuración en archivos, no una captura de tráfico ni prueba del host desplegado. No se ha realizado una publicación de producción como parte de esta integración.
