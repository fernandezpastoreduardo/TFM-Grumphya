#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
readonly SHA_PATTERN='^[0-9a-f]{40}$'

usage() {
  printf 'Usage: %s <40-character-deploy-sha> [--validate-only|--audit-only]\n' "$0" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
readonly DEPLOY_SHA=$1
MODE=${2:-run}
[[ $DEPLOY_SHA =~ $SHA_PATTERN ]] || usage
[[ $MODE == run || $MODE == --validate-only || $MODE == --audit-only ]] || usage

readonly STACK_ID="grumphya-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
readonly STACK_CHECKSUM=$(printf '%s' "$STACK_ID" | cksum | awk '{print $1}')
readonly NETWORK_SLOT=$((STACK_CHECKSUM % 254 + 1))
readonly EDGE_SUBNET="10.240.${NETWORK_SLOT}.0/24"
readonly EDGE_PROXY_IP="10.240.${NETWORK_SLOT}.254"
readonly BACKEND_SUBNET="10.241.${NETWORK_SLOT}.0/24"
readonly BACKEND_PROXY_IP="10.241.${NETWORK_SLOT}.254"
readonly HTTP_PORT=$((18000 + NETWORK_SLOT))
readonly HTTPS_PORT=$((40000 + NETWORK_SLOT))
readonly TEMP_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEMP_ROOT"' EXIT
readonly COMPOSE_FILE="$TEMP_ROOT/compose.production.yaml"
readonly OVERRIDE_FILE="$TEMP_ROOT/compose.ci.yaml"
readonly ENV_FILE="$TEMP_ROOT/.env.production"

mkdir -m 700 "$TEMP_ROOT/.secrets"
cp "$REPO_ROOT/docker/Caddyfile" "$TEMP_ROOT/docker-Caddyfile"
mkdir -m 700 "$TEMP_ROOT/docker"
mv "$TEMP_ROOT/docker-Caddyfile" "$TEMP_ROOT/docker/Caddyfile"
sed \
  -e "s|172[.]30[.]0[.]0/24|$EDGE_SUBNET|g" \
  -e "s|172[.]30[.]0[.]254|$EDGE_PROXY_IP|g" \
  -e "s|172[.]31[.]0[.]0/24|$BACKEND_SUBNET|g" \
  -e "s|172[.]31[.]0[.]254|$BACKEND_PROXY_IP|g" \
  -e "s|\"80:80\"|\"127.0.0.1:$HTTP_PORT:80\"|g" \
  -e "s|\"443:443\"|\"127.0.0.1:$HTTPS_PORT:443\"|g" \
  -e "s|\"443:443/udp\"|\"127.0.0.1:$HTTPS_PORT:443/udp\"|g" \
  "$REPO_ROOT/compose.production.yaml" > "$COMPOSE_FILE"

cat > "$OVERRIDE_FILE" <<EOF
volumes:
  grumphya-production-postgres:
    name: ${STACK_ID}-postgres
    labels:
      com.grumphya.ci.stack: ${STACK_ID}
  grumphya-production-avatars:
    name: ${STACK_ID}-avatars
    labels:
      com.grumphya.ci.stack: ${STACK_ID}
  grumphya-caddy-data:
    name: ${STACK_ID}-caddy-data
    labels:
      com.grumphya.ci.stack: ${STACK_ID}
  grumphya-caddy-config:
    name: ${STACK_ID}-caddy-config
    labels:
      com.grumphya.ci.stack: ${STACK_ID}
EOF

cat > "$ENV_FILE" <<EOF
DOMAIN=localhost
DEPLOY_SHA=$DEPLOY_SHA
GRUMPHYA_SECRETS_DIR=$TEMP_ROOT/.secrets
TEST_HTTP_PORT=$HTTP_PORT
TEST_HTTPS_PORT=$HTTPS_PORT
API_IMAGE=grumphya-api:$DEPLOY_SHA
WEB_IMAGE=grumphya-web:$DEPLOY_SHA
DATABASE_IMAGE=grumphya-database:$DEPLOY_SHA
PROXY_IMAGE=grumphya-proxy:$DEPLOY_SHA
EOF

cat > "$TEMP_ROOT/.secrets/grumphya_env" <<'EOF'
ACCESS_TOKEN_SECRET=ci-fake-access-token-secret-never-use-in-production-0000000000000000
ANONYMOUS_IP_HMAC_SECRET=ci-fake-anonymous-ip-secret-never-use-in-production-0000000000000000
AUDIT_ENABLED=false
EOF
cat > "$TEMP_ROOT/.secrets/database_settings" <<'EOF'
PGDATABASE=grumphya_ci
PGUSER=grumphya_runtime
GRUMPHYA_DB_PASSWORD=ci-fake-database-password
EOF
cat > "$TEMP_ROOT/.secrets/postgres_admin_settings" <<'EOF'
POSTGRES_ADMIN_PASSWORD=ci-fake-postgres-admin-password
EOF
cat > "$TEMP_ROOT/.secrets/audit_writer_settings" <<'EOF'
PGDATABASE=grumphya_ci
PGUSER=grumphya_audit_writer
PGPASSWORD=ci-fake-audit-writer-password
AUDIT_RELEASE_MANIFEST_PUBLIC_KEY=ci-fake-public-key
AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS=grumphya-release-2026
AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS=ds-auditor-2026
EVALUATION_PROVIDER=openai
OPENAI_MODEL=gpt-5.4-mini
EOF
cat > "$TEMP_ROOT/.secrets/openai_settings" <<'EOF'
EVALUATION_PROVIDER=openai
OPENAI_MODEL=gpt-5.4-mini
EOF
cat > "$TEMP_ROOT/.secrets/openai_key" <<'EOF'
OPENAI_API_KEY=ci-fake-openai-key-no-requests-are-made
EOF
cat > "$TEMP_ROOT/.secrets/mail_settings" <<'EOF'
MAIL_SMTP_HOST=127.0.0.1
MAIL_SMTP_PORT=2525
MAIL_USERNAME=ci-fake-user
MAIL_PASSWORD=ci-fake-password
MAIL_FROM_ADDRESS=ci@example.invalid
EOF
cat > "$TEMP_ROOT/.secrets/admin_settings" <<'EOF'
ADMIN_EMAIL=ci@example.invalid
ADMIN_PASSWORD=ci-fake-admin-password
EOF
bash "$REPO_ROOT/scripts/generate-internal-tls.sh" "$TEMP_ROOT/.secrets"

compose=(
  docker compose
  --project-name "$STACK_ID"
  --env-file "$ENV_FILE"
  --file "$COMPOSE_FILE"
  --file "$OVERRIDE_FILE"
)

if [[ $MODE == --validate-only ]]; then
  trap 'rm -rf -- "$TEMP_ROOT"' EXIT
  "${compose[@]}" config --quiet
  mkdir -m 700 "$TEMP_ROOT/sites"
  cp "$REPO_ROOT/docker/additional-sites/desarrolloseguro.caddy.example" \
    "$TEMP_ROOT/sites/desarrolloseguro.caddy"
  GRUMPHYA_ADDITIONAL_SITES_DIR="$TEMP_ROOT/sites" \
    "${compose[@]}" --file "$REPO_ROOT/docker/additional-sites.compose.yaml.example" \
    config --format json | node -e '
      const assert = require("node:assert/strict");
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { input += chunk; });
      process.stdin.on("end", () => {
        const services = JSON.parse(input).services;
        assert.ok(services.proxy.networks["development-security-ingress"]);
        assert.ok(services.proxy.networks.edge);
        assert.ok(services.proxy.networks.backend);
        for (const name of ["api", "db", "web", "migrate"]) {
          assert.equal(services[name].networks["development-security-ingress"], undefined);
        }
        assert.equal(JSON.stringify(services).includes("development-security-edge"), false);
      });
    '
  rm -rf -- "$TEMP_ROOT"
  printf 'Base and optional production Compose configurations are valid with isolated test volumes.\n'
  exit 0
