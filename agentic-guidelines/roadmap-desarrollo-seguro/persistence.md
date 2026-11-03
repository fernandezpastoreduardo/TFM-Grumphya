# Persistencia y ejecución horaria

## Frontera de datos

Usar una **base lógica desarrollo_seguro y roles propios dentro de la instancia PostgreSQL existente**. Se comparte proceso, almacenamiento físico, TLS y VPS; no se comparten tablas, usuario de runtime, migrador ni credenciales de Grumphya. API y worker emplean pools pequeños y roles de mínimo privilegio. Las migraciones de Desarrollo Seguro viven en su app y se ejecutan como job de la misma release. La provisión de base/roles para un volumen ya existente es una tarea administrativa idempotente y auditada, no un script de initdb que solo funcionaría al crear el volumen. No hay claves foráneas a cuentas, ideas o sesiones de Grumphya.

## Tablas lógicas

| Tabla            | Campos principales                                                                                                                               | Invariantes                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| ds_domains       | hostname canónico PK, enrollment, scope_version, opted_out_at, created_at                                                                        | Un hostname por dominio; monitored solo por alta del operador/titular. Buscar no cambia enrollment.      |
| ds_scan_jobs     | UUID PK, hostname FK, profile_version, trigger, state, queued_at, available_at, lease_until, attempts, finished_at, public_error_code            | Un solo job activo por hostname + perfil mediante índice parcial; lease permite recuperar worker muerto. |
| ds_scan_runs     | UUID PK, job_id único, hostname FK, profile_version, scanner_version, vantage, started_at, completed_at, expires_at, verdict, scope_json acotado | Resultado confirmado inmutable; expires_at calculado desde completed_at.                                 |
| ds_check_results | run_id FK, control_id, status, required, severity, observed_at, target_path, method, summary, limitation, evidence_json redactado                | Un control/objetivo por run; no duplicados ni datos crudos.                                              |
| ds_scan_metrics  | run_id FK, requests_count, bytes_count, duration_ms, pages_count                                                                                 | Datos agregados para coste y límites, sin IP de visitantes.                                              |

El nombre concreto de tablas puede adaptarse al estilo SQL del proyecto, pero las invariantes y separación permanecen. Guardar profile_version como texto inmutable del catálogo, no un puntero mutable a reglas actuales. El caso académico histórico permanece en la API/almacenamiento Grumphya hasta que se retire con migración propia; no se copia como ejecución del escáner.

## Cola y single flight

El endpoint y el scheduler llaman al mismo EnsureFreshScan en una transacción. Primero consultan el último run completo del perfil vigente. Si completed_at está dentro de los últimos 60 minutos, devuelven caché. Si no, intentan insertar un job activo; la restricción única resuelve carreras entre clics, búsquedas y scheduler. El worker reclama trabajos con bloqueo de fila tipo FOR UPDATE SKIP LOCKED, asigna lease corto y heartbeat. Al caducar el lease, otro worker puede recuperar; la finalización inserta run/checks y marca job completed en una única transacción. Repetir el cierre con el mismo job no duplica runs.

El scheduler consulta solo dominios monitored y calcula due_at a partir del último resultado completo y del último intento; limita reintentos ante fallos para no generar una tormenta horaria. Un fallo del propio worker puede reintentarse con backoff acotado; una respuesta de rechazo del dominio se registra como inconclusive y espera a la siguiente ventana. La hora de publicación no depende de cron exacto: después de 60 minutos sin resultado completo el informe ya es stale aunque el job se retrase.

## Retención y borrado

Por defecto, conservar informes y checks públicos 90 días para trazabilidad; datos de jobs fallidos/diagnósticos operativos 7 días; métricas agregadas 90 días. No guardar HTML, capturas, cuerpos de respuesta, valores de Cookie/Set-Cookie, parámetros de consulta, tokens ni IP de visitantes. El host consultado se guarda solo si el scan fue admitido; una búsqueda sin scan no crea fila. Permitir opt-out administrativo y purga de diagnósticos on_demand conforme a política documentada; una petición de exclusión no borra la evidencia de un incidente operativo que deba conservarse por obligación concreta. Revisar estos plazos antes de producción.

Backups: pg_dump de desarrollo_seguro verificable y restauración aislada. Aunque el dump sea separado, el volumen y el fallo físico de PostgreSQL siguen compartidos con Grumphya. El release debe probar que migraciones y rollback de código no corrompen datos existentes.
