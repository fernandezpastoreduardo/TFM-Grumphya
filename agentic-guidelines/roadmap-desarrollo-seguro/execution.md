# Orden de ejecución para Luna

## Mandato y condiciones

Implementar la **primera fase operativa dentro del despliegue actual de Grumphya**: mismo dominio grumphya.com, VPS, repositorio y release manual, con componentes DS aislados y escaneo real de bajo impacto. Seguir [README.md](README.md), el perfil [controls-and-evidence.md](controls-and-evidence.md), la seguridad [scanner-safety.md](scanner-safety.md), y el gate operativo [operations.md](operations.md). El slice 0 está completado y el slice 1 está en curso: contratos y políticas puras, almacenamiento DS, health API y processor con puerto `ScanExecutor`. Aún no hay probe ni executor de red; no se realizan escaneos reales y nada está desplegado ni incluido en runtime/Compose de producción. El bootstrap standalone de API escucha en `0.0.0.0:3001`; antes de integrarla en Compose debe limitarse a red interna y quedar accesible solo desde Caddy. La autorización de desarrollo no autoriza escaneos públicos, cambios en la base productiva ni un despliegue; estos requieren superar sus gates y el flujo manual aprobado.

Antes de cada siguiente slice, revisar AGENTS.md y el estado real del repo, Compose, Caddy/Nginx y workflows; registrar discrepancias con el diseño. No asumir que el prototipo o datos académicos son resultados reales. Mantener el cambio concentrado en DS, rutas compartidas necesarias y sello local.

## Entregas en slices verticales

### 0. Contrato, seguridad y prueba de capacidad

- Congelar un perfil v1 versionado: controles obligatorios evaluables desde la muestra, URLs, umbrales, evidencia mínima, veredicto y lenguaje público. Resolver cualquier control que no pueda medirse con fiabilidad como unknown o asesoría; no aprobarlo por defecto.
- Decidir y documentar arquitectura de probe/conector de salida, bloqueo de red incluso si falla la validación de aplicación, DNS pinning, rutas de grumphya.com y presupuesto de escaneo. Revisar viabilidad de IP pública desde el mismo VPS.
- Levantar una línea base de capacidad del VPS y definir límites y umbrales en el PR. Si el hardware impide una sonda segura dentro de los límites, parar la publicación operativa y comunicar la causa.
- Escribir tests de amenaza y veredicto que fallen antes de implementar.

**Salida:** contratos y umbrales aprobables, fixtures de red, plan de observabilidad y evidencia de que el aislamiento es realizable.

### 1. Núcleo y persistencia DS

- Crear los componentes y paquetes DS sin imports de negocio Grumphya. Configurar build del monorepo y pruebas propias.
- Aprovisionar base lógica y roles DS de forma idempotente en entorno de prueba, migraciones propias, tablas de dominios, jobs, runs y controles. Separar roles de lectura/ejecución/migración.
- Implementar máquina de estados, cálculo de TTL exacto desde completed_at, historial inmutable, perfil versionado, lease, recuperación y singleflight.
- Tests TDD para frescura, concurrencia, reintentos, aislamiento de roles e invariantes de veredicto.

**Estado:** hay paquetes API y worker, esquema y almacén PostgreSQL, y pruebas locales. La API solo expone health; el processor recibe un `ScanExecutor` inyectado, pero no existe una implementación de red ni un proceso worker arrancable. No se ha provisionado ni migrado PostgreSQL de producción.

**Salida pendiente:** API/worker compilan y persisten casos/resultados sintéticos en una base aislada de prueba, sin red pública. El puerto de executor no convierte los jobs en escaneos reales.

### 2. Sonda externa de bajo impacto

- Implementar admisión de hostname, DNS/TLS/HTTP, comprobación de cabeceras y navegador limpio por fases, con presupuesto global y firewall/proxy de salida. Se registran y bloquean intentos de terceros. Aplicar robots a rutas muestreadas.
- Probar cada control contra fixtures pass/fail/unknown y pruebas adversarias de SSRF reales. Registrar rutas, hora, método, versión y evidencia redactada.
- Ejecutar un escaneo controlado de grumphya.com desde el VPS solo tras validar límites; comprobar la perspectiva pública real. Repetir hasta obtener resultados estables, sin forzar un aprobado.

**Salida:** informe íntegro y trazable, con exactitud de fuente same_vps y cobertura.

### 3. API pública, portal y sello

- Implementar contratos de [DTOs.md](DTOs.md), búsqueda de dominio público acotada, cuotas, 200 de caché y 202 de trabajo único, polling y errores.
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