fi

readonly AUDIT_MANIFEST_FILE="$TEMP_ROOT/release-manifest.json"
readonly AUDIT_SIGNATURE_FILE="$TEMP_ROOT/release-manifest.sig"
cat > "$TEMP_ROOT/dependency-inventory.json" <<'EOF'
{"name":"audit-integration-fixture","version":"0.0.0","dependencies":{}}
EOF
cat > "$TEMP_ROOT/security-results.json" <<'EOF'
{"trivy":{"status":"passed"},"highRiskCount":0,"criticalRiskCount":0,"secretCount":0}
EOF
cat > "$TEMP_ROOT/compose-audit-evidence.json" <<'EOF'
{"tlsTransportVerified":true,"securityHeadersVerified":true,"networkSurfaceRestricted":true}
EOF
cat > "$TEMP_ROOT/browser-audit-evidence.json" <<'EOF'
{"responseTimeMs":210,"firstContentfulPaintMs":700,"interactionToNextPaintMs":32,"criticalAccessibilityViolations":0,"firstPartyCookiesOnly":true,"essentialStorageOnly":true,"thirdPartyOriginCount":1,"thirdPartyOriginsAllowlisted":true,"privacyChoiceSelected":true,"privacyPolicyVisible":true,"aiDisclosureVisible":true,"noticeAcknowledged":true}
EOF
CI_QUALITY_RESULT=success CI_E2E_RESULT=success CI_DEPENDENCY_RESULT=success \
  node "$REPO_ROOT/scripts/build-release-audit-evidence.mjs" \
  "$TEMP_ROOT/security-results.json" \
  "$TEMP_ROOT/compose-audit-evidence.json" \
  "$TEMP_ROOT/browser-audit-evidence.json" \
  "$TEMP_ROOT/audit-evidence.json"
