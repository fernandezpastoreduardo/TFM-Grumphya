# Persistencia de la fase inicial

## Decisión

Usar PostgreSQL ya existente en TFM-Grumphya, con tablas prefijadas ds_ y repositorio aislado en el módulo de Desarrollo Seguro. Esta decisión es temporal para el prototipo: no crea base, volumen, usuario ni hosting independientes. El modelo evita claves foráneas a usuarios, ideas, sesiones y planes de Grumphya para que los datos puedan exportarse en una fase futura.

Las tablas de esta fase guardan **casos y evidencias internas**, no ejecuciones de escaneo. No crear aún scan_runs, scan_jobs ni una cola vacía. El plan estratégico describe esas entidades para otro incremento.

## Esquema lógico

### ds_cases

| Columna                              | Tipo sugerido        | Regla                                                                                                                            |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| id                                   | texto, PK            | ID público DS-GRUMPHYA-2026-001; patrón actual.                                                                                  |
| issuer, application                  | texto no nulo        | «Desarrollo Seguro», «Grumphya» en el caso inicial.                                                                              |
| status                               | texto no nulo        | CHECK demonstration, suspended, revoked, expired; unknown se proyecta ante estado no reconocido, no se persiste deliberadamente. |
| issued_at, validated_at, expires_at  | timestamptz nullable | Conservar fechas históricas exactas del registro actual; no DEFAULT now.                                                         |
| validation_method, scope, disclaimer | texto no nulo        | Copy público acotado.                                                                                                            |
| created_at, updated_at               | timestamptz no nulo  | Auditoría de la fila; no confundir con fecha de observación.                                                                     |

### ds_case_domains

| Columna          | Tipo sugerido | Regla                                           |
| ---------------- | ------------- | ----------------------------------------------- |
| case_id          | FK a ds_cases | Borrado restringido.                            |
| canonical_domain | texto         | Minúsculas/IDNA; unique global en fase inicial. |
| ordinal          | entero        | Orden de presentación.                          |

La presencia de un dominio en esta tabla solo significa «incluido en esta ficha». No afirmar que DNS TXT o /.well-known hayan probado titularidad. Un caso puede tener varios dominios declarados, pero la búsqueda de cada uno conduce al mismo ID.

### ds_criteria

case_id, ordinal y texto de criterio; clave única (case_id, ordinal). Conserva la lista actual en orden. Evita guardar una cadena JSON opaca que dificulte evolución y revisión.

### ds_assurances

| Columna                                           | Tipo sugerido        | Regla                                                               |
| ------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| case_id, assurance_id                             | FK + ID local        | PK compuesta; conservar privacy, first-party, transport y delivery. |
| ordinal, title, description, evidence, limitation | enteros/texto        | Copy actual sin ampliar afirmaciones automáticamente.               |
| method                                            | texto                | internal_test, internal_review o descriptive.                       |
| evidence_state                                    | texto                | verified_internal, documented_unverified u outdated.                |
| observed_at                                       | timestamptz nullable | Solo fecha de comprobación real de esa afirmación.                  |
| source_ref, version_ref                           | texto nullable       | Referencia interna segura; SHA cuando exista.                       |

No introducir PII, cookies, IP, cuerpos de páginas, cabeceras completas, tokens o contenido de formularios. Los títulos y resúmenes de evidencia deben poder mostrarse públicamente.

## Migración de la única ficha

1. Luna comprueba el número de migración más alto de main; cuando se redactó este documento era 036. Crea la siguiente migración libre y la registra en apps/api/src/infrastructure/database/run-migrations.ts, siguiendo el patrón del proyecto.
2. La migración crea las tablas y siembra el registro DS-GRUMPHYA-2026-001 con sus fechas, textos y dominios actuales. No recalcula fechas ni transforma demonstration en un estado de aprobación.
3. Los nuevos campos de trazabilidad se siembran de forma conservadora: observed_at y version_ref null cuando no haya prueba exacta; evidence_state documented_unverified cuando el alcance de la afirmación exceda la prueba identificada. Una revisión posterior, con prueba real y SHA conocido, puede añadir una migración de datos o un procedimiento administrativo auditado.
4. GetAccreditation lee el repositorio y construye explícitamente el DTO público. No se conserva la constante hardcoded como fallback silencioso: si PostgreSQL falla, responder error temporal y ocultar el sello.
5. La migración se prueba sobre base vacía y base con datos existentes. Una segunda ejecución no duplica casos, dominios ni evidencias. El registro existente devuelve los mismos campos y valores históricos antes de añadir los nuevos campos.
6. El despliegue respeta el flujo actual de backup, migración y smoke. No borrar tablas ni volúmenes de Grumphya.

## Consulta y actualización

Índice único de ds_case_domains.canonical_domain para búsqueda. Índices por case_id en tablas hijas; ordenar siempre por ordinal. Consultas públicas solo SELECT. No endpoint público de creación, edición o borrado. Para corregir evidencia, usar una migración de datos revisada o un procedimiento administrativo explícito que deje rastro de quién cambió qué; no actualizar por cada GET.

La fase futura podrá exportar estas cuatro tablas a otra base, junto con un mapa de IDs y versiones. Las futuras ejecuciones automáticas irán en tablas nuevas con historial inmutable y expiración, sin convertir updated_at del caso en «última verificación».
