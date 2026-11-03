# DTOs y API operativa

La API local implementa health y dos endpoints públicos de **solo lectura**: `GET /api/desarrollo-seguro/v1/domains/:hostname/status` y `GET /api/desarrollo-seguro/v1/reports/:reportId`. Ambas respuestas usan `Cache-Control: no-store`; proyectan campos públicos y excluyen `evidence_json` crudo. PostgreSQL refuerza la proyección: roles runtime no pueden seleccionar la columna `evidence_json` ni el `lease_token`. Leer estado no genera tráfico al dominio, no crea ni encola trabajos y nunca inicia un scan. Si no hay datos del dominio, devuelve `not_scanned`. Estos endpoints aún no están desplegados ni conectados a una UI de consulta. Antes de hacerlos públicos hay que añadir y probar rate limiting en la API o proxy; siguen sin definirse los umbrales. Las rutas de admisión y seguimiento de trabajos descritas más abajo siguen siendo contratos objetivo, no servicio disponible.

## Reglas comunes

Todos los datos procedentes de HTTP, DNS, TLS y navegador se tratan como unknown y se validan antes de usarlos. Los DTO públicos son proyecciones explícitas, sin filas completas, valores de cookies, cuerpos HTML, tokens, IP de visitantes ni cabeceras con datos personales. Fechas ISO 8601 UTC; la UI puede añadir hora Europe/Madrid. Los contratos versionados viven en el núcleo de Desarrollo Seguro y se prueban entre API, worker y web. Las rutas aquí propuestas son del **mismo origen grumphya.com**.

**Hostname de entrada:** IDNA/ASCII en minúsculas, 1–253 caracteres, etiquetas 1–63, al menos dos etiquetas, sin esquema, usuario, puerto, IP literal, ruta, consulta ni fragmento. Rechazar localhost y sufijos reservados. No aceptar una URL que el usuario controle como destino. La validación sintáctica precede a DNS; el conector repite la validación de IP pública en cada conexión y redirección.

## GET /api/desarrollo-seguro/v1/domains/:hostname/status

Lectura local de persistencia, sin efecto de red. Devuelve 200 con:

| Campo       | Tipo                                              | Semántica                                                                   |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| hostname    | string                                            | Host canónico de la consulta.                                               |
| enrollment  | monitored o on_demand                             | Solo monitored recibe scans horarios y puede asociarse a sello.             |
| state       | fresh, updating, stale, not_scanned o unavailable | Estado actual; no se deriva en cliente a partir de una fecha del navegador. |
| activeJobId | UUID o null                                       | Trabajo compartido si está en cola o ejecución.                             |
| lastReport  | PublicReport o null                               | Último informe completo, incluso histórico, con etiqueta de antigüedad.     |
| checkedAt   | instante UTC                                      | Hora del servidor usada para calcular fresh/stale.                          |

Si no existe snapshot, responde `state=not_scanned`, `enrollment=on_demand`, `activeJobId=null` y `lastReport=null`. Un informe anterior puede acompañar updating o stale, pero la UI no debe mostrarlo como aprobación vigente. La respuesta lleva `Cache-Control: no-store`. El endpoint no crea ni encola un trabajo.

## POST /api/desarrollo-seguro/v1/scan-requests

Cuerpo: hostname. Exigir Content-Type JSON, límite de tamaño pequeño y Origin del mismo origen para navegador; no usar cookies de Grumphya como autorización. El caso de uso valida host, opt-out, cuota y capacidad antes de encolar; el probe consulta robots antes de acceder a rutas de contenido. Responde 200 kind=cached con PublicReport si existe informe completo del perfil vigente con completedAt hace menos de 60 minutos; responde 202 kind=queued o kind=running con jobId y URL de consulta si está vencido o ausente. Peticiones simultáneas comparten trabajo. Un dominio no inscrito queda on_demand y no se programa cada hora.

Errores estables: 400 invalid_hostname, 403 excluded_domain, 429 rate_limited o capacity_reached con Retry-After, 503 scanner_unavailable. No devolver 200 con un informe viejo etiquetado fresh cuando la cola falla. No disparar un scan a través de GET, URL de imagen, crawler o prerender.

## GET /api/desarrollo-seguro/v1/scan-jobs/:jobId

Responde queued, running, completed o failed, con reportId cuando termina. Exponer solo códigos de error públicos y retryAfter, no DNS privados, stack trace ni mensajes del sistema. Polling de la UI con intervalo y duración máxima; al expirar, ofrecer reintento manual y mostrar estado real.

## GET /api/desarrollo-seguro/v1/reports/:reportId

Informe público inmutable existente. Un identificador inválido, inexistente o perteneciente a un dominio excluido devuelve 404; la exclusión administrativa oculta también las consultas directas por ID. Un fallo de almacenamiento devuelve 503. Respuesta `Cache-Control: no-store`. La proyección omite `evidence_json` y cualquier valor privado de persistencia:

| Campo                                        | Tipo                        | Semántica                                                                          |
| -------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| id, hostname, profileVersion, scannerVersion | string                      | Identidad y reglas exactas.                                                        |
| vantage                                      | same_vps                    | Observación desde el VPS que también aloja Grumphya; no independiente.             |
| trigger                                      | scheduled o requested       | Origen del trabajo.                                                                |
| startedAt, completedAt, expiresAt            | instantes UTC               | expiresAt = completedAt + 60 minutos para la frescura pública.                     |
| verdict                                      | pass, fail o inconclusive   | pass solo si todos los controles obligatorios aplicables se evaluaron y aprobaron. |
| scope                                        | lista de host/rutas/métodos | Muestra real, no promesa de todo el sitio.                                         |
| checks                                       | lista PublicCheck           | Evidencia mínima y limitaciones.                                                   |
| disclaimer                                   | texto                       | «Comprobación técnica acotada desde el mismo VPS; no certificación independiente». |

Cada `PublicCheck` incluye `controlId`, `status`, `required`, `severity`, `observedAt`, `targetPath`, `method`, `summary` y `limitation`; la versión del perfil está en el informe. La lógica objetivo: un fail obligatorio determina fail; si no hay fail y existe unknown obligatorio, inconclusive; si todos los obligatorios aplicables pasan, pass. not_applicable requiere justificación publicada; nunca se usa para tapar error. Una ejecución parcialmente interrumpida no produce un pass.

## Compatibilidad del prototipo anterior

GET /api/accreditations/DS-GRUMPHYA-2026-001 conserva su contrato y estado demonstration hasta una migración explícita de consumidores. /acreditaciones/DS-GRUMPHYA-2026-001 identifica su revisión interna histórica y enlaza al informe nuevo. No insertar completedAt, expiresAt ni veredictos del escáner en los campos issuedAt/validatedAt manuales del registro antiguo. El nuevo portal es fuente de resultados operativos.
