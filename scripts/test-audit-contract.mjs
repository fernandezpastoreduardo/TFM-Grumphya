import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const caddy = await readFile("docker/Caddyfile", "utf8");
const entrypoint = await readFile("docker/api-entrypoint.sh", "utf8");
const migrationRegistry = await readFile(
  "apps/api/src/infrastructure/database/run-migrations.ts",
  "utf8",
);
const migration = await readFile(
  "apps/api/migrations/039_audit_evidence.sql",
  "utf8",
);
const retention = await readFile(
  "apps/api/src/infrastructure/data-retention/data-retention.service.ts",
  "utf8",
);
const roleProvisioning = await readFile(
  "scripts/provision-audit-roles.sh",
  "utf8",
);
const auditRetention = await readFile(
  "scripts/retire-audit-evidence.sh",
  "utf8",
);
const optionalCompose = await readFile(
  "docker/additional-sites.compose.yaml.example",
  "utf8",
);
const productionComposeSmoke = await readFile(
  "scripts/test-production-compose.sh",
  "utf8",
);

const auditPaths = [
  "/audit/infrastructure",
  "/audit/deployment",
  "/audit/dependencies",
  "/audit/auth",
  "/audit/quality",
  "/audit/privacy",
];
for (const path of auditPaths)
  assert.match(caddy, new RegExp(path.replaceAll("/", "\\/")));
assert.match(caddy, /@directAudit path \/api\/audit \/api\/audit\//);
assert.match(caddy, /respond `\{\"code\":\"resource_not_allowed\"/);
assert.match(
  caddy,
  /@auditQuery expression `\{http\.request\.uri\.query\} != ""`/,
);
assert.match(caddy, /@auditMethod not method GET/);
assert.match(caddy, /rewrite \* \/api\{uri\}/);
assert.match(caddy, /@unknownAudit path \/audit \/audit\//);
assert.doesNotMatch(caddy, /redir .*audit/);
const auditBlock = caddy.slice(
  caddy.indexOf("@audit path"),
  caddy.indexOf("@api path"),
);
assert.doesNotMatch(auditBlock, /reverse_proxy https:\/\/web/);
assert.match(caddy, /header Content-Type application\/json/);

for (const name of [
  "AUDIT_ENABLED",
  "AUDIT_TECHNICAL_AUTH_PUBLIC_KEY",
  "AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS",
  "AUDIT_TECHNICAL_AUTH_REVOKED_KIDS",
  "AUDIT_TECHNICAL_AUTH_REVOKED_JTIS",
  "AUDIT_ALLOWED_NETWORKS",
  "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY",
]) {
  assert.match(entrypoint, new RegExp(name));
}
assert.match(migrationRegistry, /039_audit_evidence/);
assert.match(migration, /CREATE SCHEMA IF NOT EXISTS audit/);
assert.doesNotMatch(retention, /DELETE FROM audit\./i);
assert.match(roleProvisioning, /PGSSLMODE.*verify-full/);
assert.match(
  roleProvisioning,
  /GRANT SELECT ON TABLE audit\.evidence, audit\.release_attestations TO/,
);
assert.match(
  roleProvisioning,
  /GRANT INSERT, UPDATE ON TABLE audit\.evidence, audit\.release_attestations TO/,
);
assert.match(
  roleProvisioning,
  /GRANT DELETE ON TABLE audit\.evidence, audit\.release_attestations TO/,
);
assert.match(auditRetention, /DELETE FROM audit\.evidence/);
assert.match(auditRetention, /DELETE FROM audit\.release_attestations/);
assert.match(auditRetention, /interval '30 days'/);
assert.match(auditRetention, /PGSSLMODE.*verify-full/);
assert.doesNotMatch(optionalCompose, /development-security-edge/);
assert.match(productionComposeSmoke, /AUDIT_ENABLED=false/);
console.log("Audit contract configuration validated.");
