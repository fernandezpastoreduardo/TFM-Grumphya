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
  local status=$?
  if (( started == 1 )); then
    printf 'Production Compose smoke failed; isolated service state follows.\n' >&2
    "${compose[@]}" ps >&2 || true
  fi
  return "$status"
}

trap 'cleanup $?' EXIT
trap on_error ERR
started=1

"${compose[@]}" config --quiet
"${compose[@]}" up --detach --pull never --no-build --wait --wait-timeout 180

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
curl --insecure --fail --silent --show-error \
  "https://localhost:$HTTPS_PORT/account" -o "$TEMP_ROOT/account.html"
cmp -s "$TEMP_ROOT/home.html" "$TEMP_ROOT/account.html"
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
