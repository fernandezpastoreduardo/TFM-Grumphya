# Integración de auditoría privada D

Esta integración es optativa y permanece cerrada mientras
`AUDIT_ENABLED=false`. No modifica los flujos de usuarios, los datos
funcionales, la red Docker ni las tablas de ideas. Con la opción apagada, las
rutas de auditoría rechazan la consulta en JSON y el resto de Grumphya sigue
operativo. Si se activa sin claves o ACL válidas, la API no arranca; si falta
evidencia válida tras el arranque, la consulta autenticada devuelve
`503 evidence_unavailable`.

Estado observado en el VPS el 20 de noviembre de 2026: `AUDIT_ENABLED=true`,
`AUDIT_ALLOWED_NETWORKS=31.70.130.181/32` y API recreada y saludable. Los logs
de rechazos de la integración muestran `31.70.130.181` como origen visto por
Grumphya; esta ACL elimina el `403 insufficient_scope` para ese origen. No se
ha validado todavía ninguna respuesta firmada ni el contenido de las siete
evidencias; verifica ambos con el smoke indicado abajo.

El perfil implementado es `beta-d-0.2`. La primera identidad de Desarrollo
Seguro usa el JWT `kid=ds-auditor-2026`. La PEM pública recibida se verificó
localmente como Ed25519 y su huella DER SPKI SHA-256 es
`b4aea1fe81f85f13370708dbb38fc22e0815b4aaf59dc5c869d74394b2d27caa`.
La huella sirve para comparar el material instalado por un canal seguro; no
sustituye esa verificación.

El handoff operativo del 19 de noviembre de 2026 dejó instalada esta clave
como `AUDIT_TECHNICAL_AUTH_PUBLIC_KEY` y `AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS`
quedó limitado a `ds-auditor-2026`. La atestación usa el `kid`
`grumphya-release-2026`; su pública instalada en el VPS tiene la huella DER
SPKI SHA-256
`71db3a2957a92fa118f70374d175205695f6638b33e4c7b7d81314801eae7c77`.
La privada se guardó únicamente en el secreto de GitHub Actions
`AUDIT_RELEASE_SIGNING_KEY`.

## Rutas de lectura

Caddy permite únicamente estos siete recursos externos:

```text
/audit/infrastructure
/audit/deployment
/audit/dependencies
/audit/auth
/audit/quality
/audit/privacy
/audit/ai
```

Solo aceptan `GET`, sin query strings, redirecciones, cookies ni credenciales
en la URL. Caddy reescribe internamente a `/api/audit/<recurso>`; el prefijo
interno queda bloqueado antes del proxy general de la API y nunca cae en la
SPA. Un método distinto de `GET`, un recurso desconocido o una query recibe
`405`, `404` o `400` en JSON.

No existen `POST`, `PUT` ni `PATCH` desde Desarrollo Seguro hacia
Grumphya en esta beta. Las rutas son solo lectura y no son un canal de ingesta.

La respuesta válida tiene exactamente esta envolvente:

```json
{
  "schemaVersion": "beta-d-0.2",
  "observedAt": "2026-11-19T20:00:00.000Z",
  "validUntil": "2026-11-20T20:00:00.000Z",
  "environment": "production",
  "deploymentDigest": "sha256:<64 hex>",
  "cardinality": 1,
  "evidence": {
    "observedAt": "2026-11-19T20:00:00.000Z",
    "sampleRef": "sha256:<64 hex>",
    "signals": []
  },
  "attestation": {
    "alg": "EdDSA",
    "kid": "grumphya-release-2026",
    "signature": "<base64url>"
  }
}
```

El recurso se autoriza con el scope del JWT, pero ese scope no se repite en la
envolvente. `evidence` tiene exactamente `observedAt`, `sampleRef` y `signals`;
`sampleRef` es el SHA-256 de la serialización canónica de `signals`. Cada señal
usa únicamente el criterio, estado, código, unidad y límite de la matriz Beta D.
Un control no observable se representa como `status=unknown` y `value=null`.
El `kid` de `attestation` es independiente y pertenece a la release. Se
devuelve como máximo una evidencia por ruta y la respuesta completa ocupa
menos de 64 KiB. No se sirven fixtures, semillas ni datos simulados en
producción.

## Identidad, autorización y red

Se verifica exclusivamente JWT Ed25519 (`alg=EdDSA`) con estos valores
exactos:

- `iss=desarrolloseguro-audit`
- `sub=desarrolloseguro-audit`
- `aud=grumphya-audit`
- `environment=production`
- `domain=grumphya.com`
- `hostname=grumphya.com`
- `scope`: uno o más valores `audit:<recurso>` allowlisted, incluido el de
  la ruta solicitada
- `iat`, `exp`, `jti` y `kid` obligatorios
- TTL máximo de cinco minutos y tolerancia de reloj de 60 segundos como máximo