node "$REPO_ROOT/scripts/create-release-manifest.mjs" \
  "$AUDIT_MANIFEST_FILE" \
  "$TEMP_ROOT/dependency-inventory.json" \
  "$TEMP_ROOT/security-results.json" \
  "$DEPLOY_SHA" \
  sha256:0000000000000000000000000000000000000000000000000000000000000001 \
  sha256:0000000000000000000000000000000000000000000000000000000000000002 \
  sha256:0000000000000000000000000000000000000000000000000000000000000003 \
  sha256:0000000000000000000000000000000000000000000000000000000000000004 \
  "$TEMP_ROOT/audit-evidence.json"
node --input-type=module - "$AUDIT_MANIFEST_FILE" "$AUDIT_SIGNATURE_FILE" \
  "$TEMP_ROOT/audit-attestation-private.pem" "$TEMP_ROOT/audit-attestation-public.pem" <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
import { generateKeyPairSync, sign } from "node:crypto";

const [manifestPath, signaturePath, privatePath, publicPath] = process.argv.slice(2);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
await writeFile(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
await writeFile(publicPath, publicKey.export({ type: "spki", format: "pem" }), { mode: 0o644 });
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};
for (const envelope of Object.values(manifest.audit.envelopes)) {
  const unsigned = { ...envelope };
  delete unsigned.attestation;
  envelope.attestation.signature = sign(
    null,
    Buffer.from(stableJson(unsigned)),
    privateKey,
  ).toString("base64url");
}
await writeFile(manifestPath, stableJson(manifest), { mode: 0o600 });
await writeFile(signaturePath, sign(null, await readFile(manifestPath), privateKey).toString("base64url"), { mode: 0o600 });
NODE

audit_public_key_escaped=$(awk 'BEGIN { ORS="" } { gsub(/\r/, ""); printf "%s\\n", $0 }' \
  "$TEMP_ROOT/audit-attestation-public.pem")
cat > "$TEMP_ROOT/.secrets/audit_writer_settings" <<EOF
PGDATABASE=grumphya_ci
PGUSER=grumphya_audit_writer
PGPASSWORD=ci-fake-audit-writer-password
AUDIT_RELEASE_MANIFEST_PUBLIC_KEY=$audit_public_key_escaped
AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS=grumphya-release-2026
AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS=ds-auditor-2026
EVALUATION_PROVIDER=openai
OPENAI_MODEL=gpt-5.4-mini
EOF
cat >> "$ENV_FILE" <<EOF
AUDIT_MANIFEST_FILE=$AUDIT_MANIFEST_FILE
AUDIT_MANIFEST_SIGNATURE_FILE=$AUDIT_SIGNATURE_FILE
EOF

