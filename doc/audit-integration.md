# Integración de evidencias con DesarrolloSeguro

Esta integración es optativa y de solo lectura para Grumphya. No cambia los
flujos de usuarios, las tablas funcionales, los datos de ideas ni la red de
DesarrolloSeguro. Si no se configura `AUDIT_ENABLED=true`, Grumphya se inicia
como siempre y las rutas de auditoría responden `404`.

## Contrato HTTP

Caddy expone únicamente estas rutas externas:

```text
/audit/infrastructure
/audit/deployment
/audit/dependencies
/audit/auth
/audit/quality
/audit/privacy
```

Todas son `GET`, no aceptan query strings ni redirecciones y devuelven JSON.
Caddy las reescribe internamente a `/api/audit/<recurso>`. El prefijo interno
`/api/audit/*` se bloquea antes del proxy general de la API, por lo que no se
publica directamente y nunca cae en la SPA. Métodos no permitidos, recursos
desconocidos y query strings reciben `405`, `404` y `400` respectivamente.

La respuesta válida usa la envolvente `ds-audit-v1`:

```json
{
  "schemaVersion": "ds-audit-v1",
  "observedAt": "2026-11-18T20:00:00.000Z",
  "validUntil": "2026-11-19T20:00:00.000Z",
  "items": []
}
```

`auth` contiene tres observaciones (`login`, `authorization_boundary` y
`logout`); `quality` y `privacy` contienen una por métrica o señal. Las otras
tres respuestas contienen un agregado. Los `GET` solo leen la última evidencia
precalculada: no ejecutan Playwright, Lighthouse, login ni navegación.

## Identidad técnica y ACL

La identidad de DesarrolloSeguro es un JWT independiente de los JWT de usuario
y del token de ingesta de Lighthouse. Se acepta exclusivamente Ed25519 (`alg:
EdDSA`) y son obligatorios `iss`, `aud`, `environment`, `domain`, `scope`,
`iat`, `exp`, `jti` y `kid`. La duración máxima es de cinco minutos, con una
tolerancia de reloj configurable entre 0 y 60 segundos.

La clave pública de DesarrolloSeguro se configura en Grumphya mediante
`AUDIT_TECHNICAL_AUTH_PUBLIC_KEY` o un fichero indicado por
`AUDIT_TECHNICAL_AUTH_PUBLIC_KEY_FILE`. La privada nunca entra en Grumphya.
`AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS` es una lista explícita de claves vigentes;
`AUDIT_TECHNICAL_AUTH_REVOKED_KIDS` y
`AUDIT_TECHNICAL_AUTH_REVOKED_JTIS` permiten revocar una clave o identidad sin
registrar el token. La rotación consiste en publicar el nuevo `kid`, validar
que el lector lo usa y retirar el anterior.

La denegación de red es por defecto. `AUDIT_ALLOWED_NETWORKS` debe contener las
redes o IP de origen de DesarrolloSeguro en CIDR (por ejemplo,
`10.20.30.0/24`); si está vacío, todas las rutas permanecen cerradas. No se
conectan redes Docker de los dos proyectos. Los tokens, claims completos y
payloads sensibles no se escriben en logs, cookies, URL ni respuestas de error.

## Evidencia y atestación

La migración `039_audit_evidence` crea el esquema independiente `audit` con:

- `audit.evidence`, escrito por el job sintético y leído por la API;
- `audit.release_attestations`, con el manifiesto de producción y su firma.

La API comprueba `observedAt`, `validUntil`, una antigüedad máxima de 24 horas
y un límite de respuesta de 64 KiB. La evidencia caducada o ausente devuelve
`503`. El servicio de retención elimina ambas tablas después de 30 días.
Debe provisionarse fuera de la aplicación un rol de escritura para el job y un
rol de solo lectura para la API; el esquema no reutiliza las tablas de usuarios
ni de ideas.

El manifiesto de release debe ser generado por CI a partir de los digests de
las imágenes realmente desplegadas, del inventario de dependencias de esas
imágenes y de los resultados de seguridad agregados. Se firma con una clave
Ed25519 de despliegue. Grumphya verifica la firma usando
`AUDIT_RELEASE_MANIFEST_PUBLIC_KEY` o
`AUDIT_RELEASE_MANIFEST_PUBLIC_KEY_FILE`, exige `environment=production` y no
acepta un commit o una etiqueta local como prueba de producción. La privada de
firma solo existe en el entorno de despliegue.

El workflow produce `release-manifest.json` con los cuatro digests de imagen,
el digest del inventario `pnpm --prod`, los contadores de riesgo y el resultado
de Trivy. Firma el JSON con la clave `AUDIT_RELEASE_SIGNING_KEY` y el helper del
VPS verifica la firma y el SHA de despliegue antes de activar una release cuando
`AUDIT_ENABLED=true`. La ausencia de esa clave bloquea solo ese despliegue
opt-in; el modo normal de Grumphya no depende de la integración.

## Instalación y validación

1. Provisiona las dos claves públicas y los roles de base de datos fuera del
   repositorio. Añade las variables anteriores al secreto `grumphya_env` con
   permisos `600`.
   En el secreto de producción, `AUDIT_RELEASE_MANIFEST_PUBLIC_KEY` debe ser la
   clave en PEM con saltos representados como `\\n`; `AUDIT_RELEASE_SIGNING_KEY`
   solo existe en GitHub Actions y nunca se copia al VPS.
2. Define `AUDIT_ENABLED=true`, la ACL y al menos un `kid` permitido. Reinicia
   la release de Grumphya; sin esos valores el resto de la aplicación no se
   ve afectado y las rutas siguen cerradas.
3. Ejecuta `node scripts/test-audit-contract.mjs`, las pruebas unitarias de
   `apps/api/src/audit/` y el smoke de producción. El preflight debe comprobar
   una petición autenticada, una petición con scope incorrecto, una ACL no
   autorizada, una firma inválida, evidencia caducada y que no se devuelve HTML
   ni una redirección.
4. Actualiza el lector de DesarrolloSeguro para enviar el JWT, validar la
   envolvente, `validUntil`, la firma, la cardinalidad y el enum real de
   privilegios antes de puntuar.

## Reversión

Para desactivar la integración, establece `AUDIT_ENABLED=false` y retira la
ACL del secreto. No hace falta modificar datos funcionales ni conectar otra
red; Caddy conserva las rutas normales de Grumphya. Para revertir una release,
se conserva la atestación de la release anterior junto con su evidencia hasta
que venza la retención, sin reactivar una firma o `kid` revocados.
