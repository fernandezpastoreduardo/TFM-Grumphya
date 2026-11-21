# Preparación de la migración de PostgreSQL 17 a 19

## Decisión de versiones

- La base de datos de la aplicación tiene como destino PostgreSQL 19.0 con pgvector 0.8.7 sobre Debian 13 (`pgvector/pgvector:0.8.7-pg19-trixie`).
- La línea Node.js de producción sigue en 26 LTS. Node.js 27 está en Alpha y no es adecuada para producción. La versión menor de Node se mantiene en la última publicación de seguridad de 26.x.
- pgvector 0.8.7 es la versión actual de la extensión; no hay una major 1.x que adoptar.
- El PostgreSQL de SonarQube sigue separado. La versión de SonarQube instalada admite PostgreSQL 14–18, no 19; no se le debe cambiar la major sin soporte del proveedor.

CI ejecuta las pruebas de integración de la aplicación contra PostgreSQL 19 y compila la imagen de base de datos 19. Además, `scripts/test-postgres-major-upgrade.sh` migra una base sintética desde PostgreSQL 17 a la imagen PG19 sobre Debian 13 usando el mismo helper `grumphya-postgres-backup.sh` de producción. Comprueba la versión de origen y destino, el rol de runtime, la extensión vectorial, una tabla, filas e índice HNSW; elimina ambos volúmenes de prueba al terminar y nunca usa datos o secretos reales.

## No reutilizar el volumen de PostgreSQL 17

Un cambio de `DATABASE_IMAGE` a PG19 sobre `grumphya-production-postgres` no es una actualización segura: los ficheros de datos de PostgreSQL 17 no son un clúster PostgreSQL 19. La actualización de major necesita una copia lógica y un volumen nuevo. Un rollback de imágenes no revierte una migración de clúster.

La composición de producción conserva por ahora PostgreSQL 17 como valor predeterminado y el volumen estable actual. Las pruebas de CI para PG19 no cambian el clúster del VPS. No lances un despliegue PG19 hasta que la ruta de producción use un volumen versionado nuevo y el helper de despliegue pueda migrar y verificar datos sin tocar el volumen 17.

## Secuencia segura para el corte de producción

1. Comprueba en el VPS la major real, la versión de pgvector, el tamaño de la base y el espacio libre. Mide cuánto tarda una restauración completa; no estimes el espacio a partir del tamaño comprimido del dump.
2. Genera una copia cifrada fuera del VPS de PostgreSQL y del volumen de avatares. Restaura ambas en un entorno temporal y valida que la restauración termina y que la aplicación puede leer la copia. No continúes con una copia que solo se haya creado pero nunca restaurado.
3. Prepara en el VPS un clúster PG19 vacío en un volumen con nombre propio, por ejemplo `grumphya-production-postgres-pg19`. Provisiona los mismos roles desde los secretos de producción; nunca copies contraseñas en argumentos, logs o ficheros de release.
4. Abre una ventana de mantenimiento. Detén escrituras de la API y el acceso público antes de crear el dump final. Conserva intacto el clúster PG17 y su volumen.
5. Usa el helper de backup para transmitir el dump de la base de la aplicación al helper de restauración de PG19. El helper recrea la base destino con el rol runtime configurado. No copies directamente el volumen ni uses `pg_upgrade --link`.
6. Verifica en PG19 la versión del servidor y de `vector`, las migraciones registradas, conteos por tabla, secuencias, índices, roles y permisos. Ejecuta los smokes de evaluación, roast, autenticación, ranking y avatares desde el candidato. Los conteos deben compararse sin volcar datos personales a logs.
7. Solo cuando todo pase, cambia la release para montar el volumen PG19 y reabre tráfico. Mantén el volumen 17 apagado e intacto durante la observación.
8. Antes de reabrir tráfico, un fallo de validación puede volver a la release 17 porque no se han aceptado escrituras nuevas. Después de reabrir, el volumen 17 queda desfasado: no se debe volver a él silenciosamente, pues perdería escrituras nuevas. Un rollback de datos posterior exige detener escrituras, decidir explícitamente cómo conservar los cambios y seguir un plan de recuperación revisado.
9. Conserva la copia externa y el volumen 17 hasta completar el periodo de observación y una nueva copia verificada de PG19. Retíralos después mediante el procedimiento de retención aprobado, nunca con `docker compose down -v`.

## Condiciones antes de activar el flujo de producción

- Añadir al helper del VPS una operación de migración explícita, con preflight de espacio, bloqueo de escrituras, volumen destino versionado, verificación de la copia y limpieza que nunca elimine el volumen origen.
- Probar el helper con volúmenes efímeros PG17 y PG19, incluyendo fallo durante dump, restore, validación, corte y rollback previo a aceptar escrituras.
- Confirmar el espacio disponible y tiempo de mantenimiento usando una copia reciente restaurada del VPS. CI solo usa datos sintéticos; no sustituye ese ensayo.
- Actualizar el Compose de producción a PG19 y cambiar el volumen solo dentro del mismo cambio revisado que habilita esa operación. Mantener el PG17 anterior disponible para recuperación.
- Desplegar mediante el workflow aprobado y comprobar la versión SQL de la base activa después del corte.

Hasta que estas condiciones estén cubiertas, la base de producción debe seguir en la línea parcheada PG17.12. Es una línea soportada con correcciones de seguridad; la migración a PG19 requiere su propio corte de datos y una ruta de reversión explícita.