if ! docker info >/dev/null; then
  rm -rf -- "$TEMP_ROOT"
  printf 'Docker daemon is unavailable; production Compose smoke cannot run.\n' >&2
  exit 1
fi
if [[ $MODE != --audit-only ]]; then
  bash "$REPO_ROOT/scripts/test-caddy-additional-sites.sh" \
    "grumphya-proxy:$DEPLOY_SHA" "$TEMP_ROOT/.secrets/internal_tls_ca.crt"
fi
started=0

cleanup() {
  local status=$1 volume label
  trap - EXIT ERR
  set +e
  if (( started == 1 )); then
    "${compose[@]}" down --remove-orphans >/dev/null 2>&1
    for volume in \
      "$STACK_ID-postgres" \
      "$STACK_ID-avatars" \
      "$STACK_ID-caddy-data" \
      "$STACK_ID-caddy-config"; do
      label=$(docker volume inspect --format '{{ index .Labels "com.grumphya.ci.stack" }}' "$volume" 2>/dev/null)
      if [[ $label == "$STACK_ID" ]]; then
        docker volume rm "$volume" >/dev/null 2>&1
      fi
    done
  fi
  rm -rf -- "$TEMP_ROOT"
  exit "$status"
}

on_error() {
  local status=$? api_container db_container web_container
  if (( started == 1 )); then
    printf 'Production Compose smoke failed; isolated service state follows.\n' >&2
    "${compose[@]}" ps >&2 || true
    db_container=$("${compose[@]}" ps --quiet db 2>/dev/null || true)
    if [[ -n $db_container ]]; then
      printf 'Database container health details:\n' >&2
      docker inspect --format '{{json .State.Health}}' "$db_container" >&2 || true
    fi
    api_container=$("${compose[@]}" ps --quiet api 2>/dev/null || true)
    if [[ -n $api_container ]]; then
      printf 'API container health details:\n' >&2
      docker inspect --format '{{json .State.Health}}' "$api_container" >&2 || true
    fi
    web_container=$("${compose[@]}" ps --quiet web 2>/dev/null || true)
    if [[ -n $web_container ]]; then
      printf 'Web container health details:\n' >&2
      docker inspect --format '{{json .State.Health}}' "$web_container" >&2 || true
    fi
    printf 'Web container logs:\n' >&2
    "${compose[@]}" logs --no-color --tail=100 web >&2 || true
    printf 'Migration container logs:\n' >&2
    "${compose[@]}" logs --no-color --tail=100 migrate >&2 || true
    printf 'Proxy container logs:\n' >&2
    "${compose[@]}" logs --no-color --tail=100 proxy >&2 || true
  fi
  return "$status"
}

trap 'cleanup $?' EXIT
trap on_error ERR
started=1

"${compose[@]}" config --quiet
compose_services=(db migrate api web proxy)
if [[ $MODE == --audit-only ]]; then
  compose_services=(db migrate api)
fi
"${compose[@]}" up --detach --pull never --no-build --wait --wait-timeout 180 \
  "${compose_services[@]}"
"${compose[@]}" exec --no-TTY api node -e '
  const { Client } = require("./apps/api/node_modules/pg");
  const client = new Client({
    host: "db",
    port: 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: false,
  });
  client.connect().then(() => {
    console.error("PostgreSQL unexpectedly accepted a plaintext connection.");
    process.exit(1);
  }).catch((error) => {
    if (error.code === "28000") process.exit(0);
    console.error("Plaintext PostgreSQL probe failed for an unexpected reason.");
    process.exit(1);
  });
'

if [[ $MODE != --audit-only ]]; then
assert_not_published() {
  local service=$1 container_id ports
  container_id=$("${compose[@]}" ps --quiet "$service")
  [[ -n $container_id ]] || {
    printf 'Expected service %s to have a running container.\n' "$service" >&2
    return 1
  }
  ports=$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$container_id")
  node -e '
    const bindings = JSON.parse(process.argv[1]);
    const published = Object.values(bindings).some((value) => Array.isArray(value) && value.length > 0);
    if (published) process.exit(1);
  ' "$ports" || {
    printf 'Internal service %s unexpectedly publishes a host port.\n' "$service" >&2
    return 1
  }
}

