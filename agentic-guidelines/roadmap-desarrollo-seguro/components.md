# Componentes, carpetas y dependencias

## Regla de diseño

Aplicar AGENTS.md: las piezas usadas por una feature quedan locales; solo lo usado realmente por dos o más features pasa a shared. Los nombres describen funciones de negocio. Desarrollo Seguro usa el mismo monorepo, build y release, pero mantiene fronteras claras para poder extraerse después.

## Estructura propuesta

| Ruta orientativa                                                                                   | Responsabilidad                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prototype/                                                                                         | Landing explicativa existente. Añadir enlace/formulario a la aplicación operativa sin recursos externos.                                                                      |
| apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-web/                                  | React/Vite/TypeScript, base /desarrollo-seguro/app/, buscador, informe, historial y estados. Build estático copiado a la imagen web actual.                                   |
| apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-api/                                  | NestJS/TypeScript, API pública, normalización, admisión, scheduler lógico, lectura/proyección de resultados y migraciones propias. Proceso separado, sin imports de apps/api. |
| apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-worker/                               | Scheduler/cola y persistencia de resultados; sin endpoint público ni navegación con secretos de DB.                                                                           |
| apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-probe/                                | Navegador y sondas de páginas en contenedor efímero/con límites, sin credenciales de base; todo tráfico pasa por conector de salida validado.                                 |
| apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-core/ o paquete workspace equivalente | DTOs, controles, cálculo de frescura/veredicto y puertos puros compartidos por API/worker/web solo donde proceda. No importará módulos de Grumphya ni infraestructura.        |

Las rutas de web y probe de esta tabla son destino propuesto, no paquetes existentes. Hoy el workspace incluye cuatro paquetes bajo `apps/prototype-desarrollo-seguro/`: `prototype-desarrollo-seguro-core`, `prototype-desarrollo-seguro-persistence`, `prototype-desarrollo-seguro-api` y `prototype-desarrollo-seguro-worker`.

## Estado de implementación local

La fase técnica 1 y el endurecimiento local de ingesta están completados y verificados en cluster PostgreSQL aislado (50/50); `pnpm quality:check` terminó con código 0 el 2 de noviembre de 2026. El worker valida hostname canónico antes de llamar al puerto executor. Siguen pendientes rúbricas concretas, cobertura control×ruta, DNS con pinning y aislamiento de red; la etapa de executor/red está bloqueada hasta superar esos gates. Los paquetes locales actuales son `apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-core/`, `apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-persistence/`, `apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-api/` y `apps/prototype-desarrollo-seguro/prototype-desarrollo-seguro-worker/`; siguen separados de los módulos de negocio de Grumphya.

| Componente                                | Estado implementado                                                                                                                                                                  | Límite actual                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `prototype-desarrollo-seguro-core`        | Políticas puras de hostname, veredicto, frescura, allowlist y derivación de estado desde evidencia por control.                                                                      | No hace llamadas de red ni inicia trabajos; no implementa sonda, DNS pinning ni firewall/egress.                      |
| `prototype-desarrollo-seguro-persistence` | Provisión idempotente de base/roles, migraciones DS 001–004 y almacén PostgreSQL para dominios, jobs, runs, checks y métricas; leases, recuperación y guardas semánticas de payload. | Verificación aislada 50/50; no se ha aprovisionado ni migrado la base de producción; no exige cobertura control×ruta. |
| `prototype-desarrollo-seguro-api`         | Endpoint `GET /api/desarrollo-seguro/v1/health` que comprueba conectividad al almacenamiento DS.                                                                                     | No hay endpoints de búsqueda, admisión, estado de trabajo ni informes.                                                |
| `prototype-desarrollo-seguro-worker`      | Procesador de jobs con `ScanExecutor` como puerto inyectado, heartbeat/lease y validación de hostname normalizado antes de llamar al executor.                                       | No hay executor de red ni proceso worker arrancable/scheduler; no valida DNS con pinning ni egress.                   |
| Sonda/probe                               | No implementada.                                                                                                                                                                     | No hay probe ni conector de salida; no se hacen escaneos reales ni consultas a dominios.                              |

El bootstrap standalone de la API escucha en `0.0.0.0:3001` (configurable con `DS_API_PORT`). No está conectada a Compose ni publicada en producción; al integrarla, debe quedar solo en una red interna, accesible desde Caddy y sin puerto de host. La decisión de ubicar los paquetes bajo `apps/` sigue la estructura actual del workspace; se mantienen dentro del módulo DS y no como utilidades globales de Grumphya.

El `pnpm-workspace.yaml` incluye los patrones `apps/*` y `apps/prototype-desarrollo-seguro/*`; el segundo descubre esos cuatro paquetes dentro del workspace anidado. La carpeta contenedora organiza la feature DS y el prefijo `prototype-` de los nombres de paquete no significa que sean parte del sitio estático actual ni que exista un escáner operativo. No se añadió una raíz `packages/*`: los paquetes siguen dentro del módulo de Desarrollo Seguro, no como utilidades globales de Grumphya. No crear paquetes compartidos para consumidores hipotéticos fuera de esta feature. La API y el processor de worker comparten contratos inmutables y persistencia propia, no objetos mutables en memoria. El probe y el conector de salida siguen pendientes y deberán formar la frontera de red del [modelo de amenazas](scanner-safety.md); su implementación depende de firewall/egress probado y de capacidad suficiente del VPS, y pueden empaquetarse en imágenes separadas dentro del mismo Compose y release.

## Encaje con rutas y código existentes

- Caddy recibe /api/desarrollo-seguro/* antes del manejador general /api/* y lo envía a la API nueva mediante HTTPS interno verificado. El resto de /api/* sigue en Nest Grumphya.
- Nginx conserva /desarrollo-seguro/ como landing de prototype/. Una regla más específica sirve /desarrollo-seguro/app/* desde el build React nuevo, con fallback solo a su index. El resto de la SPA Grumphya no cambia.
- El footer de Grumphya cambia únicamente el href y el texto/imagen neutral del sello local. No importa el cliente del escáner ni realiza solicitudes a un nuevo origen.
- La antigua ficha /acreditaciones/DS-GRUMPHYA-2026-001 y GET /api/accreditations/:id siguen disponibles como demostración histórica y enlazan al informe operativo; no se usan como fuente de los resultados nuevos.
- Las fechas manuales del registro antiguo no se copian a scan_runs.

## Dependencias permitidas

La web Desarrollo Seguro llama solo a su API bajo el mismo origen. La API nueva depende de su núcleo y su repositorio PostgreSQL. El worker depende del núcleo, cola/almacenamiento propio y conector de red protegido. Grumphya no depende de la API nueva para servir su funcionalidad central. La base Desarrollo Seguro no tiene FK a usuarios, ideas, planes, sesiones o avatares. No usar claves de OpenAI o correo de Grumphya.

Un fallo del worker deja resultados stale y alerta, pero no debe provocar reinicios del proxy, Grumphya API ni PostgreSQL. El paso futuro a otro dominio sustituye rutas/proxy y mueve esta unidad de código y datos, sin reescribir las reglas.