La clave pública se carga desde
`AUDIT_TECHNICAL_AUTH_PUBLIC_KEY` o
`AUDIT_TECHNICAL_AUTH_PUBLIC_KEY_FILE`. La privada de Desarrollo Seguro nunca
entra en Grumphya. `AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS` es la lista explícita
de identidades vigentes; `AUDIT_TECHNICAL_AUTH_REVOKED_KIDS` y
`AUDIT_TECHNICAL_AUTH_REVOKED_JTIS` permiten revocar una identidad. La
denegación de red es por defecto y `AUDIT_ALLOWED_NETWORKS` debe contener la
IP/CIDR que el proxy vea realmente.

El 20 de noviembre de 2026, los rechazos `403 insufficient_scope` registraron
`31.70.130.181` como origen observado por Grumphya. La ACL instalada es por
tanto `AUDIT_ALLOWED_NETWORKS=31.70.130.181/32`. Aunque Desarrollo Seguro
identifica su red dedicada de salida como `172.20.0.0/16`, esa red no debe
añadirse a la ACL por suposición: no es la dirección observada por el proxy en
estas peticiones. La ACL solo permite la IP exacta observada. La verificación
del JWT Ed25519, su `kid` permitido, el `scope`, el TTL máximo de cinco minutos
y los límites de peticiones siguen siendo barreras independientes. Cualquier
otra dirección que llegue al guard queda rechazada. Si cambia la topología o
el recorrido, vuelve a medir la IP que ve Grumphya antes de cambiar la ACL; no
amplíes el CIDR por suposición.

## Evidencia interna y atestación

Grumphya genera y persiste sus evidencias internamente. No hay ingesta externa
en Beta D y no se expone ningún endpoint de escritura. El API solo recibe
`SELECT` sobre las tablas de auditoría. Un proceso interno separado escribe
evidencias válidas con un rol dedicado; el proceso de retención usa otro rol
con `DELETE` limitado. Ambos usan PostgreSQL de Grumphya por TLS y no
comparten base de datos con Desarrollo Seguro.

El servicio one-shot `audit-writer` se ejecuta desde el helper de despliegue
después de que la migración y los healthchecks hayan terminado. Está en el
perfil Compose `audit-evidence`, no se publica y solo se activa para persistir
la release candidata. Lee `audit_writer_settings`, un secreto root-only que
contiene exclusivamente la conexión del rol `grumphya_audit_writer`, las
claves públicas de atestación y los identificadores de auditoría; no recibe la
contraseña de la API, OpenAI, SMTP ni el rol de retención. Copia el manifiesto y
la CA a un directorio temporal y baja el proceso a `node` antes de conectar a
PostgreSQL.

El escritor verifica la firma Ed25519 del manifiesto, los siete sobres, el
`deploymentDigest`, las fechas y la cardinalidad antes de abrir la transacción.
Rechaza una atestación de release duplicada por `deployment_sha`, inserta la
atestación y actualiza de forma idempotente las cinco evidencias que no forman
parte del sobre de release (`infrastructure`, `auth`, `quality`, `privacy` y
`ai`). `deployment` y `dependencies` se sirven desde la atestación persistida
del manifiesto. Un fallo revierte toda la transacción y aborta la release; no
se marca como activa una versión sin evidencia firmada.

La migración `039_audit_evidence` crea el esquema, la `040` añade el contrato
Beta D, el recurso `ai`, el `jwt_kid`, la cardinalidad y la atestación, la
`041` crea el upsert `SECURITY DEFINER` del escritor y la `042` sustituye la
restricción heredada de array por la forma objeto de `evidence`. La tabla
`audit.evidence` conserva como máximo una fila actual por recurso. Las
evidencias deben tener `environment=production`, `cardinality=1`, fechas
frescas y una atestación Ed25519 válida. La API verifica la firma antes de
construir la respuesta.

La atestación de release usa `kid=grumphya-release-2026`. La clave privada se
genera en un entorno controlado y solo se guarda como secreto de GitHub Actions
`AUDIT_RELEASE_SIGNING_KEY`; nunca se copia al VPS. La pública se instala en
`AUDIT_RELEASE_MANIFEST_PUBLIC_KEY` y los valores permitidos en
`AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS`. CI firma el manifiesto y cada
envolvente de `deployment` y `dependencies` a partir de los digests
realmente desplegados. El verificador rechaza commits, tags o imágenes locales
como prueba de producción.

### Matriz de permisos

| Rol              | Permisos                                                    | Uso                              |
| ---------------- | ----------------------------------------------------------- | -------------------------------- |
| API              | `SELECT` en `audit.evidence` y `audit.release_attestations` | Lectura autenticada              |
| Escritor interno | `INSERT, UPDATE` en esas tablas                             | Generación interna de evidencias |
| Retención        | `DELETE` en esas tablas y solo sobre la ventana de 30 días  | Purga                            |
| Propietario      | `NOLOGIN`, propietario del esquema y tablas                 | Administración                   |

En el VPS se aprovisionaron y probaron estos nombres: API
`grumphya_app`, escritor `grumphya_audit_writer`, retención
`grumphya_audit_retention` y propietario `grumphya_audit_owner`. Las
credenciales del escritor y de retención están en secretos root-only con modo
`600`. El API tiene `SELECT`, el escritor `INSERT, UPDATE` y la retención
`DELETE`; los dos roles con contraseña iniciaron sesión usando TLS
`verify-full`.

