# SonarQube Community Build privado

SonarQube es una herramienta de análisis interna para el código de Grumphya. Se ejecuta fuera de los servicios de producción, con PostgreSQL propio, y no forma parte del runtime público. El proyecto no usa SonarQube Cloud. El escáner corre localmente en un contenedor Docker y envía el análisis a SonarQube por una red Docker interna; no hay túnel SSH ni conexión del análisis con Actions.

## Requisitos y configuración inicial

- Docker Desktop/Engine y Docker Compose v2 en la estación administrada que ejecutará el análisis.
- Node.js y pnpm según las versiones fijadas en `.node-version` y `package.json`.
- Memoria y límites de kernel compatibles con Elasticsearch incluido en SonarQube; antes del primer arranque, verifica `vm.max_map_count` según la [documentación oficial de SonarSource](https://docs.sonarsource.com/sonarqube-server/latest/server-installation/pre-installation/linux/).

Desde el directorio del proyecto en la estación administrada que alojará SonarQube, prepara un secreto aleatorio para la base de datos y arranca los servicios:

```sh
cp .env.sonarqube.example .env.sonarqube
# Sustituye el valor de ejemplo por un secreto largo y aleatorio.
chmod 600 .env.sonarqube
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml config --quiet
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml up -d
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml ps
```

En el primer inicio, SonarQube usa las credenciales predeterminadas `admin/admin`. Abre el dashboard con el puente temporal descrito más abajo, cambia esa contraseña inmediatamente y guarda la nueva en un gestor seguro antes de habilitar acceso a otras personas o crear tokens. Crea un token de análisis de proyecto para `grumphya` y guárdalo en `.env.sonarqube.token` con el formato `SONAR_TOKEN=valor`, permisos de análisis únicamente y permisos de archivo `600`. Ese fichero está excluido de Git; no pegues el token en comandos, argumentos ni documentación.

La base de datos `sonarqube` es independiente de PostgreSQL de producción. Los volúmenes Compose conservan datos, extensiones y registros. No borres volúmenes al detener el servicio. Para detenerlo sin eliminar datos:

```sh
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml stop
```

Para volver a iniciarlo usa `up -d`. No ejecutes `down -v` salvo que se haya aprobado expresamente eliminar permanentemente el historial y la configuración del servidor.

La red Compose `172.30.250.0/24` está marcada `internal`; en este host se confirmó libre y no se solapa con redes locales conocidas. No se publica ningún puerto en el host. El escáner y SonarQube comparten esa red, pero PostgreSQL usa otra red interna donde solo se conectan la base y SonarQube. La contraseña de la base no queda accesible al escáner. SonarQube tiene la IP estática `172.30.250.10` en la red del escáner. Antes de usarla en otro host, vuelve a comprobar que la subred no se solape con redes Docker, VPN ni redes de la organización. `internal: true` bloquea el egress de runtime de los contenedores conectados a esas redes; esto describe la configuración del repositorio y no demuestra por sí solo el comportamiento de una instancia desplegada, su host Docker, DNS o firewall. `SONAR_TELEMETRY_ENABLE=false` y `SONAR_UPDATECENTER_ACTIVATE=false` desactivan telemetría y Update Center. No instales plugins desde una fuente externa ni habilites conexiones de salida del servidor sin revisar y documentar su necesidad. Las actualizaciones de imágenes deben descargarse y aplicarse de forma controlada por el operador.

## Proyecto, Quality Gate y dashboard

En la interfaz local, crea el proyecto con la clave `grumphya` y genera un token de análisis de proyecto. Configura un Quality Gate llamado `Grumphya Release Gate` y asígnalo al proyecto. Criterios requeridos para código nuevo:

| Métrica                     | Condición |
| --------------------------- | --------- |
| Bugs nuevos                 | = 0       |
| Violaciones nuevas          | = 0       |
| Vulnerabilidades nuevas     | = 0       |
| Security Hotspots revisados | = 100%    |
| Cobertura nueva             | >= 80%    |
| Duplicación nueva           | <= 3%     |

Usa la definición de código nuevo del servidor basada en la rama de referencia `main`. El umbral de cobertura se evalúa cuando SonarQube recibe los informes LCOV; `pnpm sonar:verify` genera y comprueba ambos antes de escanear, y no acepta un análisis incompleto ni un Quality Gate fallido. No se configura un umbral histórico global, para que deuda anterior no se confunda con una regresión nueva. La rúbrica deberá revisarse al cambiar la línea base del proyecto.

El fichero [sonar-project.properties](../sonar-project.properties) incluye `apps/api/src` y `apps/web/src`, excluye los tests de las fuentes y señala `apps/api/coverage/lcov.info` y `apps/web/coverage/lcov.info`. Un resultado fallido, ausente o que no termine dentro del tiempo configurado bloquea el comando y el `git push` normal a `main`.

La creación del proyecto, la asignación del Quality Gate y la coincidencia de métricas con esta tabla son configuración del servidor: el repositorio no puede imponerlas mediante Compose. Comprueba en el dashboard que el gate esté asignado y que una evaluación con infracción resulte fallida. Para abrir el dashboard localmente, crea un puente temporal de escucha en loopback:

```sh
docker run --rm --name sonar-local-view \
  --network grumphya-sonarqube_sonar-private \
  -p 127.0.0.1:9000:9000 alpine/socat \
  TCP-LISTEN:9000,fork,reuseaddr TCP:sonarqube:9000
```

Abre `http://127.0.0.1:9000` y detén el puente con `Ctrl+C` al terminar. El puente no escucha en interfaces públicas.

## Evidencia de verificación local

El 7 de noviembre de 2026 se verificó una instancia local con Docker Desktop `29.8.2` y Docker Compose `5.5.1`. El contenedor SonarQube `26.10.0.133078` llegó a estado `UP`, conectado a la red `internal` `172.30.250.0/24` con IP `172.30.250.10`; no tenía puertos publicados en el host. Las variables `SONAR_TELEMETRY_ENABLE` y `SONAR_UPDATECENTER_ACTIVATE` estaban en `false`. Un intento HTTPS de salida desde la red interna quedó bloqueado.

Se puede repetir la comprobación de estado, red, puertos y variables sin mostrar credenciales:

```sh
docker --version
docker compose version
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml ps
SONAR_CONTAINER=$(docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml ps -q sonarqube)
docker inspect --format '{{json .NetworkSettings.Networks}}' "$SONAR_CONTAINER"
docker inspect --format '{{json .NetworkSettings.Ports}}' "$SONAR_CONTAINER"
docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml exec -T sonarqube \
  sh -c 'printf "telemetry=%s updatecenter=%s\\n" "$SONAR_TELEMETRY_ENABLE" "$SONAR_UPDATECENTER_ACTIVATE"'
```

La última salida esperada es `telemetry=false updatecenter=false`; la inspección de puertos debe mostrar que no hay binding de host. Para repetir la prueba de egress, usa el `curl` ya instalado en el contenedor SonarQube. El comando silencia la salida de curl e imprime solo `reachable` o `blocked`:

```sh
if docker compose --env-file .env.sonarqube -f compose.sonarqube.yaml exec -T sonarqube \
  sh -c 'curl --silent --output /dev/null --connect-timeout 5 --max-time 10 https://example.com/' \
  2>/dev/null; then
  printf 'reachable\n'
else
  printf 'blocked\n'
fi
```

La solicitud debe producir `blocked`. No uses esta prueba como sustituto de revisar reglas de firewall o tráfico del host.

El proyecto privado `grumphya` tiene asignado `Grumphya Release Gate` y el periodo de código nuevo está configurado como `REFERENCE_BRANCH` con `main`. El análisis local del 7 de noviembre de 2026 confirmó **Quality Gate PASSED**, 0 líneas duplicadas (0,0%), 0% de duplicación nueva y 100% de cobertura nueva. No encontró bugs, violaciones ni vulnerabilidades nuevos. Las pruebas de cobertura generaron informes LCOV para API y web. El escáner mantiene un aviso de dos rutas LCOV no resueltas (incluye `src/style-modules.d.ts`); importó los informes y el gate pasó, pero conviene revisar el aviso si cambia la cobertura.

## Análisis local bajo demanda y antes de publicar `main`

Arranca SonarQube y ejecuta:

```sh
pnpm sonar:verify
```

El comando inicia un PostgreSQL temporal de pruebas, genera LCOV para ambas aplicaciones y ejecuta el SonarScanner oficial `sonarsource/sonar-scanner-cli:12.1.0.3233_8.0.1` conectado únicamente a la red Docker interna de SonarQube. El token se lee desde `.env.sonarqube.token` y se pasa al contenedor como variable de entorno; no se imprime ni se incluye en argumentos. El escáner solo monta el código de las aplicaciones en lectura y el fichero de configuración. No usa SonarQube Cloud ni envía el análisis a servicios externos. Un Quality Gate fallido, scanner o servidor no disponible, timeout o LCOV ausente devuelve error.

En cada checkout, ejecuta `pnpm install --frozen-lockfile`; el script `prepare` instala Husky y configura sus hooks Git locales. Comprueba que `git config --local --get core.hooksPath` devuelve `.husky/_`. El hook Husky [.husky/pre-push](../.husky/pre-push) ejecuta `pnpm sonar:verify` y E2E cuando el destino del push es `refs/heads/main`; el fallo de cualquiera detiene el `git push` normal. También comprueba que el SHA enviado sea `HEAD`, que el árbol esté limpio, que la punta remota anterior de `main` esté disponible localmente y que el candidato descienda de ella. Si falta esa referencia, actualiza `origin/main` y reintenta. Para SonarQube, el hook pasa el SHA remoto anterior como línea base; el análisis crea un bundle Git temporal con esa referencia y el candidato, y elimina el bundle al finalizar. Así la referencia `main` del análisis no se mueve junto al commit que se está publicando. Los análisis bajo demanda usan la rama local `main` como referencia. Los pushes a otras ramas conservan el chequeo del registro de migraciones.

Este control es del cliente Git. Se puede omitir con `git push --no-verify`, y no intercepta cambios hechos desde la interfaz/API de GitHub u otro checkout sin el hook. GitHub no ejecuta hooks personalizados en su servidor; por tanto, sin un estado de CI requerido, reglas de rama disponibles en el plan o un servidor Git administrado por el equipo con hook `pre-receive`, no existe forma de garantizar el gate remoto. En la comprobación de este repositorio privado del 7 de noviembre de 2026, GitHub rechazó la consulta de protección de rama y rulesets con `403` por limitación del plan. El hook local hace fallar los pushes normales a `main`, pero no ofrece enforcement contra bypasses; la política remota sigue pendiente.

Para conservar evidencia, registra SHA, fecha y estado del Quality Gate en el registro interno de releases. El análisis transmite el código fuente y los informes LCOV únicamente a la instancia privada SonarQube. No incluyas texto de ideas de usuarios, datos personales ni secretos en los artefactos de análisis. Aplica controles de acceso, backup y retención al servidor.

Las pruebas `node scripts/test-sonarqube-config.mjs` y `node scripts/test-pre-push-hook.mjs` verifican la configuración privada y que un fallo de SonarQube bloquee el push a `main`. Estas pruebas de política no sustituyen la ejecución del análisis real.
