# Componentes, carpetas y dependencias

## Regla de diseño

Aplicar AGENTS.md: las piezas usadas por una feature quedan locales; solo lo usado realmente por dos o más features pasa a shared. Los nombres describen funciones de negocio. Desarrollo Seguro usa el mismo monorepo, build y release, pero mantiene fronteras claras para poder extraerse después.

## Estructura propuesta

| Ruta orientativa                                                | Responsabilidad                                                                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prototype/                                                      | Landing explicativa existente. Añadir enlace/formulario a la aplicación operativa sin recursos externos.                                                                      |
| apps/development-security-web/                                  | React/Vite/TypeScript, base /desarrollo-seguro/app/, buscador, informe, historial y estados. Build estático copiado a la imagen web actual.                                   |
| apps/development-security-api/                                  | NestJS/TypeScript, API pública, normalización, admisión, scheduler lógico, lectura/proyección de resultados y migraciones propias. Proceso separado, sin imports de apps/api. |
| apps/development-security-worker/                               | Scheduler/cola y persistencia de resultados; sin endpoint público ni navegación con secretos de DB.                                                                           |
| apps/development-security-probe/                                | Navegador y sondas de páginas en contenedor efímero/con límites, sin credenciales de base; todo tráfico pasa por conector de salida validado.                                 |
| apps/development-security-core/ o paquete workspace equivalente | DTOs, controles, cálculo de frescura/veredicto y puertos puros compartidos por API/worker/web solo donde proceda. No importará módulos de Grumphya ni infraestructura.        |

El workspace actual contiene apps/_; Luna decide si el núcleo se ubica en apps/development-security-core o amplía pnpm-workspace.yaml para packages/_, dejando el razonamiento en una decisión de arquitectura. No crear un paquete compartido para una sola importación hipotética. Los procesos API y worker comparten contratos y la base propia, no objetos mutables en memoria. El probe y el conector de salida son la frontera de red del [modelo de amenazas](scanner-safety.md); pueden empaquetarse en imágenes separadas dentro del mismo Compose y release.

## Encaje con rutas y código existentes

- Caddy recibe /api/desarrollo-seguro/* antes del manejador general /api/* y lo envía a la API nueva mediante HTTPS interno verificado. El resto de /api/* sigue en Nest Grumphya.
- Nginx conserva /desarrollo-seguro/ como landing de prototype/. Una regla más específica sirve /desarrollo-seguro/app/* desde el build React nuevo, con fallback solo a su index. El resto de la SPA Grumphya no cambia.
- El footer de Grumphya cambia únicamente el href y el texto/imagen neutral del sello local. No importa el cliente del escáner ni realiza solicitudes a un nuevo origen.
- La antigua ficha /acreditaciones/DS-GRUMPHYA-2026-001 y GET /api/accreditations/:id siguen disponibles como demostración histórica y enlazan al informe operativo; no se usan como fuente de los resultados nuevos.
- Las fechas manuales del registro antiguo no se copian a scan_runs.

## Dependencias permitidas

La web Desarrollo Seguro llama solo a su API bajo el mismo origen. La API nueva depende de su núcleo y su repositorio PostgreSQL. El worker depende del núcleo, cola/almacenamiento propio y conector de red protegido. Grumphya no depende de la API nueva para servir su funcionalidad central. La base Desarrollo Seguro no tiene FK a usuarios, ideas, planes, sesiones o avatares. No usar claves de OpenAI o correo de Grumphya.

Un fallo del worker deja resultados stale y alerta, pero no debe provocar reinicios del proxy, Grumphya API ni PostgreSQL. El paso futuro a otro dominio sustituye rutas/proxy y mueve esta unidad de código y datos, sin reescribir las reglas.
