# Incidencia: recuperar SSH del VPS y desbloquear el despliegue (28 de octubre de 2026)

## Síntomas

El VPS dejó de aceptar la conexión SSH habitual. Primero respondió `connection refused`; al arrancarlo con el DVD live Grml, la clave de host SSH presentada dejó de coincidir con la guardada en `known_hosts` y el acceso inicial por contraseña también fue rechazado. La consola remota de IONOS resultó poco fiable para pegar comandos y editar archivos. En paralelo, el workflow de GitHub Actions bloqueó la publicación de la release por la migración `034_illuminado_price_retroactive.sql`, que el helper instalado clasificaba como destructiva.

El bloqueo de despliegue no se debía a `DEPLOY_VERSION`: el workflow no usa esa variable. Los controles involucrados son el SHA de release (`DEPLOY_SHA`) y la versión del helper (`HELPER_VERSION`).

## Vías probadas y por qué no resolvían el problema

- **SSH directo mientras el VPS estaba en el entorno de rescate:** `connection refused` significaba que no había un servidor SSH aceptando la conexión en ese momento. Repetir el mismo comando no podía restaurar el servicio.
- **Usar la contraseña root antes de restablecerla en el rescate:** el servidor rechazó tres intentos. La contraseña por sí sola tampoco daba un acceso persistente desde el Mac.
- **Aceptar sin más la nueva huella SSH:** usar un `known_hosts` temporal evita el conflicto con la entrada antigua, pero `StrictHostKeyChecking=accept-new` no comprueba por sí solo que el servidor sea el VPS esperado. No debe tratarse como verificación de identidad; hay que contrastar la huella por un canal independiente antes de confiar en ella.
- **Editar el helper desde otro despliegue de GitHub Actions:** el helper antiguo era precisamente parte del bloqueo, por lo que el propio flujo no era una vía de recuperación fiable.
- **Reinstalar el VPS:** no era necesario para recuperar acceso y podía poner en riesgo el sistema y sus datos persistentes. Se eligió el arranque live y la modificación del disco existente.
- **Relajar el detector para permitir cualquier `UPDATE`:** habría convertido una excepción de negocio en una vía general para introducir cambios de datos incompatibles con rollback. Se descartó.

## Recuperación efectiva del acceso

1. Se arrancó el DVD **Grml latest_iso** en modo live, sin reinstalar el sistema del disco.
2. Se recuperó el acceso root a la consola del entorno live y se restableció la contraseña allí cuando los intentos iniciales fueron rechazados.
3. Se montó el sistema de archivos del VPS desde el entorno live y se instaló en el `authorized_keys` de root la clave pública Ed25519 de este Mac. La clave privada permaneció en el Mac.
4. Se guardaron los cambios, se retiró el DVD y se reinició el VPS desde su disco. Después se comprobó que el sistema normal había arrancado y que SSH aceptaba la clave del Mac.

La entrada anterior de `known_hosts` no se debe borrar a ciegas. Si el host presenta una huella distinta durante un rescate, contrástala con la consola/proveedor por un canal independiente. Una vez comprobada la huella del sistema normal, actualiza la entrada habitual de ese host. Para verificar una clave local, usa el archivo `.pub` correspondiente; `authorized_keys` es un conjunto de claves autorizadas, no el archivo privado ni necesariamente la clave pública individual que se debe inspeccionar.

## Corrección del helper y de la puerta de migraciones

El helper activo del VPS era anterior a la versión 2 y no exponía `helper-version`. Una vez recuperado SSH root:

1. Se transfirió `docker/vps-deploy.sh` desde `main` al VPS.
2. Se comprobó que el SHA-256 del archivo transferido coincidía con el del repositorio.
3. Se instaló como `/usr/local/sbin/grumphya-deploy`, propiedad `root:root` y modo `0755`.
4. Se comprobó `/usr/local/sbin/grumphya-deploy helper-version`; devolvió `2`.

La versión 2 incorpora una excepción estrecha para la migración de reexpresión retroactiva del precio Iluminado: exige el nombre exacto `034_illuminado_price_retroactive.sql`, el marcador `-- deployment-data-rewrite: retroactive-illuminado-price` y las dos sentencias `UPDATE` exactas esperadas. El detector general sigue bloqueando operaciones destructivas y las pruebas del helper rechazan cambios adicionales o un nombre de migración distinto. Así el control de rollback conserva su alcance general.

El helper v2 ya instalado es compatible con el helper incluido en la release actual; las siguientes releases pueden actualizarlo durante el flujo normal. Si se repite una recuperación del host, confirmar antes de reintentar Actions:

```sh
/usr/local/sbin/grumphya-deploy helper-version
stat -c '%U:%G %a %n' /usr/local/sbin/grumphya-deploy
```

El resultado esperado es la versión `2` y `root:root 755`.

## Estado y distinción de versiones

- `HELPER_VERSION` identifica el protocolo/capacidades del helper root-owned del VPS. En esta incidencia se actualizó a `2`.
- `DEPLOY_SHA` identifica el commit exacto de la release. No sustituye ni configura `HELPER_VERSION`.
- `DEPLOY_VERSION` no está definido ni es requerido por el helper o el workflow actual.
- El workflow `CI` se ejecuta manualmente desde `main`; el despliegue solo continúa si pasan calidad, E2E, auditoría, construcción, escaneo y las demás condiciones configuradas.

La ejecución [CI #165](https://github.com/fernandezpastoreduardo/TFM-Grumphya/actions/runs/40723505200), iniciada para `a9fb1721a528ed9cb1bfeed8d282a0c5cc9566f2`, finalizó correctamente el 28 de octubre de 2026. El job `Build, scan and deploy production release` y el paso `Deploy and verify, rolling back on failed public health checks` terminaron con éxito; también lo hizo `Production deployment confirmed`. Esto registra el resultado de esa ejecución, pero no sustituye la comprobación de salud después de cada despliegue posterior.

## Aprendizajes operativos

- Mantener una vía de recuperación de consola live y acceso fuera de banda documentada antes de necesitarla.
- Preparar y conservar la clave pública del equipo que operará el VPS; nunca transportar la clave privada al servidor.
- Verificar siempre la huella SSH ante un cambio de host y conservar los checks de identidad habilitados.
- Si el helper root-owned impide el despliegue, actualizarlo desde una fuente revisada por una vía de administración root independiente y verificar hash, propietario, permisos y `helper-version` antes de lanzar Actions.
- Tratar excepciones de migración como allowlists de SQL exacto con pruebas negativas, nunca como una relajación global del detector.

Consulta también [Producción](production.md) y [CI/CD](ci-cd.md) para los procedimientos permanentes.
