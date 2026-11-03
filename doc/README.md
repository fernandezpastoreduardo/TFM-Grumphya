# Infraestructura y desarrollo de Grumphya

Esta carpeta documenta el stack instalado, su operación y el estado de las features. El repositorio contiene el frontend y API, conexión a PostgreSQL/pgvector, captura de ideas, dictado de voz, evaluación configurable, búsqueda semántica y persistencia de ideas rechazadas.

La fase técnica local de Desarrollo Seguro y el endurecimiento de ingesta están completados y validados localmente: tras migration 006, `controls-v3` requiere `finalScheme=https` para permitir `pass` en DS-HDR-01, manteniendo los contratos de v1/v2; PostgreSQL aislado pasó 65/65, 0 omitidas, el 3 de noviembre de 2026. La API local aplica límites en memoria a sus GET (por IP, hostname/UUID y global); la suite del paquete API pasó 52/52, incluidas comprobaciones HTTP de loopback con stub local, sin base de datos ni red externa; no se ha desplegado. El portal React de consulta está integrado localmente en `/desarrollo-seguro/app`, usa solo GET y requiere que el API responda por la ruta configurada. El executor/red sigue bloqueado por DNS/IP pinning, firewall/egress y capacidad VPS. No hay sonda ni escaneos reales; la migración no se aplicó a PostgreSQL de producción y no hay despliegue. Consulta el [roadmap de Desarrollo Seguro](../agentic-guidelines/prototype-desarrollo-seguro/README.md) y su [estado de componentes](../agentic-guidelines/prototype-desarrollo-seguro/components.md).

El alta con plan crea una cuenta pendiente y envía un enlace de verificación de un solo uso. Tras verificar el correo, la persona confirma explícitamente la contratación simulada; solo entonces se activan la cuenta, suscripción, compra y sesión en una transacción. No se procesa dinero real. Consulta [recuperación de contraseña](password-reset.md) para el flujo de restablecimiento. La autenticación usa access JWT de 10 minutos y refresh token rotatorio en cookie HttpOnly; el perfil y sus acciones requieren sesión válida y consultan los permisos del plan en el servidor. Las cuentas editan su avatar desde un diálogo con recorte, zoom y previsualización circular; la imagen se procesa en servidor a WebP de 128 × 128, se modera con OpenAI usando la clave existente y se conserva en un volumen Docker propio. El avatar aparece redondo en el perfil y, en rankings de cuenta, solo si la persona autorizó participar. La política de privacidad versión 4 está en [`Política de privacidad`](../apps/web/src/features/register-with-plan/privacy-policy.tsx); antes de producción deben verificarse contratos y ajustes efectivos de proveedores, copias, logs y medidas para menores. La contraseña exige 12–128 caracteres con mayúscula, minúscula, número y carácter especial.

La cuenta administrativa Jappy se aprovisiona de forma explícita e idempotente desde desarrollo o producción; un reinicio de la API no modifica su contraseña ni sus sesiones. El panel privado está en `/panel-control`. Además del resumen de ingresos simulados, coste estimado de IA, errores 5xx agregados y bandeja de contacto, el panel muestra proyecciones máximas por plan, suscripciones vigentes por semana y una comparación mensual de ingresos simulados frente a gastos estimados. Las fórmulas y límites se explican en el [panel de administración](admin-dashboard.md). La pestaña Benchmark solo explica la estructura de un informe sintético: no ofrece un comando desde el panel ni conecta resultados o historial. La telemetría agrega actividad de IA de las últimas 24 horas por hora, operación y modelo, muestra tokens en rangos y oculta grupos con menos de tres usos. Seguridad y acceso muestra métricas de login agregadas en una ventana móvil de 15 minutos, volátiles por proceso y sin IP ni usuario. En errores 5xx muestra el diagnóstico seguro más reciente cuando existe; no expone texto de ideas ni contextos de solicitud, y la migración `036_redact_application_error_context.sql` pone a `NULL` los contextos históricos en la base. Los errores 4xx esperables no se cuentan. Ninguna pestaña ejecuta comparaciones, escaneos ni pruebas desde el navegador. El servidor vuelve a comprobar el rol para las rutas administrativas. Una sesión de navegador usa una sola cookie de refresh compartida entre pestañas: al iniciar otra cuenta las pestañas se recargan y usan la sesión nueva. Los perfiles de navegador separados mantienen sesiones independientes, mientras el cupo gratuito sigue compartido por perfil según su política.

Las cuotas gratuitas son independientes por ámbito: una cuenta sin Iluminado conserva sus tres evaluaciones gratuitas y una cuenta sin Faltón conserva sus tres envíos gratuitos del perfil de navegador. Un plan activo solo aplica a su ámbito y no consume el cupo gratuito del otro.

