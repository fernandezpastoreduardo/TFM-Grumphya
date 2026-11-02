# Operación en el despliegue compartido

## Estado actual

Los paquetes DS de API, persistencia y worker existen en el workspace. La migración 003 protege claim/renew/recover/complete mediante funciones `SECURITY DEFINER`; el worker no tiene escritura directa de jobs ni informes. `controls-v1` conserva sus nueve controles y contrato. La migración 005 añade `controls-v2` y cobertura exacta dentro del scope declarado: DNS + TLS-01/TLS-02 una vez por host, más HTTP-01 HEAD/GET y HDR-01, PRIV-01/02/03 y QUAL-01 GET por cada ruta (10/17/24 checks para 1/2/3 rutas). La suite PostgreSQL aislada tras 005 pasó 52/52, 0 omitidas, el 2 de noviembre de 2026. La cobertura solo abarca las rutas declaradas: scope `/` cubre únicamente portada y no implica aprobación de las demás superficies. El informe debe exponer las rutas medidas. Estas garantías locales validan forma, cobertura y coherencia semántica del payload, pero no prueban que un worker comprometido no fabrique evidencia permitida; la autenticidad y recolección de evidencia serán responsabilidad de la futura frontera confiable del executor.

El worker rechaza hostname inválido/no canónico antes de llamar al puerto executor. Para `controls-v2`, un `HEAD` 405/501 tras redirección HTTPS confirmada y esquema final HTTPS se normaliza a `unknown`. Estas garantías siguen siendo locales y requieren revisión de grants en el gate previo a producción. La API expone solo un health check del almacenamiento; su bootstrap standalone escucha en `0.0.0.0:3001`, pero aún no está en Compose ni publicada. Antes de integrarla debe quedar en una red interna, sin puerto de host, accesible solo desde Caddy. El processor del worker depende de un puerto `ScanExecutor`, sin implementación de probe ni proceso scheduler/worker ejecutable. El aprovisionador y las migraciones son código local todavía no aplicado a la base de producción. El Dockerfile de producción solo instala/ejecuta `@grumphya/api`; no copia ni arranca los paquetes DS. No se ha cambiado el Compose, proxy ni workflow para publicar estos servicios: **no hay despliegue, scan real ni escritura en PostgreSQL productivo**. La siguiente barrera de red requiere DNS/IP pinning, validación por conexión/redirección y firewall/egress, además de medir capacidad VPS; no depende solo de la validación de hostname.

La rutina de retención de 90 días está instalada y su ejecución está autorizada para `ds_migrator`; API y worker no tienen ese permiso. La limpieza aún no tiene tarea programada: su invocación queda reservada al migrator bajo operación controlada hasta definir y probar el mantenimiento automático.

## Topología y límites actuales

La primera fase vive en el **mismo VPS y origen https://grumphya.com**, con el mismo repositorio y la misma release. Caddy sigue siendo el único proceso que publica 80/443. La aplicación Desarrollo Seguro se aísla por componentes, rutas, secretos, usuario y base lógica de PostgreSQL, y límites de recursos; no dispone de independencia física ni de una perspectiva de red externa al VPS. El informe público debe declarar esa perspectiva.

Antes de cambiar código, Luna debe inspeccionar la versión de main de compose.production.yaml, Dockerfile, Caddyfile, nginx.conf, workflow de CI, workflow de producción y doc/production.md. Adaptar los nombres concretos a la configuración vigente y registrar diferencias en el PR. No crear una segunda entrada 80/443 ni automatizar el despliegue por push.

## Integración prevista

