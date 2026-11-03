# Orden de ejecución para Luna

## Mandato y condiciones

Implementar la **primera fase operativa dentro del despliegue actual de Grumphya**: mismo dominio grumphya.com, VPS, repositorio y release manual, con componentes DS aislados y escaneo real de bajo impacto. Seguir [README.md](README.md), el perfil [controls-and-evidence.md](controls-and-evidence.md), la seguridad [scanner-safety.md](scanner-safety.md), y el gate operativo [operations.md](operations.md). La fase técnica local está implementada. `controls-v1` conserva el perfil original de nueve controles; las migraciones `005_controls_v2_route_coverage.sql` y `006_controls_v3_https_headers.sql` y el core mantienen los perfiles aditivos `controls-v2`/`controls-v3` con cobertura exacta por ruta, y v3 exige `finalScheme=https` para que DS-HDR-01 pueda quedar en `pass`. La suite PostgreSQL aislada pasó 65/65, 0 omitidas, después de migration 006; el limitador de lecturas tiene pruebas específicas para cuotas y `Retry-After`, pero falta la suite global del slice. Nada está desplegado ni incluido en runtime/Compose de producción. Aún no hay probe ni executor de red y no se realizan escaneos reales. La etapa de executor/red permanece bloqueada hasta cerrar DNS/IP pinning, firewall/egress y medición de capacidad real del VPS. El bootstrap standalone de API escucha en `0.0.0.0:3001`; antes de integrarla en Compose debe limitarse a red interna y quedar accesible solo desde Caddy. La autorización de desarrollo no autoriza escaneos públicos, cambios en la base productiva ni un despliegue; estos requieren superar sus gates y el flujo manual aprobado.

Antes de cada siguiente slice, revisar AGENTS.md y el estado real del repo, Compose, Caddy/Nginx y workflows; registrar discrepancias con el diseño. No asumir que el prototipo o datos académicos son resultados reales. Mantener el cambio concentrado en DS, rutas compartidas necesarias y sello local.

## Entregas en slices verticales

### 0. Contrato, seguridad y prueba de capacidad

