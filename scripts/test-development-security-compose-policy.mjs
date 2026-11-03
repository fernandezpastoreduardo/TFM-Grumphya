import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OVERLAY_PATH = "compose.development-security.production.yaml";
const CADDY_PATH = "docker/Caddyfile.development-security";
const BASE_COMPOSE_PATH = "compose.production.yaml";
const BASE_CADDY_PATH = "docker/Caddyfile";
const BASE_SECRET_NAMES = [
  "grumphya_env",
  "database_settings",
  "postgres_admin_settings",
  "openai_settings",
  "openai_key",
  "mail_settings",
  "admin_settings",
  "internal_tls_ca.crt",
  "api_tls.crt",
  "api_tls.key",
  "web_tls.crt",
  "web_tls.key",
  "postgres_tls.crt",
  "postgres_tls.key",
];
const DEVELOPMENT_SECURITY_SECRET_NAMES = [
  "development_security_admin_password",
  "development_security_admin_url",
  "development_security_migrator_password",
  "development_security_api_database_url",
  "development_security_database_tls.crt",
  "development_security_database_tls.key",
  "development_security_api_tls.crt",
  "development_security_api_tls.key",
];

const [overlay, caddy, baseCompose, baseCaddy, postgresHba] = await Promise.all(
  [
    readFile(OVERLAY_PATH, "utf8"),
    readFile(CADDY_PATH, "utf8"),
    readFile(BASE_COMPOSE_PATH, "utf8"),
    readFile(BASE_CADDY_PATH, "utf8"),
    readFile("docker/postgres-pg_hba.conf", "utf8"),
  ],
);

function serviceBlock(serviceName) {
  const servicePattern = new RegExp(
    `^  ${serviceName}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:|^networks:)`,
    "mu",
  );
  const match = overlay.match(servicePattern);
  assert.ok(match, `overlay must define ${serviceName}`);
  return match[1];
}

const database = serviceBlock("development-security-database");
const migration = serviceBlock("development-security-migrate");
const api = serviceBlock("development-security-api");
const proxy = serviceBlock("proxy");

