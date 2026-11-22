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
const contractMigration = await readFile(
  "apps/api/migrations/040_audit_contract_beta_d02.sql",
  "utf8",
);
const writerMigration = await readFile(
  "apps/api/migrations/041_audit_writer_upsert.sql",
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
const auditSmoke = await readFile("scripts/smoke-audit-contract.mjs", "utf8");
const rejectionSmoke = await readFile(
  "scripts/smoke-audit-rejection.mjs",
  "utf8",
);
const writer = await readFile(
  "apps/api/src/audit/audit-evidence-writer.ts",
  "utf8",
);
const writerEntrypoint = await readFile(
  "docker/audit-writer-entrypoint.sh",
  "utf8",
);
const productionCompose = await readFile("compose.production.yaml", "utf8");
const deployHelper = await readFile("docker/vps-deploy.sh", "utf8");
const ciWorkflow = await readFile(".github/workflows/ci.yml", "utf8");
const technicalAuth = await readFile(
  "apps/api/src/audit/audit-technical-auth.ts",
  "utf8",
);

const auditPaths = [
  "/audit/infrastructure",
  "/audit/deployment",
  "/audit/dependencies",
  "/audit/auth",
  "/audit/quality",
  "/audit/privacy",
  "/audit/ai",
  "/audit/processors",
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
  "AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS",
]) {
  assert.match(entrypoint, new RegExp(name));
}
assert.match(migrationRegistry, /039_audit_evidence/);
assert.match(migrationRegistry, /040_audit_contract_beta_d02/);
assert.match(migrationRegistry, /041_audit_writer_upsert/);
assert.match(migration, /CREATE SCHEMA IF NOT EXISTS audit/);
assert.match(contractMigration, /'ai'/);
assert.match(contractMigration, /attestation jsonb/);
assert.match(contractMigration, /jwt_kid text/);
assert.match(writerMigration, /SECURITY DEFINER/);
assert.match(
  writerMigration,
  /CREATE OR REPLACE FUNCTION audit\.upsert_evidence/,
);
assert.match(writerMigration, /REVOKE ALL ON FUNCTION audit\.upsert_evidence/);
assert.match(auditBlock, /not method GET/);
assert.doesNotMatch(auditBlock, /POST|PUT|PATCH/);
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
  /GRANT EXECUTE ON FUNCTION audit\.upsert_evidence/,
);
assert.match(roleProvisioning, /AUDIT_WRITER_ROLE/);
assert.doesNotMatch(roleProvisioning, /AUDIT_INGEST_ROLE/);
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
assert.match(productionComposeSmoke, /--audit-only/);
assert.match(productionComposeSmoke, /root-only secret handoff/);
assert.match(productionComposeSmoke, /Duplicate audit release attestation/);
assert.match(
  productionComposeSmoke,
  /has_table_privilege\('grumphya_audit_writer'/,
);
assert.match(
  productionComposeSmoke,
  /has_function_privilege\('grumphya_audit_writer'/,
);
assert.match(
  productionComposeSmoke,
  /AUDIT_MANIFEST_FILE=\$AUDIT_MANIFEST_FILE/,
);
assert.match(auditSmoke, /infrastructure/);
assert.match(auditSmoke, /dependencies/);
assert.match(auditSmoke, /redirect: "manual"/);
assert.match(auditSmoke, /64 \* 1024/);
assert.match(rejectionSmoke, /redirect: "manual"/);
assert.match(rejectionSmoke, /AUDIT_REJECTION_SMOKE/);
assert.doesNotMatch(rejectionSmoke, /console\.log\([^)]*invalidToken/);
assert.match(technicalAuth, /AUDIT_REQUEST_REJECTED/);
assert.match(technicalAuth, /requestRoute/);
assert.match(technicalAuth, /readHeaderKid/);
assert.match(productionCompose, /audit-writer:/);
assert.match(productionCompose, /audit-evidence/);
assert.match(productionCompose, /audit_writer_settings/);
assert.match(
  productionCompose,
  /AUDIT_MANIFEST_FILE: \/workspace\/release-manifest\.json/,
);
assert.match(
  productionCompose,
  /AUDIT_MANIFEST_SIGNATURE_FILE: \/workspace\/release-manifest\.sig/,
);
assert.match(writer, /verifyReleaseManifest/);
assert.match(writer, /Duplicate audit release attestation/);
assert.match(
  ciWorkflow,
  /chmodSync\("release\/release-manifest\.json", 0o644\)/,
);
assert.match(
  ciWorkflow,
  /chmodSync\("release\/release-manifest\.sig", 0o644\)/,
);
assert.match(writer, /isUniqueViolation/);
assert.match(writer, /23505/);
assert.doesNotMatch(writer, /ON CONFLICT \(deployment_sha\)/);
assert.doesNotMatch(writer, /SELECT 1 FROM audit\.release_attestations/);
assert.match(writer, /audit\.upsert_evidence/);
assert.match(writerEntrypoint, /PGSSL_MODE/);
assert.match(writerEntrypoint, /AUDIT_WRITER_SETTINGS_FILE/);
assert.match(writerEntrypoint, /setpriv --reuid=node/);
assert.match(deployHelper, /persisting signed audit evidence/);
assert.match(deployHelper, /--profile audit-evidence run/);
assert.match(
  deployHelper,
  /temporary_dir=\$\(mktemp -d "\$ROOT\/incoming\/audit-verify\.XXXXXXXX"\)/,
);
assert.match(
  deployHelper,
  /install -m 0444 "\$manifest" "\$temporary_dir\/release-manifest\.json"/,
);
assert.match(
  deployHelper,
  /install -m 0444 "\$signature" "\$temporary_dir\/release-manifest\.sig"/,
);
assert.match(deployHelper, /--volume "\$temporary_dir:\/audit:ro"/);
assert.doesNotMatch(
  deployHelper,
  /--volume "\$dir:\/audit:ro"[\s\S]*--volume "\$temporary_key:\/audit\/public-key\.pem:ro"/,
);
console.log("Audit contract configuration validated.");