Las cuotas anónimas son 3 evaluaciones y 3 roasts por perfil de navegador, en contadores independientes; el perfil y sus contadores se purgan tras 400 días de inactividad, con reserva e idempotencia en PostgreSQL. Iluminado permite 11 evaluaciones diarias y Faltón 11 roasts diarios si la suscripción correspondiente está activa. La API reserva el uso transaccionalmente, lo confirma al devolver un resultado válido y libera la reserva ante error. El día se calcula en `Europe/Madrid`, también en los cambios estacionales de hora. Una misma clave y payload devuelve la respuesta cacheada sin duplicar consumo; su TTL lógico es de 24 horas desde la reserva original. La caché guarda el cuerpo de respuesta completo y puede contener salida derivada de la solicitud; las filas vencidas se eliminan al iniciar la API y cada hora. Una reserva incompleta devuelve `409` durante 30 minutos y después puede recuperarse. Las cachés vencidas se purgan por lotes cada hora; el corpus de rechazos y su agregado histórico se purgan tras 24 meses desde la última recepción. Se conservan HMAC de IP solo durante 24 horas para limitar la creación a 20 perfiles; las solicitudes de ideas y roast están limitadas a 10/minuto/IP y la API general a 120/minuto/IP, en memoria por proceso. La similitud usa OpenAI `text-embedding-3-small` y pgvector; la API incrementa una vez los rechazos repetidos y conserva título seguro, embedding y contador por 24 meses. La política de privacidad versión 4 está publicada en [`/politica-de-privacidad`](../apps/web/src/features/register-with-plan/privacy-policy.tsx). Consulta el [contrato de uso anónimo](anonymous-usage.md) y el [plan de seguridad del registro y similitud](security-and-similarity-roadmap.md).

## Documentos

- [Dirección e implementación de la UI](ui.md)
- [Stack instalado y versiones](stack.md)
- [Desarrollo local](development.md)
- [Línea base de calidad y cobertura](quality-baseline.md)
- [Límites de uso anónimo](anonymous-usage.md)
- [Producción](production.md)
- [Incidencia de acceso al VPS y despliegue (octubre de 2026)](incident-vps-access-and-deployment-2026-10.md)
- [Evaluación de IA, seguridad y observabilidad](ai-evaluation-and-observability.md)
- [CI/CD y seguridad de la imagen](ci-cd.md)
- [Fallos recientes de CI (29 de octubre de 2026)](ci-failures-2026-10-29.md)
- [Usuarios, credenciales y secretos](credentials.md)
- [Panel de administración](admin-dashboard.md)
- [Sello demostrativo de Desarrollo Seguro](desarrollo-seguro.md)
- [Roadmap de Desarrollo Seguro y estado de implementación](../agentic-guidelines/prototype-desarrollo-seguro/README.md): fase técnica local e ingesta completadas; portal React local de consulta solo GET integrado en web/Nginx, aún no desplegado. Executor/red bloqueados y todavía sin probe ni escaneos operativos.
- [Perfil, contratación de plan y avatar](user-profile.md)
- [Recuperación de contraseña](password-reset.md)
- [Baja física de cuenta](user-delete.md)
- [Comprobaciones y resolución de problemas](verification.md)

## Estado de preparación

Entorno y stack actuales:

- Node.js 26.13.0 y pnpm 12.5.1. El proyecto admite Node `^26.13.0`; consulta [stack](stack.md) para la política y versiones exactas.
- React 19 + Vite 7, NestJS 12 y TypeScript 6.
- Docker Desktop 4.94.0, Docker Engine 29.8.2 y Compose 5.5.1.
- PostgreSQL 17 con `pgvector` 0.8.7 en Docker Compose.
- Las versiones de herramientas y sus decisiones de actualización están en [stack](stack.md). Las pruebas, compilaciones, lint y endpoints HTTP se documentan con sus resultados históricos en [verificación](verification.md).

El entorno Docker local se verificó en macOS Apple Silicon. Existe un VPS IONOS real; la incidencia de recuperación de acceso y helper está en [su registro operativo](incident-vps-access-and-deployment-2026-10.md). La salud del VPS y la versión activa deben comprobarse después de cada despliegue.

No guardes contraseñas reales, tokens de GitHub, claves SSH ni claves de proveedores en esta carpeta o en Git. Para la caja de producción de un VPS, prepara los archivos ignorados de `.secrets/` con permisos restringidos siguiendo [production.md](production.md); no hay un secret manager integrado. GitHub Actions no despliega automáticamente con cada push: la publicación se inicia desde `workflow_dispatch` en la rama `main`, exige confirmación explícita de la cuenta autorizada y requiere las credenciales SSH y la variable de repositorio descritas en [production.md](production.md).
