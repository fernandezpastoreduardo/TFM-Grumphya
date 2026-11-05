#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
readonly SHA_PATTERN='^[0-9a-f]{40}$'

usage() {
  printf 'Usage: %s <40-character-deploy-sha> [--validate-only]\n' "$0" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
readonly DEPLOY_SHA=$1
MODE=${2:-run}
[[ $DEPLOY_SHA =~ $SHA_PATTERN ]] || usage
[[ $MODE == run || $MODE == --validate-only ]] || usage

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
EOF
cat > "$TEMP_ROOT/.secrets/database_settings" <<'EOF'
PGDATABASE=grumphya_ci
PGUSER=grumphya_runtime
GRUMPHYA_DB_PASSWORD=ci-fake-database-password
EOF
cat > "$TEMP_ROOT/.secrets/postgres_admin_settings" <<'EOF'
POSTGRES_ADMIN_PASSWORD=ci-fake-postgres-admin-password
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
  rm -rf -- "$TEMP_ROOT"
  printf 'Production Compose configuration is valid with isolated test volumes.\n'
  exit 0
fi

if ! docker info >/dev/null; then
  rm -rf -- "$TEMP_ROOT"
  printf 'Docker daemon is unavailable; production Compose smoke cannot run.\n' >&2
  exit 1
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
    printf 'Proxy container logs:\n' >&2
    "${compose[@]}" logs --no-color --tail=100 proxy >&2 || true
  fi
  return "$status"
}

trap 'cleanup $?' EXIT
trap on_error ERR
started=1

"${compose[@]}" config --quiet
"${compose[@]}" up --detach --pull never --no-build --wait --wait-timeout 180
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
node - "$TEMP_ROOT/public-headers.txt" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const responseHeaders = readFileSync(process.argv[2], "utf8");
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
assert.match(responseHeaders, /base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'/i);
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

prototype_redirect_status=$(curl --insecure --silent --show-error \
  --dump-header "$TEMP_ROOT/development-security-redirect.headers" \
  --output /dev/null --write-out '%{http_code}' \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro")
if [[ $prototype_redirect_status != 308 ]]; then
  printf 'The prototype URL without its trailing slash must redirect with 308.\n' >&2
  exit 1
fi
node - "$TEMP_ROOT/development-security-redirect.headers" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const responseHeaders = readFileSync(process.argv[2], "utf8");
assert.match(responseHeaders, /^location:\s*\/desarrollo-seguro\/\s*$/im);
NODE

curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro/" \
  --dump-header "$TEMP_ROOT/development-security.headers" \
  -o "$TEMP_ROOT/development-security.html"
node - "$TEMP_ROOT/development-security.headers" "$TEMP_ROOT/development-security.html" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const responseHeaders = readFileSync(process.argv[2], "utf8");
const prototypeHtml = readFileSync(process.argv[3], "utf8");
assert.match(responseHeaders, /^cache-control:\s*no-cache\s*$/im);
assert.match(responseHeaders, /^content-security-policy:\s*base-uri 'self'/im);
assert.match(prototypeHtml, /<title>Desarrollo Seguro · Prácticas que se pueden explicar<\/title>/);
assert.match(prototypeHtml, /id="sello"/);
assert.match(prototypeHtml, /<script src="\/desarrollo-seguro\/prototype\.js" defer><\/script>/);
assert.match(prototypeHtml, /id="buscador"/);
assert.match(prototypeHtml, /id="como-funciona"/);
assert.match(prototypeHtml, /id="contacto"/);
NODE

curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro/prototype.js" \
  --dump-header "$TEMP_ROOT/development-security-script.headers" \
  -o "$TEMP_ROOT/development-security-prototype.js"
node - "$TEMP_ROOT/development-security-script.headers" "$TEMP_ROOT/development-security-prototype.js" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const responseHeaders = readFileSync(process.argv[2], "utf8");
const prototypeScript = readFileSync(process.argv[3], "utf8");
assert.match(responseHeaders, /^cache-control:\s*no-cache\s*$/im);
assert.match(prototypeScript, /new URL\(normalizedValue\)/);
assert.match(prototypeScript, /addEventListener\("click"/);
assert.doesNotMatch(prototypeScript, /fetch\(|XMLHttpRequest|document\.cookie|localStorage/);
NODE

curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro/styles.css" \
  --dump-header "$TEMP_ROOT/development-security-styles.headers" \
  -o /dev/null
node - "$TEMP_ROOT/development-security-styles.headers" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
assert.match(
  readFileSync(process.argv[2], "utf8"),
  /^cache-control:\s*no-cache\s*$/im,
);
NODE
prototype_unknown_status=$(curl --insecure --silent --show-error \
  --output /dev/null --write-out '%{http_code}' \
  "https://localhost:$HTTPS_PORT/desarrollo-seguro/no-existe" \
)
if [[ $prototype_unknown_status != 404 ]]; then
  printf 'Unknown secure-development prototype paths must return 404 (got %s).\n' \
    "$prototype_unknown_status" >&2
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

printf 'Production Compose smoke passed: HTTPS proxy, SPA, API, pgvector, production mode, internal ports, and persistence after recreation.\n'