assert_not_published api
assert_not_published db
assert_not_published web

assert_proxy_ports() {
  local container_id ports
  container_id=$("${compose[@]}" ps --quiet proxy)
  [[ -n $container_id ]] || {
    printf 'Expected the proxy service to have a running container.\n' >&2
    return 1
  }
  ports=$(docker inspect --format '{{json .NetworkSettings.Ports}}' "$container_id")
  node - "$ports" "$HTTP_PORT" "$HTTPS_PORT" <<'NODE'
const assert = require("node:assert/strict");
const ports = JSON.parse(process.argv[2]);
const expected = {
  "80/tcp": process.argv[3],
  "443/tcp": process.argv[4],
  "443/udp": process.argv[4],
};
const publishedPorts = Object.entries(ports)
  .filter(([, bindings]) => Array.isArray(bindings) && bindings.length > 0)
  .map(([containerPort]) => containerPort)
  .sort();
assert.deepEqual(publishedPorts, Object.keys(expected).sort());
for (const [containerPort, hostPort] of Object.entries(expected)) {
  assert.equal(ports[containerPort]?.length, 1);
  assert.equal(ports[containerPort][0].HostPort, hostPort);
  assert.equal(ports[containerPort][0].HostIp, "127.0.0.1");
}
NODE
}

assert_proxy_ports
[[ $("${compose[@]}" exec --no-TTY api node -p 'process.env.NODE_ENV') == production ]]

curl --insecure --fail --silent --show-error --retry 12 --retry-connrefused --retry-delay 2 \
  --dump-header "$TEMP_ROOT/public-headers.txt" \
  "https://localhost:$HTTPS_PORT/" -o "$TEMP_ROOT/home.html"
tls_version=$(node --input-type=module - "$HTTPS_PORT" <<'NODE'
import { connect } from "node:tls";

const port = Number(process.argv[2]);
const socket = connect(
  { host: "127.0.0.1", port, servername: "localhost", rejectUnauthorized: false },
  () => {
    process.stdout.write(socket.getProtocol() ?? "");
    socket.end();
  },
);
socket.setTimeout(5000, () => socket.destroy(new Error("TLS handshake timed out")));
socket.on("error", () => {
  process.stderr.write("TLS_HANDSHAKE_FAILED\n");
  process.exitCode = 1;
});
NODE
)
[[ $tls_version == TLSv1.2 || $tls_version == TLSv1.3 ]] || {
  printf 'Expected TLS 1.2 or 1.3 from the production proxy (got %s).\n' \
    "$tls_version" >&2
  exit 1
}
node - "$TEMP_ROOT/public-headers.txt" "$TEMP_ROOT/home.html" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const responseHeaders = readFileSync(process.argv[2], "utf8");
const homeHtml = readFileSync(process.argv[3], "utf8");
assert.doesNotMatch(responseHeaders, /^server:/im, "the public response must not disclose its server");
assert.match(homeHtml, /<link rel="canonical" href="https:\/\/grumphya\.com\/"/);
assert.match(
  responseHeaders,
  /^content-type:\s*text\/html(?:\s*;[^\r\n]*)?\s*$/im,
  "the root route must return HTML with the correct MIME type",
);
for (const header of [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "content-security-policy",
  "content-security-policy-report-only",
]) {
  assert.match(responseHeaders, new RegExp(`^${header}:`, "im"));
}
assert.match(responseHeaders, /^cross-origin-opener-policy:\s*same-origin\s*$/im);
assert.match(responseHeaders, /^cross-origin-embedder-policy:\s*require-corp\s*$/im);
assert.match(
  responseHeaders,
  /default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'nonce-([^']+)' 'strict-dynamic' https:\/\/desarrolloseguro\.org; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self' https:\/\/desarrolloseguro\.org/i,
  "the blocking CSP must use a per-response nonce and restrict document, script, style, image, font and connection sources",
);
const cspNonce = responseHeaders.match(
  /^content-security-policy:\s*.*script-src 'nonce-([^']+)' 'strict-dynamic'/im,
)?.[1];
assert.ok(cspNonce, "the blocking CSP nonce must be present");
const scriptNonces = [
  ...homeHtml.matchAll(/<script\b[^>]*\bnonce="([^"]+)"[^>]*>/gi),
].map(([, nonce]) => nonce);
assert.ok(scriptNonces.length >= 2, "the HTML must nonce every executable script");
assert.ok(
  scriptNonces.every((nonce) => nonce === cspNonce),
  "every executable script must use the response CSP nonce",
);
const permissionsPolicy = responseHeaders.match(/^permissions-policy:\s*(.+)$/im)?.[1];
assert.ok(permissionsPolicy, "voice dictation Permissions-Policy must be present");
assert.match(permissionsPolicy, /microphone=\(self\)/);
assert.match(permissionsPolicy, /on-device-speech-recognition=\(self\)/);
NODE