assert.match(overlay, /DEVELOPMENT_SECURITY_DATABASE_IMAGE/u);
assert.match(overlay, /DEVELOPMENT_SECURITY_IMAGE/u);
assert.match(overlay, /name: development-security-postgres/u);
assert.match(
  overlay,
  /development-security-postgres:\/var\/lib\/postgresql\/data/u,
  "the DS database must keep its own named volume across rollback",
);
assert.match(overlay, /development-security-backend:\n    internal: true/u);
assert.match(overlay, /development-security-edge:\n    internal: true/u);
assert.doesNotMatch(
  overlay,
  /^\s*ports:/mu,
  "the opt-in overlay must not publish DS services on host ports",
);
assert.doesNotMatch(
  overlay,
  /worker|executor|scan-runner/iu,
  "the production slice must not activate a worker, executor, or scanner",
);
assert.doesNotMatch(overlay, /privileged:\s*true/u);
assert.match(database, /privileged:\s*false/u);
assert.match(database, /cap_drop:\s*\[ALL\]/u);
assert.match(database, /POSTGRES_USER:\s*ds_bootstrap/u);
assert.match(
  database,
  /POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\/development_security_admin_password/u,
);
assert.match(database, /-c ssl=on/u);
assert.match(database, /ssl_min_protocol_version=TLSv1\.2/u);
assert.match(
  database,
  /install -o postgres -g postgres -m 0600 \/run\/secrets\/development_security_database_tls\.key/u,
);
assert.match(database, /development-security-postgres/u);
assert.match(
  database,
  /development-security-backend:[\s\S]*?development-security-database/u,
);
assert.match(migration, /user:\s*"0:0"/u);
assert.match(migration, /cap_drop:\s*\[ALL\]/u);
assert.match(migration, /su -p node -s \/bin\/sh/u);
assert.match(
  migration,
  /install -o node -g node -m 0400 \/run\/secrets\/development_security_admin_url/u,
);
assert.match(migration, /DS_PRODUCTION_BOOTSTRAP_ENABLED:\s*"1"/u);
assert.match(migration, /DS_PRODUCTION_DATABASE_NAME:\s*desarrollo_seguro/u);
assert.match(
  migration,
  /provision-production-database\.js/u,
  "the one-shot migration must call the production-gated bootstrap CLI",
);
assert.match(migration, /DS_PRODUCTION_API_DATABASE_URL_FILE/u);
assert.match(migration, /development_security_migrator_password[\s\S]*?0400/u);
assert.match(api, /user:\s*"0:0"/u);
assert.match(api, /cap_drop:\s*\[ALL\]/u);
assert.match(api, /su -p node -s \/bin\/sh/u);
assert.match(
  api,
  /install -o node -g node -m 0400 \/run\/secrets\/development_security_api_tls\.key/u,
);
assert.match(api, /DS_API_TLS_REQUIRED:\s*"true"/u);
assert.match(api, /DS_DATABASE_TLS_REQUIRED:\s*"true"/u);
assert.match(api, /DS_DATABASE_URL_FILE_REQUIRED:\s*"true"/u);
assert.match(api, /DS_TRUSTED_PROXY_CIDRS:\s*172\.29\.0\.254\/32/u);
assert.match(
  overlay,
  /proxy:[\s\S]*?development-security-edge:\n\s+ipv4_address: 172\.29\.0\.254/u,
);
assert.match(api, /mem_limit:\s*512m/u);
assert.match(api, /cpus:\s*0\.75/u);
assert.match(migration, /mem_limit:\s*384m/u);
assert.match(migration, /cpus:\s*0\.5/u);
assert.match(database, /mem_limit:\s*640m/u);
assert.match(database, /cpus:\s*0\.75/u);
assert.match(proxy, /Caddyfile\.development-security/u);
assert.match(
  proxy,
  /development-security-api:[\s\S]*?condition: service_healthy/u,
);
assert.match(
  caddy,
  /@developmentSecurityAPI path \/api\/desarrollo-seguro\/v1\/\*/u,
);
assert.ok(
  caddy.indexOf("handle @developmentSecurityAPI") <
    caddy.indexOf("@api path /api/*"),
  "the DS route must be evaluated before Grumphya's generic API route",
);
assert.match(
  caddy,
  /tls_trust_pool file \/run\/secrets\/internal_tls_ca\.crt/u,
);
assert.match(caddy, /tls_server_name development-security-api/u);
const baseSecurityHeaders = baseCaddy.match(
  /\n\theader \{([\s\S]*?)\n\t\}/u,
)?.[1];
const alternateSecurityHeaders = caddy.match(
  /\n\theader \{([\s\S]*?)\n\t\}/u,
)?.[1];
assert.ok(
  baseSecurityHeaders,
  "base Caddy config must keep its security headers",
);
assert.equal(
  alternateSecurityHeaders,
  baseSecurityHeaders,
  "the opt-in Caddy config must retain the production Grumphya headers unchanged",
);
assert.match(postgresHba, /^hostnossl all all all reject$/mu);
assert.match(baseCaddy, /@api path \/api\/\*/u);
assert.doesNotMatch(baseCaddy, /development-security-api/u);
assert.doesNotMatch(baseCompose, /development-security-postgres/u);

const composeCli = spawnSync("docker", ["compose", "version"], {
  encoding: "utf8",
});
if (!composeCli.error) {
  const syntheticRoot = mkdtempSync(
    join(tmpdir(), "development-security-compose-policy-"),
  );
  const grumphyaSecretDirectory = join(syntheticRoot, "grumphya");
  const developmentSecuritySecretDirectory = join(
    syntheticRoot,
    "development-security",
  );
  mkdirSync(grumphyaSecretDirectory, { mode: 0o700 });
  mkdirSync(developmentSecuritySecretDirectory, { mode: 0o700 });
  for (const name of BASE_SECRET_NAMES) {
    writeFileSync(join(grumphyaSecretDirectory, name), "synthetic-only\n", {
      mode: 0o600,
    });
  }
  for (const name of DEVELOPMENT_SECURITY_SECRET_NAMES) {
    writeFileSync(
      join(developmentSecuritySecretDirectory, name),
      "synthetic-only\n",
      { mode: 0o600 },
    );
  }
  chmodSync(syntheticRoot, 0o700);
  const composeConfig = spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      "development-security-policy",
      "--file",
      BASE_COMPOSE_PATH,
      "--file",
      OVERLAY_PATH,
      "config",
      "--quiet",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DOMAIN: "development-security-policy.invalid",
        DEVELOPMENT_SECURITY_IMAGE: "development-security-api:synthetic",
        DEVELOPMENT_SECURITY_DATABASE_IMAGE:
          "development-security-database:synthetic",
        GRUMPHYA_SECRETS_DIR: grumphyaSecretDirectory,
        DEVELOPMENT_SECURITY_SECRETS_DIR: developmentSecuritySecretDirectory,
      },
    },
  );
  try {
    assert.equal(
      composeConfig.status,
      0,
      `synthetic docker compose config failed: ${composeConfig.stderr}`,
    );
  } finally {
    rmSync(syntheticRoot, { recursive: true, force: true });
  }
}

process.stdout.write("Development Security opt-in Compose policy passed.\n");
