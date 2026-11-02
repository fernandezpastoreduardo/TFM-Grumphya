# Secuencia de implementación para Luna

## Antes del primer cambio

1. Leer AGENTS.md, el plan estratégico y los documentos de esta carpeta. Revisar el código real en main: prototype/, apps/web/src/features/accreditation-verification/, apps/web/src/shared/accreditation-verification.ts, apps/api/src/verify-accreditation/, migraciones y rutas de la SPA. Confirmar que la base técnica coincide con [README.md](README.md).
2. Anotar en la descripción de trabajo el alcance: **prototipo académico interno, sin escaneo remoto activo ni dominio/hosting de Desarrollo Seguro**. Si una ruta propuesta colisiona con código nuevo, elegir equivalente mínimo y dejar la decisión documentada.
3. Establecer pruebas existentes en verde antes de tocar código. La tarea futura de Luna sí implementará código; este archivo solo define la secuencia.

## Slice A — Contrato y búsqueda honesta

- Escribir primero pruebas de normalización y GET /api/development-security/domains/:hostname para conocido, ausente e inválido.
- Implementar caso de uso de consulta con repositorio en memoria. No añadir cliente HTTP, DNS ni dependencia de crawler.
- Añadir ruta React /acreditaciones/buscar y el formulario del prototipo. Mantener la landing HTML/CSS sin scripts; permitir únicamente form-action self si es necesario.
- Probar recorridos teclado/móvil y que un dominio ausente nunca ofrece ficha/sello.
- Cerrar el slice con un estado ejecutable y pruebas relevantes verdes.

## Slice B — Fuente persistida y compatibilidad

- Escribir pruebas de migración/seed y contrato del endpoint existente antes de cambiar la fuente de datos.
- Crear tablas ds_ según [persistence.md](persistence.md), con el siguiente número de migración libre y registro explícito. Conservar fechas/textos del caso inicial. Introducir repositorio PostgreSQL.
- Sustituir la constante del servicio por lectura persistida. Actualizar la ficha y el sello solo si el DTO lo requiere; no romper sus condiciones de seguridad.
- Probar base vacía/poblada, fallo de DB, 404, no-store y persistencia entre reinicios. No usar fallback silencioso a la constante.
- Registrar cómo se podrá exportar el caso cuando haya repo y DB independientes, sin crear ahora esa infraestructura.

## Slice C — Evidencia y copy

- Auditar cada assurance heredado frente a [controls-and-evidence.md](controls-and-evidence.md). Añadir método, estado, fuente, versión y fecha real o null; bajar a documented_unverified lo que no pueda acreditarse.
- Ampliar E2E para las rutas que el copy dice haber revisado. Si las pruebas revelan terceros o cookies no esperadas, corregir la afirmación pública con precisión; no ocultar hallazgos.
- Mostrar límites y fechas de evidencia en la ficha. Mantener la etiqueta demonstration en prototipo, ficha y sello.
- Actualizar doc/desarrollo-seguro.md **cuando Luna implemente** para reflejar el nuevo estado real. Esta tarea actual solo edita Markdown de esta carpeta.
- Ejecutar la matriz de [test-plan.md](test-plan.md) y revisar accesibilidad y privacidad en navegador.

## Revisión final de Luna

- Comparar el comportamiento con cada aceptación de [features.md](features.md) y anotar evidencia de cumplimiento.
- Ejecutar gates de calidad y E2E; inspeccionar el diff para asegurar que no se añadieron conexiones a dominios buscados, nuevos terceros, credenciales o afirmaciones de escaneo horario.
- Informar archivos cambiados, pruebas y límites restantes. Si un control no se pudo validar, dejarlo explícitamente no verificado en datos y UI.
- Mantener fases de escaneo externo, cola, caducidad horaria, titularidad y despliegue independiente como backlog. No activar ni dejar endpoints que aparenten ejecutar esas funciones.

## Decisiones que requieren una nueva fase

El paso a «verificación externa periódica» exige decidir ubicación real del worker fuera o dentro del VPS, prueba de capacidad, alcance legal/operativo del escaneo, control SSRF, políticas de frecuencia y método de titularidad. La separación a desarrolloseguro.com exige dominio, repo, base/volúmenes, proxy y despliegue propios. El plan estratégico describe esas decisiones, pero esta secuencia termina antes de ellas.
