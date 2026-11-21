# Migración de PostgreSQL 17 a 19

## Corte completado — 2026-11-21

La migración de producción de Grumphya se completó mediante el workflow aprobado, con el release `7699c8bf72826662ae3b538b69645cf094607e6e`. La API confirmó `database: ok` y pgvector `0.8.7`; PostgreSQL informó `19.0` y la API ejecuta Node `26.13.1`. Desarrollo Seguro permaneció disponible durante el corte y se verificó también en PostgreSQL `19.0` y Node `26.13.1`.

Antes del corte se restauraron y compararon los dumps cifrados de ambas aplicaciones y se verificó el archivo cifrado de avatares. Los volúmenes de PostgreSQL 17 y PG19 de Grumphya siguen presentes. El volumen PG17 se conserva detenido para recuperación; no debe eliminarse ni reactivarse después de que PG19 haya aceptado escrituras sin seguir el procedimiento de recuperación de datos de abajo. Los backups externos están en `Backups/Grumphya-PG19-20261121`.

El primer intento de despliegue se detuvo antes de cambiar la aplicación porque el helper activo del VPS era v4. Se actualizó atómicamente a v5, conservando una copia previa, y el workflow se repitió con éxito. El smoke público de certificación y los checks de salud posteriores al corte pasaron. El workflow también completó sus pruebas de calidad, E2E, auditoría y Lighthouse.

## Decisión de versiones

- La base de datos de la aplicación tiene como destino PostgreSQL 19.0 con pgvector 0.8.7 sobre Debian 13 (`pgvector/pgvector:0.8.7-pg19-trixie`).
- La línea Node.js de producción sigue en 26 LTS. Node.js 27 está en Alpha y no es adecuada para producción. La versión menor de Node se mantiene en la última publicación de seguridad de 26.x.
- pgvector 0.8.7 es la versión actual de la extensión; no hay una major 1.x que adoptar.
- El PostgreSQL de SonarQube sigue separado. La versión de SonarQube instalada admite PostgreSQL 14–18, no 19; no se le debe cambiar la major sin soporte del proveedor.

CI ejecuta las pruebas de integración de la aplicación contra PostgreSQL 19 y compila la imagen de base de datos 19. Además, `scripts/test-postgres-major-upgrade.sh` migra una base sintética desde PostgreSQL 17 a la imagen PG19 sobre Debian 13 usando el mismo helper `grumphya-postgres-backup.sh` de producción. Comprueba la versión de origen y destino, el rol de runtime, la extensión vectorial, una tabla, filas e índice HNSW; elimina ambos volúmenes de prueba al terminar y nunca usa datos o secretos reales.

## No reutilizar el volumen de PostgreSQL 17

Un cambio de `DATABASE_IMAGE` a PG19 sobre `grumphya-production-postgres` no es una actualización segura: los ficheros de datos de PostgreSQL 17 no son un clúster PostgreSQL 19. La actualización de major necesita una copia lógica y un volumen nuevo. Un rollback de imágenes no revierte una migración de clúster.

La composición del release activo usa el volumen versionado `grumphya-production-postgres-pg19`. El volumen `grumphya-production-postgres` contiene el clúster PG17 original y debe permanecer intacto durante el periodo de observación. Las pruebas de CI por sí solas no sustituyen la validación de producción descrita arriba.

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

## Controles realizados para activar producción

- El helper v5 valida el volumen versionado PG19 y su marcador de restauración verificada; las pruebas del helper cubren validación y rollback.
- Se restauraron los backups cifrados en volúmenes aislados PG19 y se compararon recuentos, índices, secuencias, migraciones, roles, membresías y propietarios antes del corte.
- Se detuvieron escritores durante el dump final y se conservó el volumen PG17 original.
- El workflow aprobado desplegó el Compose PG19 y comprobó los endpoints públicos; después se consultaron las versiones SQL y Node, pgvector y la salud de ambos sitios.

Mantén el volumen PG17 y las copias externas durante el periodo de observación y hasta disponer de una copia verificada nueva de PG19. El rollback de la aplicación no revierte escrituras nuevas de PG19. Si hace falta recuperar datos, detén escrituras y aplica un plan explícito que conserve los cambios; no vuelvas silenciosamente al volumen PG17 ni uses `docker compose down -v`.