| Pieza                         | Encaje operativo                                                                                                                                     | Condición de aceptación                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Caddy                         | Ruta específica /api/desarrollo-seguro/* hacia DS API antes de /api/* general; TLS interno verificado como el resto de la aplicación.                | Las peticiones de DS nunca llegan a Grumphya API; sus rutas previas no cambian.                    |
| Nginx/web                     | Conservar `prototype-desarrollo-seguro/` en /desarrollo-seguro/ y montar el build DS bajo /desarrollo-seguro/app/* con fallback solo en ese prefijo. | Recargar una URL profunda de DS funciona; CSP, activos locales y SPA principal siguen correctos.   |
| DS API                        | Servicio propio en red interna, sin puerto host, con health check y usuario no privilegiado.                                                         | Admite solo peticiones de Caddy y solo credenciales de DS.                                         |
| DS worker                     | Servicio separado sin puerto host, con lease de cola, límites de concurrencia y recuperación.                                                        | Su caída no tumba API, proxy ni Grumphya; ningún aprobado caducado se ve como vigente.             |
| DS probe + conector de salida | Contenedores sin secretos de aplicación, egreso filtrado y recursos acotados.                                                                        | Solo hacen conexiones públicas 80/443 validadas; firewall y tests adversarios confirman el límite. |
| PostgreSQL                    | Misma instancia/volumen físico, base lógica desarrollo_seguro y roles DS sin privilegios sobre Grumphya.                                             | Migraciones propias, backups/restores identificables y prueba de denegación entre roles.           |

El volumen de PostgreSQL de producción ya está inicializado: no depender de docker-entrypoint-initdb.d para crear la base o roles. El aprovisionador local actual acepta una URL administrativa arbitraria, puede modificar roles globales y no aplica un gate de destino/opt-in; ejecutarlo solo contra un cluster local dedicado, nunca contra la instancia compartida ni producción. Una futura provisión productiva requiere autorización y un flujo separado y controlado con guardas explícitas. Preparar ese procedimiento administrativo **idempotente y de una sola vez** con secretos entregados por el flujo vigente; después ejecutar migraciones DS con un rol limitado. Documentar el procedimiento de recuperación de backups y verificarlo en aislamiento antes de activar la captura de resultados. No ejecutar ese paso en este trabajo de documentación.

El Dockerfile y la preparación de workspace actuales copian apps/api y apps/web; al añadir apps DS, ajustar manifiestos, build y contexto de imagen. No publicar source maps, trazas con cuerpos de páginas ni credenciales. Fijar dependencias y escanear imágenes según gates existentes.

## Presupuesto de capacidad

Antes de habilitar la búsqueda pública y el scheduler, medir en el VPS real CPU, memoria, swapping, espacio, latencia p95 y errores de Grumphya durante un periodo basal y durante escaneos representativos. El perfil inicial limita la navegación a **una ejecución simultánea**, con presupuestos de páginas, bytes, tiempo y procesos fijados en [scanner-safety.md](scanner-safety.md). Establecer límites de CPU/memoria/pids por contenedor y una reserva de capacidad para Grumphya y PostgreSQL. El script de medición descrito abajo ayuda a recoger una parte de estas métricas; se deben registrar método y umbrales concretos en el PR antes de activar el servicio. No inventar que 2 vCPU/4 GB sobran.

### Recolector de capacidad del VPS

El script `apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-worker/scripts/measure-vps-capacity.mjs` recoge muestras de solo lectura del host Linux: load average, memoria disponible, swap total y usado, espacio disponible en `/`, número de CPU, y uso/PIDs de contenedores que informa `docker stats`. Resume percentiles y mínimos. La frecuencia de muestreo es configurable entre 5 y 60 segundos (por defecto, 10), y la duración entre 60 y 3600 segundos (por defecto, 300). Puede hacer, de forma opcional, un `GET` solo a `https://grumphya.com/api/health`; no sigue redirecciones y trata cualquier respuesta distinta de 200, incluidos los 3xx, como error. Resume número de solicitudes correctas/erróneas y p95 de latencia de las respuestas 200. El health GET no implementa DNS/IP pinning: si la resolución DNS estuviera comprometida podría alcanzar una dirección interna. Es un helper local de capacidad, no el futuro scanner controlado, y solo debe ejecutarse con controles de egress que impidan conexiones a redes internas. No ejecuta comandos que cambien configuración, no inicia contenedores, no encola ni inicia scans y no evalúa los resultados de seguridad. La opción `--label=controlled-scan` solo etiqueta la ventana observada; no inicia una prueba. La opción `--output` crea un archivo JSON nuevo con permisos de propietario y falla si ya existe.

El recolector Node todavía **no se ha ejecutado en el VPS**. Requiere Linux y acceso a Docker para obtener métricas de contenedor; el health check es opcional. El JSON contiene nombres de contenedores, métricas del host y estructura/configuración básica del entorno. El archivo creado con `--output` usa permisos `0600` y no sobrescribe archivos, pero sin esa opción el JSON se imprime por stdout y puede terminar en logs; no lo adjuntar a CI ni a logs públicos, y proteger también cualquier artefacto guardado. Tras autorización para medir capacidad, una línea base puede tomarse así desde la raíz del repositorio:

```sh
node apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-worker/scripts/measure-vps-capacity.mjs \
  --label=baseline \
  --duration-seconds=300 \
  --interval-seconds=10 \
  --health-url=https://grumphya.com/api/health \
  --output=/tmp/ds-vps-capacity-baseline.json
```

#### Línea base preliminar del VPS (2 de noviembre de 2026)

Durante una ventana inactiva de aproximadamente cinco minutos se recogieron 31 muestras a intervalos de 10 segundos. La conexión SSH usó verificación estricta de host contra el `known_hosts` existente; no se realizó una comprobación fuera de banda durante esta ejecución. Como el VPS no tiene Node.js, el recolector descrito arriba no pudo ejecutarse: se usó un equivalente puntual en Python, de solo lectura. No se dejó ningún archivo en el VPS; los datos exactos se conservan únicamente en un artefacto local privado con permisos `0600`, no versionado, y no se incluye su ruta aquí.

La ventana no mostró presión aparente de recursos mientras el VPS estaba inactivo. Este resultado cualitativo no demuestra capacidad bajo escaneo ni aporta el p95/los errores de la aplicación. No se hizo health probe ni escaneo controlado. La línea base es preliminar: **la fase 0 no está completamente cerrada** y no habilita executor, escaneos ni despliegue. El recolector Node documentado arriba sigue sin haberse ejecutado en el VPS; el equivalente Python tampoco valida su ejecución ni su comportamiento.

Sin `--health-url`, no hace solicitudes de red. Usar `--label=controlled-scan` únicamente durante una prueba controlada que ya haya superado los gates de rúbrica, DNS/IP pinning, firewall/egress y capacidad. La ejecución real de esa prueba requiere autorización y el flujo operativo aprobado por separado; el recolector nunca la inicia. Revisar el JSON en almacenamiento con acceso controlado y consignar en el PR un resumen que no revele nombres de contenedores ni detalles innecesarios; adjuntar el artefacto solo si el destino tiene acceso restringido. El p95 del probe es solo la latencia del endpoint de salud, no la latencia p95 de usuarios en Grumphya; la evaluación de degradación y errores de la aplicación requiere métricas/monitorización complementarias.

Puerta: cero OOM y swapping sostenido, sin incremento material de errores ni degradación de latencia p95 de Grumphya frente a la línea base acordada, y suficiente espacio para resultados/backups. Si falla, reducir el presupuesto o dejar la captura pública deshabilitada; la ficha dirá no evaluable o caducado. No degradar Grumphya para sostener un sello.

## Seguridad y privacidad operativas

- Sin cookies de terceros, scripts, píxeles, fuentes, iframes ni recursos remotos en Grumphya ni en el sello. Clic y búsqueda son acciones explícitas bajo el mismo origen.
- Logs DS mínimos, sin HTML completo ni valores de cookies. Truncar/redactar direcciones y cabeceras sensibles, definir retención, impedir que destinos escaneados escriban logs descontrolados.
- Rate limit y cuota de consulta por origen y dominio; backpressure global. El scheduler de grumphya.com tiene prioridad acotada, sin monopolizar CPU.
- Métricas: duración y cola, antigüedad del último resultado, errores por control, denegaciones SSRF, carga/latencia del VPS y ocupación de DB. Alertar por stale prolongado, lease atascado y capacidad.
- Secretos DS distintos y rotables; no compartir claves de sesión, OpenAI, correo ni credenciales de Grumphya. Probe sin secretos de base.
- El escaneo desde el propio VPS de grumphya.com puede atravesar el IP público o el hairpin del proveedor. Probar que la ruta realmente toca la entrada pública y anotar el camino observado; si la red no lo permite, marcar no evaluable hasta resolverlo, sin sustituirla silenciosamente por una llamada interna.

## Release, smoke y reversión

El workflow actual de producción se lanza manualmente desde main con approve_production_deploy y PRODUCTION_DEPLOY_ENABLED=true. Conservar esta puerta. Antes de la aprobación de publicación, completar PR/CI, migración en entorno de prueba, pruebas de límites, carga y restauración. Una release incorpora los servicios DS en el Compose compartido; el humo valida rutas antiguas de Grumphya, landing, DS API, consulta, estado, un escaneo controlado y que la ficha académica siga identificada como demostración.

Preparar reversión de imagen/Compose que **no borre ni reinterprete** los scan_runs guardados. Cambios de esquema DS expansivos primero; no lanzar migraciones destructivas junto a la primera publicación. Si la DS API falla, retirar sus rutas/feature flag sin interrumpir Grumphya. Probar ese procedimiento en entorno representativo y documentar las órdenes exactas en doc/production.md cuando Luna implemente.

El dominio desarrolloseguro.com, repo, despliegue, instancia o volumen de datos propios y una sonda realmente externa pertenecen a una fase posterior.
