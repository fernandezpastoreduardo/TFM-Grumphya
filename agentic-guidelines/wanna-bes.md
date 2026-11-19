# Pendientes por valorar

Este archivo conserva mejoras futuras y verificaciones operativas sin cerrar. Que una tarea aparezca aquí no significa que esté aprobada ni planificada.

## Prioridad alta: medir y reducir la latencia de las evaluaciones

**Estado:** mitigación aplicada; falta medir con tráfico real.

Las respuestas han ganado interés y detalle, pero tardan demasiado. Se redujo el esfuerzo de razonamiento predeterminado y se añadió un reintento ante campos de decisión inconsistentes. Medir en producción el tiempo de respuesta, la tasa de error y la calidad percibida; después, acelerar el recorrido de envío sin perder funcionalidad, seguridad ni calidad de respuesta.

## Completar la revisión responsive

**Estado:** parcial.

El panel de control, sus tablas y los callouts ilustrados de Buenas prácticas y Humanos notables tienen ajustes específicos para móvil. Revisar el resto de páginas en tamaños móviles y de tablet, con ambos temas, y confirmar que controles y contenido se usan sin desplazamiento lateral de página.

## Compartir los rate limits entre procesos

**Estado:** pendiente para despliegues con varias réplicas.

Los límites por minuto de API y la subida de avatar conservan contadores en memoria por proceso; al reiniciar se pierden y, con varias réplicas, el límite efectivo puede multiplicarse. Antes de escalar, valorar un almacén compartido o gateway y definir cómo comprobar límites simultáneos y reinicios. El límite secundario de creación de perfiles anónimos (20 por IP en 24 horas) sí se persiste en PostgreSQL.

## Autenticación de dos factores

**Estado:** pendiente de diseño y priorización.

Valorar un segundo factor para el inicio de sesión, con recuperación segura y alternativas accesibles, antes de incorporarlo a la autenticación de cuentas.

## Verificaciones pendientes de producción

### Warning de Lighthouse en CI

**Estado:** pendiente de diagnóstico.

La ejecución de Lighthouse en CI muestra tres avisos que conviene resolver o
clasificar antes de considerar el job completamente limpio:

- No está configurado el token de GitHub (`GitHub token not set`).
- Vite avisa de incompatibilidades previstas con `configLoader: 'native'`:
  falta el atributo de importación JSON y hay imports sin extensión en
  `vite.config.ts` y en los módulos de fixtures y middleware de Lighthouse.
- El healthcheck termina pasando, pero el proceso informa de un timeout al
  esperar el servidor en `127.0.0.1:4173`, aunque `vite preview` anuncia esa
  dirección.

Revisar si el token es necesario para el flujo actual, actualizar los imports
al formato que soporte el cargador nativo cuando proceda y hacer que el
patrón de readiness del job coincida con la salida real del servidor. No
silenciar el aviso con `VITE_CONFIG_NATIVE_IGNORE_WARNING` sin documentar
antes por qué se acepta.

### Confirmar qué versión está publicada

La [incidencia del VPS](../doc/incident-vps-access-and-deployment-2026-10.md) registra una publicación del 28 de octubre de 2026 para `a9fb172`; es una referencia histórica, no una confirmación de la versión actual. La publicación se inicia manualmente desde GitHub Actions, con confirmación y autorización. Confirmar el SHA que está sirviendo producción y decidir si se publica una versión posterior. Tras cualquier publicación, comprobar HTTPS, persistencia y los recorridos principales. La corrección del enlace de recuperación (`8c68af4`) ya estaba incluida en `a9fb172`; probarla en producción con una nueva solicitud de restablecimiento, sin compartir el enlace ni el token.

### Confirmar purgas, copias y recuperación

`DataRetentionService` implementa las purgas periódicas de perfiles anónimos, cachés idempotentes, mensajes de contacto, métricas, eventos de error e intenciones o cuentas pendientes. Falta confirmar en producción que las ejecuciones se completan, que se respetan los plazos y que la rotación de copias de IONOS cumple la retención acordada. La descarga del backup del VPS a Synology Drive sigue siendo manual. Verificar la sincronización final y mantener una segunda copia de la llave privada de restauración fuera de Git y del NAS; realizar y registrar una restauración de prueba cuando corresponda.

### Terminar la revisión de la CSP

La CSP completa sigue en modo `Report-Only`. Seguir el procedimiento de [producción](../doc/production.md): acumular al menos siete días representativos, clasificar los informes y registrar la decisión de cada destino antes de aplicar nuevas directivas de bloqueo.