El escritor no recibe `SELECT` sobre las tablas. Para mantener ese límite y
permitir el upsert idempotente, `audit.upsert_evidence` es una función
`SECURITY DEFINER` propiedad de `grumphya_audit_owner`; el escritor solo recibe
`EXECUTE` sobre esa función además de `INSERT, UPDATE`.

Provisiona los roles con
`AUDIT_API_ROLE`, `AUDIT_OWNER_ROLE`, `AUDIT_WRITER_ROLE` y
`AUDIT_RETENTION_ROLE` usando
`scripts/provision-audit-roles.sh`. El script exige
`PGSSLMODE=verify-full`, no imprime contraseñas y comprueba que los roles
sean distintos. `scripts/retire-audit-evidence.sh` solo ejecuta los dos
`DELETE` sobre registros con más de 30 días.

## Instalación, smoke y reversión

1. Instala las claves públicas y variables en
   `/opt/grumphya/.secrets/grumphya_env` con permisos `600`. No copies
   claves privadas ni tokens a issues, commits o logs.
2. Crea `/opt/grumphya/.secrets/audit_writer_settings` con propietario
   `root:root`, modo `600`, el rol `grumphya_audit_writer`, su contraseña
   rotada, la clave pública de atestación, `grumphya-release-2026`,
   `ds-auditor-2026`, `EVALUATION_PROVIDER` y `OPENAI_MODEL`. El archivo no
   debe contener credenciales de la API, OpenAI, SMTP ni la clave privada de
   atestación.
3. Para preparar una instalación nueva, mantén `AUDIT_ENABLED=false` hasta
   completar las comprobaciones de identidad, red y evidencia. El VPS descrito
   arriba ya está habilitado; no cambies su estado solo para repetir la
   preparación.
4. Ejecuta las pruebas locales y el preflight. Tras disponer de un entorno
   habilitado, el smoke reproducible de las siete rutas es:

   ```bash
   AUDIT_BASE_URL=https://grumphya.com \
   AUDIT_JWT='<token efímero obtenido por canal seguro>' \
   node scripts/smoke-audit-contract.mjs
   ```

   El smoke no imprime el token, usa `redirect: "manual"`, comprueba
   `Content-Type: application/json`, la envolvente exacta, la firma
   presente, el `kid`, el `scope`, la cardinalidad y el límite de 64 KiB.

   Desde el origen de Desarrollo Seguro, comprueba el rechazo de un JWT
   inválido contra la instancia actualmente habilitada:

   ```bash
   AUDIT_BASE_URL=https://grumphya.com \
   AUDIT_REJECTION_STATUS=401 \
   AUDIT_REJECTION_CODE=invalid_identity \
   node scripts/smoke-audit-rejection.mjs
   ```

   En un entorno apagado, la misma prueba espera `404` y
   `resource_not_allowed`; desde una red fuera de la ACL, la instancia
   habilitada devuelve `403` e `insufficient_scope` antes de validar el JWT.
   El guard registra únicamente `code`, `ip`, `route` y
   `kid` bajo el evento `AUDIT_REQUEST_REJECTED`; nunca registra el token, las
   cookies ni el cuerpo.

5. Antes de activar otra instancia deben pasar el smoke autenticado y la prueba
   operativa de rechazo desde el origen autorizado observado,
   `31.70.130.181/32`, o desde la IP que esa instancia vea realmente. La clave
   pública JWT y su huella, la ACL, la clave pública de atestación y su `kid`, los roles
   PostgreSQL, la persistencia de las siete evidencias y las pruebas de
   permisos ya deben estar cerrados. Solo entonces se puede cambiar a
   `AUDIT_ENABLED=true` en una release aprobada.
6. Para revertir, vuelve a `AUDIT_ENABLED=false`, retira la ACL, recrea la API
   para que cargue la nueva configuración y comprueba su salud y las rutas
   normales. No hace falta modificar datos funcionales.

Para detectar rápidamente fallos de montaje de secretos, TLS, migraciones y
permisos antes de publicar una release, usa el preflight aislado (no ejecuta
E2E ni contacta con el VPS):

```bash
bash scripts/test-production-compose.sh <sha-de-40-caracteres> --audit-only
```

Este modo levanta solo PostgreSQL, migraciones y API, genera un manifiesto y
una clave efímeros, ejecuta el escritor dos veces, comprueba el rechazo de la
atestación duplicada, valida la lectura del API y verifica que el escritor no
tiene `SELECT`. El smoke completo de producción reutiliza además esta misma
comprobación después de sus validaciones HTTP.

Las pruebas de autorización cubren JWT inválido, scope incorrecto, expiración,
revocación, ACL, cookies y configuración ausente. Las pruebas de servicio
cubren firma inválida, evidencia caducada, vínculo entre `jwtKid` y
`kid`, cardinalidad, tamaño y ausencia de impacto en rutas normales. Las
pruebas de manifiesto cubren la firma de release y las dos envolventes
atestadas.

La integración local no se conecta al VPS, no reinicia contenedores, no activa
la auditoría y no consume minutos de GitHub Actions.