- Mantener `controls-v1` como contrato histórico intacto y versionar cualquier cambio de cobertura o criterios. `controls-v2` conserva la regla HEAD 405/501 + redirección HTTPS confirmada + esquema final HTTPS => `unknown`; `controls-v3`, añadido por migration 006, hereda esa regla y la cobertura exacta por ruta, y exige además `finalScheme=https` para permitir `pass` en DS-HDR-01. El core y PostgreSQL validan el gate v3. El evaluador local `security-headers-v1` define señales de HSTS, nosniff, protección de marcos, Referrer-Policy y CSP, pero la recolección desde una respuesta real sigue pendiente del executor. Cualquier otro cambio de criterios requiere una versión de perfil propia. Antes del executor, cerrar las rúbricas que siguen pendientes y resolver cualquier control que no pueda medirse con fiabilidad como unknown o advisory; no aprobarlo por defecto.
- El worker contiene un adaptador DNS aislado compatible con `LookupFunction`, con deadline de cinco segundos y un límite de dos resoluciones simultáneas para instancias por defecto que comparten esta instancia del módulo. No limita llamadas DNS ajenas al adaptador ni otras copias del módulo. El timeout no cancela `dns.lookup`/`getaddrinfo`, y la plaza permanece ocupada hasta que termine la resolución subyacente. Antes de integrarlo a HTTP/executor, reservar capacidad del threadpool de libuv o usar un resolver dedicado, y fijar límites globales de tasa/concurrencia del proceso. Documentar su integración en la arquitectura de probe/conector, el bloqueo de red aunque falle la validación de aplicación, rutas de grumphya.com y presupuesto de escaneo. El adaptador no implementa la frontera completa. Revisar viabilidad de IP pública desde el mismo VPS.
- El seam local `createPinnedHttpsHeadRequest` prepara `HEAD /` a HTTPS/443 con hostname normalizado en `Host`/SNI, `lookup` pinned y `agent: false`; no llama a `.end()` y no abre socket. Las pruebas usan un `requestFactory` falso y no hacen DNS ni tráfico. No es un executor, no sigue redirecciones y no demuestra selección de IP por el socket, TLS/certificado real ni firewall. Antes de cualquier executor siguen pendientes integración y pruebas de esas fronteras; no habilita scans.
- La auditoría read-only del firewall Linux/Docker local del 2 de noviembre de 2026 no demuestra una barrera de egress efectiva. No se revisaron el firewall del proveedor/cloud ni la ruta de red efectiva, y no se probó conectividad ni se cambió configuración. Mantener el gate de firewall/egress bloqueado hasta validar reglas efectivas para IPv4 e IPv6; el resumen está en [operations.md](operations.md#auditoría-de-egress-del-vps-solo-lectura-2-de-noviembre-de-2026).
- Levantar una línea base de capacidad del VPS y definir límites y umbrales en el PR. Si el hardware impide una sonda segura dentro de los límites, parar la publicación operativa y comunicar la causa.
- Escribir tests de amenaza y veredicto que fallen antes de implementar.

**Salida:** contratos y umbrales aprobables, fixtures de red, plan de observabilidad y evidencia de que el aislamiento es realizable.

### 1. Núcleo y persistencia DS

- Crear los componentes y paquetes DS sin imports de negocio Grumphya. Configurar build del monorepo y pruebas propias.
- Aprovisionar base lógica y roles DS de forma idempotente en entorno de prueba, migraciones propias, tablas de dominios, jobs, runs y controles. Separar roles de lectura/ejecución/migración.
- Implementar máquina de estados, cálculo de TTL exacto desde completed_at, historial inmutable, perfil versionado, lease, recuperación y singleflight.
- Tests TDD para frescura, concurrencia, reintentos, aislamiento de roles e invariantes de veredicto.

**Estado:** fase técnica 1 completada en local: paquetes, esquema y almacén PostgreSQL, contratos/pruebas, health API, endpoints GET de estado/informe y processor. No se ha provisionado ni migrado PostgreSQL de producción.

**Límites:** además de health, la API local expone solo lecturas de estado e informes. No admite ni crea jobs, no inicia scans; tampoco hay UI de consulta desplegada, proceso worker arrancable ni executor real. El puerto de executor no convierte los jobs en escaneos.

### 2. Guardas de ingesta completadas; executor/red bloqueado

- El endurecimiento local de ingesta implementa allowlists, summaries/limitaciones fijos, evidencia mínima y derivación de estado entre TypeScript y SQL. `controls-v1` conserva los nueve IDs y su contrato original. `controls-v2` se añadió mediante `005_controls_v2_route_coverage.sql` sin recalificar v1 ni reutilizar su caché: exige DNS-01 + TLS-01 + TLS-02 una vez por host y, por cada ruta declarada, HTTP-01 HEAD/GET, HDR-01 GET, PRIV-01/02/03 GET y QUAL-01 GET. `controls-v3`, añadido por `006_controls_v3_https_headers.sql`, mantiene esa cobertura y exige `finalScheme=https` antes de permitir `pass` en DS-HDR-01. Total: 10, 17 o 24 checks para una, dos o tres rutas. La cobertura exacta y el guard de esquema se validan en core y PostgreSQL. La suite PostgreSQL aislada tras 006 pasó 65/65, 0 omitidas el 3 de noviembre de 2026.
- Para `grumphya.com`, el scope admitido queda limitado a `/`, `/precios` y `/acreditaciones/DS-GRUMPHYA-2026-001`; para otros dominios solo `/`. La política tipada por control está descrita en [controls-and-evidence.md](controls-and-evidence.md).
- En v2 y v3, un `HEAD` 405/501 con redirección HTTPS confirmada y esquema final HTTPS se normaliza a `unknown`; no puede sostener un `pass`. V3 no modifica el comportamiento histórico de v1/v2; requiere HTTPS explícito para aprobar DS-HDR-01. El evaluador `security-headers-v1` está descrito en [controls-and-evidence.md](controls-and-evidence.md); la extracción de señales desde respuestas reales no está conectada al executor. El worker incluye `createPinnedLookup`, que normaliza hostname y vuelve a resolver/valida todas las respuestas A/AAAA en cada invocación; el adaptador no se conecta al puerto executor, así que el pinning de la conexión y la revalidación en cada conexión/redirección siguen pendientes. El firewall/egress y capacidad también están pendientes.
- Estas guardas locales no conectan a ningún dominio ni equivalen a protección SSRF completa. La ejecución de red solo puede avanzar tras definir las rúbricas pendientes, añadir DNS/IP pinning y revalidación por conexión/redirección, disponer y probar firewall/egress que bloquee redes internas y terceros, y medir que el VPS soporta los límites del probe sin degradar Grumphya.

- Implementar admisión de hostname, DNS/TLS/HTTP, comprobación de cabeceras y navegador limpio por fases, con presupuesto global y firewall/proxy de salida. Se registran y bloquean intentos de terceros. Aplicar robots a rutas muestreadas.
- Probar cada control contra fixtures pass/fail/unknown y pruebas adversarias de SSRF reales. Registrar rutas, hora, método, versión y evidencia redactada.
- Ejecutar un escaneo controlado de grumphya.com desde el VPS solo tras validar límites; comprobar la perspectiva pública real. Repetir hasta obtener resultados estables, sin forzar un aprobado.

**Salida:** informe íntegro y trazable, con exactitud de fuente same_vps y cobertura.

### 3. API pública, portal y sello

- Implementar contratos de [DTOs.md](DTOs.md), búsqueda de dominio público acotada, cuotas, 200 de caché y 202 de trabajo único, polling y errores.
- Los GET locales de estado/informe ya aplican ventana fija: 60/minuto por IP efectiva, 120/minuto por hostname para `status`, 120/minuto por UUID válido para `reports`, 300/minuto global y `429` con `Retry-After`. Antes de exposición real, validar umbrales y configurar `DS_TRUSTED_PROXY_CIDRS` solo para la IP/subred interna mínima del proxy; vacío por defecto y rechazo de wildcard `/0`. Si se despliega más de una instancia, usar almacenamiento compartido; el limitador en memoria es por proceso.
- Montar web DS en /desarrollo-seguro/app/ y conservar la landing. Mostrar informe, historial, antigüedad, alcance, límites, resultados unknown y estados no vigentes. Accesibilidad y recursos locales.
- En el footer, cambiar texto/arte neutral a un enlace local al informe operativo; no insertar scripts ni recursos terceros. Mantener la ficha /acreditaciones/ histórica como demostración y enlazar desde ella al informe.
- Tests de UI/E2E y privacidad para entrada por búsqueda y por sello.

**Salida:** ambos caminos generan la misma consulta, sin confundir datos del TFM con evidencia operativa.

### 4. Horario, despliegue y activación gradual

- Activar scheduler solo para grumphya.com verificado, con intervalo de 60 minutos, idempotencia, cuotas y prioridad limitada. Monitorear stale/errores, leases, carga y almacenamiento.
- Integrar Caddy, Nginx, Dockerfile, Compose, CI y workflow manual de producción, con TLS interno y roles/secretos propios. Documentar aprovisionamiento, backup/restore, smoke y rollback.
- Completar CI, pruebas de carga y seguridad, varios ciclos horarios reales y revisión humana de falsos positivos y textos. La aprobación de despliegue sigue el workflow_dispatch vigente; no activar la búsqueda pública antes de superar las puertas.
- Si una puerta falla, dejar el estado como no evaluable/caducado y resolver el problema. No reducir silenciosamente el perfil para conseguir un sello.

**Salida:** fase operativa verificable sin dominio ni hosting nuevo, con Grumphya estable y un procedimiento de reversión probado.

## Criterio final de aceptación

Se puede mostrar «cumple controles observables v1» **solo** con escaneo completo de menos de 60 minutos, perfil vigente, muestra declarada y todos los obligatorios evaluables aprobados. Fallo, unknown, error de red o vencimiento no dan aprobado. El informe debe revelar la fuente same_vps. El siguiente proyecto independiente se planifica cuando exista dominio y una decisión de migración; no forma parte de esta entrega.
