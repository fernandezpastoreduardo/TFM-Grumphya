# DTOs y contratos públicos de la fase inicial

## Principios

La entrada de la red es unknown y se valida en servidor. El frontend valida también cada respuesta de la API antes de mostrar un sello o una ficha. Los DTOs públicos son proyecciones explícitas: nunca se devuelve una fila de PostgreSQL completa ni notas privadas. Todas las fechas son instantes ISO 8601 UTC o null; null significa «no verificado/no definido», nunca «ahora». No existe DTO de inicio de escaneo en esta fase.

## Consulta por dominio

**Ruta propuesta:** GET /api/development-security/domains/:hostname. Sin autenticación ni cookies necesarias; Cache-Control: no-store para no perpetuar el estado de la ficha. El controlador solo llama a normalizador y repositorio. No resuelve DNS ni abre sockets a hostname.

**Entrada:** hostname de máximo 253 caracteres tras normalizar; minúsculas y ASCII/IDNA; etiquetas de 1–63 caracteres separadas por puntos; al menos dos etiquetas; sin guion al principio o final de etiqueta. Permitir punto final único al normalizar. Rechazar protocolo, slash, interrogación, almohadilla, dos puntos, arroba, espacios, IP literal, localhost y sufijos reservados para pruebas o red privada. Limitar longitud antes y después de IDNA. No usar un parámetro de URL libre como destino de red. La validación actual solo prepara una búsqueda; no acredita que el dominio exista o sea público.

**Respuesta 200, unión discriminada:**

| Campo | Caso encontrado | Caso ausente |
| --- | --- | --- |
| kind | known_case | unassessed |
| canonicalDomain | hostname normalizado | hostname normalizado |
| caseId | identificador público del registro | ausente |
| caseUrl | ruta interna /acreditaciones/:id | ausente |
| status | demonstration, suspended, revoked, expired o unknown | ausente |
| message | «Existe una ficha académica para este dominio» | «Aún no hay evaluación para este dominio. La búsqueda no inicia un escaneo.» |

El servidor construye caseUrl desde el ID persistido, no desde la entrada sin escapar. Los dos miembros de la unión se validan en runtime en la web. No retornar un objeto de caso vacío para un dominio ausente.

**Errores:** 400 con código invalid_domain para entrada inválida; 429 con código rate_limited si aplica límite de consultas; 503 con código lookup_unavailable si falla persistencia. Cuerpo mínimo: code y message en español, sin pila ni SQL. No usar 404 para «sin evaluación»: es un resultado normal de búsqueda. Las respuestas de error usan Cache-Control: no-store.

## Ficha existente por ID

**Ruta conservada:** GET /api/accreditations/:id. Mantener el patrón DS-… actual, 404 para ID válido no encontrado, y Cache-Control: no-store. Mantener los campos usados por apps/web/src/shared/accreditation-verification.ts y AccreditationVerification: id, issuer, application, authorizedDomains, status, issuedAt, validatedAt, validationMethod, expiresAt, scope, criteria, assurances y disclaimer.

El estado público permanece en la unión demonstration | suspended | revoked | expired | unknown. No introducir valid, compliant ni certified en esta fase. issuedAt y validatedAt son los valores históricos de la ficha actual, no el momento de consulta. expiresAt sigue null salvo una decisión documentada con fecha real. Suspended/revoked/expired/unknown nunca habilitan el sello ilustrado.

**Extensión aditiva por assurance para trazabilidad:**

| Campo nuevo | Tipo | Semántica |
| --- | --- | --- |
| method | internal_test, internal_review o descriptive | Método real que respalda la evidencia. |
| evidenceState | verified_internal, documented_unverified u outdated | Estado de soporte de la afirmación, independiente de status de la ficha. |
| observedAt | instante UTC o null | Fecha de ejecución/revisión real; null si no hay observación comprobable. |
| sourceRef | texto o null | Ruta de prueba, archivo o documento del repositorio; sin URL privada con token. |
| versionRef | SHA de commit o null | Versión exacta revisada cuando se conozca. |

Los campos anteriores de assurance (id, title, description, evidence, limitation) se mantienen. Si un assurance combina varias fuentes, no asignar un único método o fecha que sugiera una verificación más amplia de la realizada; dividirlo o marcar documented_unverified. El frontend debe aceptar y mostrar null sin sustituirlo por la hora actual. La respuesta JSON concreta se versionará mediante pruebas de contrato de servidor y cliente.

## Semántica de datos y compatibilidad

- authorizedDomains es una declaración del caso de demostración; no equivale a prueba automatizada de titularidad.
- scope y disclaimer deben mencionar revisión interna y carácter académico.
- Ningún campo de la fase inicial contiene resultado horario, completedAt de escaneo, perfil de controles externos o porcentaje de conformidad.
- La antigua forma de la ficha debe continuar siendo legible mientras se migran servidor y frontend juntos; no romper el footer durante el despliegue.
- Si se añade una versión de contrato, documentar migración de consumidores y comprobar los casos: registro encontrado, desconocido, suspendido, fallo de API y respuesta malformada.
