# Integración de evidencias con DesarrolloSeguro

Esta integración es optativa y las rutas públicas de Grumphya son de solo lectura. No cambia los
flujos de usuarios, las tablas funcionales, los datos de ideas ni la red de
DesarrolloSeguro. Si no se configura `AUDIT_ENABLED=true`, Grumphya se inicia
como siempre y las rutas de auditoría responden `404`.

El contrato implementado es `beta-d-0.2`. La identidad preparada por
DesarrolloSeguro usa el `kid` `ds-auditor-2026`. La huella SHA-256 del fichero
PEM público recibido es
`b131af991d5056e26e12fe27df33e149f48e46209d5a4f848944ac5255703bc5`; la
huella se documenta solo para verificar el material recibido y no sustituye la
entrega por un canal seguro.

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

La respuesta válida usa la envolvente `beta-d-0.2`:

```json
{
  "schemaVersion": "beta-d-0.2",
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

La denegación de red es por defecto. `AUDIT_ALLOWED_NETWORKS` debe contener la
IP o CIDR que el proxy observe realmente, no una red Docker supuesta. La red
de egress propuesta por DesarrolloSeguro (`172.20.0.0/16`) todavía no se ha
confirmado como origen observado por el proxy; por eso el valor permanece
pendiente y la auditoría sigue apagada. No se conectan redes Docker de los dos
proyectos. Los tokens, claims completos y payloads sensibles no se escriben en
logs, cookies, URL ni respuestas de error.

## Evidencia y atestación

La migración `039_audit_evidence` crea el esquema independiente `audit` con:

- `audit.evidence`, escrito por el job sintético y leído por la API;
- `audit.release_attestations`, con el manifiesto de producción y su firma.

La API comprueba `observedAt`, `validUntil`, una antigüedad máxima de 24 horas
y un límite de respuesta de 64 KiB. La evidencia caducada o ausente devuelve
`503`. La atestación exige el SHA de la release desplegada, cuatro digests
`sha256` y una firma Ed25519 válida. El esquema no reutiliza las tablas de
usuarios ni de ideas.

La aplicación no ejecuta borrados de auditoría con su conexión normal. La
retención se ejecuta aparte mediante `scripts/retire-audit-evidence.sh`, que
usa TLS y un rol limitado a `DELETE` sobre las dos tablas de auditoría. Los
roles se preparan con `scripts/provision-audit-roles.sh` después de aplicar la
migración 039:

| Rol             | Permisos en `audit`                             | Uso                                        |
| --------------- | ----------------------------------------------- | ------------------------------------------ |
| API de Grumphya | `SELECT` en `evidence` y `release_attestations` | Lectura pública autenticada                |
| Ingesta         | `INSERT, UPDATE` en ambas tablas                | Canal de evidencias, pendiente del handoff |
| Retención       | `DELETE` en ambas tablas                        | Ventana de 30 días                         |
| Propietario     | `NOLOGIN`, propietario del esquema/tablas       | Administración controlada                  |

Ambos scripts exigen `PGSSLMODE=verify-full`, una CA confiable y no imprimen
contraseñas. El canal de ingesta aún no se habilita: falta que Desarrollo
Seguro publique el path, envolvente de escritura, firma de evidencia,
certificado/hostname TLS y reglas de reintento. Las rutas `GET` existentes no
se convierten en un canal de escritura ni aceptan redes compartidas.

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
   permisos `600`. La clave pública de atestación generada para Grumphya se
   verifica con la huella DER
   `0f7301d6b6c8d147437007ba7a69867b8f49dbfec2c913fd2a376a104cbe07d9`; la
   privada existe únicamente como secreto de GitHub Actions
   `AUDIT_RELEASE_SIGNING_KEY`.
   En el secreto de producción, `AUDIT_RELEASE_MANIFEST_PUBLIC_KEY` debe ser la
   clave en PEM con saltos representados como `\\n`; `AUDIT_RELEASE_SIGNING_KEY`
   solo existe en GitHub Actions y nunca se copia al VPS.
2. Mantén `AUDIT_ENABLED=false` hasta que Desarrollo Seguro entregue el canal
   de ingesta y se confirme la IP/CIDR observada. Con la auditoría desactivada
   el resto de la aplicación no se ve afectado y las rutas siguen cerradas.
3. Ejecuta `node scripts/test-audit-contract.mjs`, las pruebas unitarias de
   `apps/api/src/audit/` y el smoke de producción. El preflight debe comprobar
   una petición autenticada, una petición con scope incorrecto, una ACL no
   autorizada, una firma inválida, evidencia caducada y que no se devuelve HTML
   ni una redirección.
4. Solo después de completar esos prerrequisitos, configura `AUDIT_ENABLED=true`
   y reinicia la release. Actualiza el lector de DesarrolloSeguro para enviar el JWT, validar la
   envolvente, `validUntil`, la firma, la cardinalidad y el enum real de
   privilegios antes de puntuar.

## Reversión

Para desactivar la integración, establece `AUDIT_ENABLED=false` y retira la
ACL del secreto. No hace falta modificar datos funcionales ni conectar otra
red; Caddy conserva las rutas normales de Grumphya. Para revertir una release,
se conserva la atestación de la release anterior junto con su evidencia hasta
que venza la retención, sin reactivar una firma o `kid` revocados.

## Estado de la preparación

La implementación local queda preparada pero opt-in: `AUDIT_ENABLED=false`,
`AUDIT_ALLOWED_NETWORKS` sigue pendiente de la IP/CIDR que observe el proxy y
el canal TLS de ingesta no está publicado. No se ha activado ninguna ruta ni
se ha lanzado un despliegue por este cambio.

Las verificaciones ejecutadas sin consumir minutos de GitHub Actions fueron:

- `node scripts/test-audit-contract.mjs`;
- `node scripts/test-release-manifest.mjs`;
- `pnpm --filter @grumphya/api exec vitest run src/audit` (23 tests);
- `pnpm test` (1038 tests pasados, 25 omitidos);
- `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm format:check`.

La suite completa de tests se ejecutó con permiso local únicamente para sus
listeners HTTP. No se conectó al VPS, no se reiniciaron contenedores y no se
ejecutó GitHub Actions.
