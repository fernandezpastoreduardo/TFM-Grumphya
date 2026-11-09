# Revisión de la CSP de producción (noviembre de 2026)

## Estado: no-go

Consulta de solo lectura realizada el **6 de noviembre de 2026, 10:57 UTC**. La respuesta pública de `https://grumphya.com/` devolvió `200`, la CSP limitada en modo de bloqueo y la política completa en `Content-Security-Policy-Report-Only`. `/api/health` identificó la revisión desplegada como `c6e27b32428489fbe3a2519f107b649b6871d3b3`.

El único contenedor API de la aplicación visible con `docker ps -a` se creó el **5 de noviembre de 2026, 18:22:37 UTC**. Sus registros comienzan a las 18:22:55 UTC de ese día y contienen **cero** entradas `csp_violation` en la consulta del 6 de noviembre. Docker usa el controlador de registros `json-file`; no se encontró un archivo de informes CSP en `/opt/grumphya` ni en `/var/log` a profundidad tres. Esta comprobación acredita el resultado de la consulta, pero no un historial continuo de siete días ni que se hayan ejercitado todos los recorridos requeridos.

| Requisito de [producción](production.md#transporte-y-límites-del-cifrado)         | Evidencia disponible                                                                      | Resultado                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------- |
| Al menos siete días consecutivos en Report-Only                                   | Cabecera pública confirmada el 6 de noviembre; contenedor actual creado el 5 de noviembre | Pendiente                        |
| Inicio de sesión, perfil/avatar, dictado, evaluación, rankings y móvil/escritorio | No hay registro de cobertura de estos recorridos durante la ventana                       | Pendiente                        |
| Clasificación y decisión por cada destino observado                               | Cero informes disponibles en el contenedor actual; no hay exportación histórica           | Pendiente de la ventana completa |
| Aprobación del resumen por el responsable                                         | No se ha presentado un resumen completo                                                   | Pendiente                        |

No se amplía la CSP de bloqueo con esta evidencia. **Cero informes en menos de un día no significa cero infracciones durante siete días representativos.** Tampoco permite decidir si un destino legítimo necesita una excepción o si una infracción corresponde a un recurso que debe corregirse.

## Evidencia necesaria para cerrar la revisión

Conservar fuera del repositorio los registros saneados `csp_violation` de cada día UTC y antes de recrear la API en cada despliegue; registrar también los días con cero informes, el intervalo exacto, el SHA activo y la confirmación de que el receptor y la aplicación estuvieron disponibles. Los registros Docker del contenedor anterior pueden desaparecer al retirarlo. El comando de consulta de [producción](production.md#transporte-y-límites-del-cifrado) debe ejecutarse con `--timestamps`, `--since` y `--until` explícitos para que las ventanas no se solapen ni dejen huecos.

Durante esa misma ventana, registrar fecha, navegador/dispositivo y resultado para cada recorrido: inicio de sesión, perfil/avatar, dictado, evaluación, rankings, móvil y escritorio. No incluir credenciales, texto de ideas, mensajes de roast ni datos personales en la evidencia compartida.

Al final de los siete días consecutivos, agrupar cada informe por directiva y destino saneado, y completar una fila por tipo observado:

| Directiva                                        | Destino saneado | Recuento e intervalo | Clasificación y motivo | Decisión: corregir, permitir explícitamente o rechazar | Responsable |
| ------------------------------------------------ | --------------- | -------------------- | ---------------------- | ------------------------------------------------------ | ----------- |
| Pendiente de los informes de la ventana completa |                 |                      |                        |                                                        |             |

La decisión seguirá siendo **no-go** si falta un día, un recorrido representativo, una clasificación o una corrección necesaria. Cuando el resumen completo esté aprobado, aplicar las directivas observadas en `docker/Caddyfile`, conservar Report-Only temporalmente para detectar regresiones y seguir la autorización manual de despliegue descrita en [producción](production.md#despliegue-manual-desde-github-opcional).
