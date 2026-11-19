# Integración de auditoría privada D

Esta integración es optativa y permanece cerrada mientras
`AUDIT_ENABLED=false`. No modifica los flujos de usuarios, los datos
funcionales, la red Docker ni las tablas de ideas. Si falta la configuración o
la evidencia, las rutas de auditoría responden con un rechazo JSON y el resto
de Grumphya funciona igual.

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
  "hostname": "grumphya.com",
  "environment": "production",
  "generatedAt": "2026-11-19T20:00:00.000Z",
  "expiresAt": "2026-11-20T20:00:00.000Z",
  "profile": "beta-d-0.2",
  "scope": "audit:quality",
  "evidence": {},
  "attestation": {
    "alg": "EdDSA",
    "kid": "grumphya-release-2026",
    "signature": "<base64url>"
  },
  "kid": "ds-auditor-2026"
}
```

`scope` coincide con el recurso solicitado. `kid` identifica el JWT que
autorizó la lectura; el `kid` de `attestation` es independiente y pertenece
a la release. Se devuelve como máximo un resultado por ruta y la respuesta
completa ocupa menos de 64 KiB. No se sirven fixtures, semillas ni datos
simulados en producción.

## Identidad, autorización y red

Se verifica exclusivamente JWT Ed25519 (`alg=EdDSA`) con estos valores
exactos:

- `iss=desarrolloseguro-audit`
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

Desarrollo Seguro ha observado `31.70.130.181/32` como IP de salida y
`172.20.0.0/16` como red interna. En la comprobación operativa no se pudo
observar todavía una petición de auditoría desde ese origen: el contenedor
actual no resolvió `grumphya.com` y no tiene una ruta de salida utilizable. Por
eso `AUDIT_ALLOWED_NETWORKS` sigue sin instalarse; no se acepta esa IP por
suposición. Debe añadirse solo después de confirmar el origen que Caddy vea
realmente. La auditoría permanece apagada y el proxy nunca se conecta a
`development-security-edge` para este contrato.

## Evidencia interna y atestación

Grumphya genera y persiste sus evidencias internamente. No hay ingesta externa
en Beta D y no se expone ningún endpoint de escritura. El API solo recibe
`SELECT` sobre las tablas de auditoría. Un proceso interno separado escribe
evidencias válidas con un rol dedicado; el proceso de retención usa otro rol
con `DELETE` limitado. Ambos usan PostgreSQL de Grumphya por TLS y no
comparten base de datos con Desarrollo Seguro.

La migración `039_audit_evidence` crea el esquema y la `040` añade el
contrato Beta D, el recurso `ai`, el `jwt_kid`, la cardinalidad y la
atestación. La tabla `audit.evidence` conserva como máximo una fila actual
por recurso. Las evidencias deben tener `environment=production`,
`cardinality=1`, fechas frescas y una atestación Ed25519 válida. La API
verifica la firma antes de construir la respuesta.

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
2. Mantén `AUDIT_ENABLED=false`. La ausencia de la extensión, de la red o de
   las claves deja el despliegue habitual operativo.
3. Ejecuta las pruebas locales y el preflight. Tras disponer de un entorno
   habilitado, el smoke reproducible de las siete rutas es:

   ```bash
   AUDIT_BASE_URL=https://grumphya.com \
   AUDIT_JWT='<token efímero obtenido por canal seguro>' \
   node scripts/smoke-audit-contract.mjs
   ```

   El smoke no imprime el token, usa `redirect: "manual"`, comprueba
   `Content-Type: application/json`, la envolvente exacta, la firma
   presente, el `kid`, el `scope`, la cardinalidad y el límite de 64 KiB.

4. Antes de cualquier activación debe estar cerrada la ACL observada. La
   clave pública JWT y su huella, la clave pública de atestación y su `kid`,
   los roles PostgreSQL y las pruebas de permisos ya están cerrados. Solo
   entonces se puede cambiar a `AUDIT_ENABLED=true` en una release aprobada.
5. Para revertir, vuelve a `AUDIT_ENABLED=false`, retira la ACL y conserva
   las rutas normales. No hace falta reiniciar ni modificar datos funcionales.

Las pruebas de autorización cubren JWT inválido, scope incorrecto, expiración,
revocación, ACL, cookies y configuración ausente. Las pruebas de servicio
cubren firma inválida, evidencia caducada, vínculo entre `jwtKid` y
`kid`, cardinalidad, tamaño y ausencia de impacto en rutas normales. Las
pruebas de manifiesto cubren la firma de release y las dos envolventes
atestadas.

La integración local no se conecta al VPS, no reinicia contenedores, no activa
la auditoría y no consume minutos de GitHub Actions.