for registration_path in /crear-cuenta /crear-cuenta/planes; do
  registration_name=${registration_path//\//-}
  registration_status=$(curl --insecure --silent --show-error \
    --dump-header "$TEMP_ROOT/${registration_name}.headers" \
    --output "$TEMP_ROOT/${registration_name}.html" \
    --write-out '%{http_code}' \
    "https://localhost:$HTTPS_PORT$registration_path")
  if [[ $registration_status != 200 ]]; then
    printf 'Registration route %s must return 200 without redirecting (got %s).\n' \
      "$registration_path" "$registration_status" >&2
    exit 1
  fi
done
node - "$TEMP_ROOT/-crear-cuenta.headers" "$TEMP_ROOT/-crear-cuenta.html" \
  "$TEMP_ROOT/-crear-cuenta-planes.headers" "$TEMP_ROOT/-crear-cuenta-planes.html" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
for (const path of [process.argv[2], process.argv[4]]) {
  const headers = readFileSync(path, "utf8");
  assert.match(headers, /^content-type:\s*text\/html(?:\s*;[^\r\n]*)?\s*$/im);
  assert.doesNotMatch(headers, /^location:/im, "registration routes must stay on the public origin");
}
assert.match(readFileSync(process.argv[3], "utf8"), /<div id="root"><\/div>/);
assert.match(
  readFileSync(process.argv[5], "utf8"),
  /Para crear tu cuenta, primero elige un plan/,
);
NODE

for legacy_path in /desarrollo-seguro /desarrollo-seguro/ /desarrollo-seguro/no-existe; do
  redirect_status=$(curl --insecure --silent --show-error \
    --dump-header "$TEMP_ROOT/development-security-redirect.headers" \
    --output /dev/null --write-out '%{http_code}' \
    "https://localhost:$HTTPS_PORT$legacy_path")
  if [[ $redirect_status != 308 ]]; then
    printf 'Legacy prototype path must redirect with 308 (got %s).\n' "$redirect_status" >&2
    exit 1
  fi
  node - "$TEMP_ROOT/development-security-redirect.headers" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const responseHeaders = readFileSync(process.argv[2], "utf8");
assert.match(responseHeaders, /^location:\s*https:\/\/desarrolloseguro\.org\/\s*$/im);
NODE
done

for legacy_path in /desarrollo-seguro /desarrollo-seguro/ /desarrollo-seguro/no-existe; do
  post_status=$(curl --insecure --silent --show-error \
    --request POST --data 'synthetic-post-body' \
    --dump-header "$TEMP_ROOT/legacy-post.headers" \
    --output /dev/null --write-out '%{http_code}' \
    "https://localhost:$HTTPS_PORT$legacy_path")
  if [[ $post_status != 405 ]]; then
    printf 'Legacy prototype POST must return 405 without redirecting (got %s).\n' "$post_status" >&2
    exit 1
  fi
  node - "$TEMP_ROOT/legacy-post.headers" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const headers = readFileSync(process.argv[2], "utf8");
assert.match(headers, /^allow:\s*GET, HEAD\s*$/im);
assert.doesNotMatch(headers, /^location:/im);
NODE
done

head_status=$(curl --insecure --silent --show-error --head \
  --dump-header "$TEMP_ROOT/legacy-head.headers" \
  --output /dev/null --write-out '%{http_code}' \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro")
if [[ $head_status != 308 ]]; then
  printf 'Legacy prototype HEAD must redirect with 308 (got %s).\n' "$head_status" >&2
  exit 1
fi

neighbor_status=$(curl --insecure --silent --show-error \
  --dump-header "$TEMP_ROOT/legacy-neighbor.headers" \
  --output /dev/null --write-out '%{http_code}' \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro-otro")
if [[ $neighbor_status == 308 ]]; then
  printf 'A route with a similar prefix must not redirect externally.\n' >&2
  exit 1
fi

curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/account" -o "$TEMP_ROOT/account.html"
node - "$TEMP_ROOT/account.html" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const accountHtml = readFileSync(process.argv[2], "utf8");
assert.match(accountHtml, /<div id="root"><\/div>/);
assert.doesNotMatch(accountHtml, /Antes de construirla,/);
assert.match(accountHtml, /<meta name="robots" content="noindex"/);
assert.doesNotMatch(accountHtml, /rel="canonical"|property="og:url"/);
NODE
curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/build.json" -o "$TEMP_ROOT/build.json"
node - "$DEPLOY_SHA" "$TEMP_ROOT/build.json" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const expectedRevision = process.argv[2];
const build = JSON.parse(readFileSync(process.argv[3], "utf8"));
assert.equal(build.revision, expectedRevision);
NODE

curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/api/health" -o "$TEMP_ROOT/health.json"
node - "$DEPLOY_SHA" "$TEMP_ROOT/health.json" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const expectedRevision = process.argv[2];
const health = JSON.parse(readFileSync(process.argv[3], "utf8"));
assert.equal(health.status, "ok");
assert.equal(health.database, "ok");
assert.equal(health.revision, expectedRevision);
assert.match(health.pgvector, /^\d+\.\d+\.\d+$/);
NODE

"${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci \
  -c 'CREATE TABLE ci_persistence_probe (marker text PRIMARY KEY); INSERT INTO ci_persistence_probe VALUES ($$compose-smoke$$);' \
  >/dev/null
"${compose[@]}" exec --no-TTY --user node api sh -c \
  'printf "avatar-smoke\n" > "/workspace/var/avatars/$1"' sh "$STACK_ID.txt"

"${compose[@]}" up --detach --pull never --no-build --force-recreate --wait --wait-timeout 180 \
  db migrate api web proxy

[[ $("${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci -Atc \
  'SELECT marker FROM ci_persistence_probe') == compose-smoke ]]
[[ $("${compose[@]}" exec --no-TTY --user node api cat \
  "/workspace/var/avatars/$STACK_ID.txt") == avatar-smoke ]]
fi

"${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci <<'SQL'
CREATE ROLE grumphya_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE grumphya_audit_writer LOGIN PASSWORD 'ci-fake-audit-writer-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE grumphya_audit_retention LOGIN PASSWORD 'ci-fake-audit-retention-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER SCHEMA audit OWNER TO grumphya_audit_owner;
ALTER TABLE audit.evidence OWNER TO grumphya_audit_owner;
ALTER TABLE audit.release_attestations OWNER TO grumphya_audit_owner;
ALTER FUNCTION audit.upsert_evidence(text, timestamptz, timestamptz, text, text, integer, text, jsonb, jsonb) OWNER TO grumphya_audit_owner;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON TABLE audit.evidence, audit.release_attestations FROM PUBLIC, grumphya_runtime, grumphya_audit_writer, grumphya_audit_retention;
REVOKE ALL ON FUNCTION audit.upsert_evidence(text, timestamptz, timestamptz, text, text, integer, text, jsonb, jsonb) FROM PUBLIC, grumphya_runtime, grumphya_audit_retention;
GRANT USAGE ON SCHEMA audit TO grumphya_runtime, grumphya_audit_writer, grumphya_audit_retention;
GRANT SELECT ON TABLE audit.evidence, audit.release_attestations TO grumphya_runtime;
GRANT INSERT, UPDATE ON TABLE audit.evidence, audit.release_attestations TO grumphya_audit_writer;
GRANT EXECUTE ON FUNCTION audit.upsert_evidence(text, timestamptz, timestamptz, text, text, integer, text, jsonb, jsonb) TO grumphya_audit_writer;
GRANT DELETE ON TABLE audit.evidence, audit.release_attestations TO grumphya_audit_retention;
SQL

writer_log="$TEMP_ROOT/audit-writer.log"
if ! "${compose[@]}" --profile audit-evidence run --rm --no-deps audit-writer >"$writer_log"; then
  printf 'Audit writer integration failed on the first run.\n' >&2
  cat "$writer_log" >&2
  exit 1
fi
if "${compose[@]}" --profile audit-evidence run --rm --no-deps audit-writer \
  >"$TEMP_ROOT/audit-writer-duplicate.log" 2>&1; then
  printf 'Audit writer integration accepted a duplicate release attestation.\n' >&2
  exit 1
fi
grep -Fq 'Duplicate audit release attestation.' "$TEMP_ROOT/audit-writer-duplicate.log"

"${compose[@]}" exec --no-TTY api sh -c \
  'set -eu
   while IFS= read -r setting || [ -n "$setting" ]; do
     case "$setting" in
       PGDATABASE=*) export PGDATABASE=${setting#*=} ;;
       PGUSER=*) export PGUSER=${setting#*=} ;;
       GRUMPHYA_DB_PASSWORD=*) export PGPASSWORD=${setting#*=} ;;
     esac
   done < /run/secrets/database_settings
   PGSSL_MODE=verify-full PGSSL_CA_FILE=/run/secrets/internal_tls_ca.crt \
     node --input-type=module' <<'NODE'
import { createPostgresPool } from "./apps/api/dist/infrastructure/database/postgres-pool.js";
const pool = createPostgresPool();
const result = await pool.query("SELECT count(*)::int AS count FROM audit.evidence");
if (result.rows[0].count !== 5) process.exit(1);
await pool.end();
NODE
[[ $("${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci -Atc \
  "SELECT count(*) FROM audit.release_attestations") == 1 ]]
[[ $("${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci -Atc \
  "SELECT has_table_privilege('grumphya_audit_writer', 'audit.evidence', 'SELECT')") == f ]]
[[ $("${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci -Atc \
  "SELECT has_table_privilege('grumphya_runtime', 'audit.evidence', 'SELECT')") == t ]]
[[ $("${compose[@]}" exec --no-TTY db psql -U postgres -d grumphya_ci -Atc \
  "SELECT has_function_privilege('grumphya_audit_writer', 'audit.upsert_evidence(text,timestamptz,timestamptz,text,text,integer,text,jsonb,jsonb)', 'EXECUTE')") == t ]]

if [[ $MODE != --audit-only ]]; then
  curl --insecure --fail --silent --show-error \
    "https://localhost:$HTTPS_PORT/api/health" -o "$TEMP_ROOT/health-after-recreate.json"
  node - "$DEPLOY_SHA" "$TEMP_ROOT/health-after-recreate.json" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const expectedRevision = process.argv[2];
const health = JSON.parse(readFileSync(process.argv[3], "utf8"));
assert.equal(health.status, "ok");
assert.equal(health.revision, expectedRevision);
NODE
fi

if [[ $MODE == --audit-only ]]; then
  printf 'Audit writer integration passed: TLS, root-only secret handoff, least-privilege roles, signed manifest, duplicate rejection, and API read access.\n'
else
  printf 'Production Compose smoke passed: HTTPS proxy, SPA, API, pgvector, production mode, internal ports, and persistence after recreation.\n'
fi

if [[ -n ${AUDIT_EVIDENCE_OUTPUT_PATH:-} ]]; then
  [[ $MODE == run ]] || {
    printf 'Audit evidence requires the full production Compose smoke.\n' >&2
    exit 1
  }
  node - "$AUDIT_EVIDENCE_OUTPUT_PATH" "$tls_version" <<'NODE'
const { writeFileSync } = require("node:fs");
const [outputPath, tlsVersion] = process.argv.slice(2);
writeFileSync(
  outputPath,
  `${JSON.stringify({
    tlsTransportVerified: ["TLSv1.2", "TLSv1.3"].includes(tlsVersion),
    securityHeadersVerified: true,
    networkSurfaceRestricted: true,
  })}\n`,
  { mode: 0o600 },
);
NODE
fi
