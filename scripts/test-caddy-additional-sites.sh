#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 2 ]] || {
  printf 'Usage: %s <proxy-image> <internal-ca-file>\n' "$0" >&2
  exit 2
}

readonly PROXY_IMAGE=$1
readonly INTERNAL_CA=$2
readonly REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
readonly TEMP_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEMP_ROOT"' EXIT

mkdir "$TEMP_ROOT/sites"
cp "$REPO_ROOT/docker/additional-sites/desarrolloseguro.caddy.example" \
  "$TEMP_ROOT/sites/desarrolloseguro.caddy"

validate_caddy() {
  local output_file=$1
  shift
  docker run --rm --network none \
    --env DOMAIN=grumphya.com \
    --volume "$REPO_ROOT/docker/Caddyfile:/etc/caddy/Caddyfile:ro" \
    --volume "$INTERNAL_CA:/run/secrets/internal_tls_ca.crt:ro" \
    "$@" \
    "$PROXY_IMAGE" caddy adapt --config /etc/caddy/Caddyfile \
    --adapter caddyfile --validate > "$output_file"
}

validate_caddy "$TEMP_ROOT/base.json"
validate_caddy "$TEMP_ROOT/additional.json" \
  --volume "$TEMP_ROOT/sites:/etc/caddy/sites-enabled:ro"

node - "$TEMP_ROOT/base.json" "$TEMP_ROOT/additional.json" <<'NODE'
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const base = JSON.parse(readFileSync(process.argv[2], "utf8"));
const additional = JSON.parse(readFileSync(process.argv[3], "utf8"));

function routeFor(configuration, hostname) {
  const servers = Object.values(configuration.apps.http.servers);
  const routes = servers.flatMap((server) => server.routes ?? []);
  return routes.find((route) =>
    route.match?.some((matcher) => matcher.host?.includes(hostname)),
  );
}

function withoutGeneratedGroups(value) {
  if (Array.isArray(value)) return value.map(withoutGeneratedGroups);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "group")
        .map(([key, child]) => [key, withoutGeneratedGroups(child)]),
    );
  }
  return value;
}

for (const hostname of ["grumphya.com", "www.grumphya.com"]) {
  assert.deepEqual(
    withoutGeneratedGroups(routeFor(additional, hostname)),
    withoutGeneratedGroups(routeFor(base, hostname)),
  );
}
assert.equal(routeFor(base, "desarrolloseguro.org"), undefined);
assert.equal(routeFor(base, "www.desarrolloseguro.org"), undefined);

const rootSite = routeFor(additional, "desarrolloseguro.org");
const wwwSite = routeFor(additional, "www.desarrolloseguro.org");
assert.ok(rootSite);
assert.ok(wwwSite);
const rootConfig = JSON.stringify(rootSite);
assert.match(rootConfig, /"dial":"development-security-web:8080"/);
assert.doesNotMatch(rootConfig, /development-security-edge|development-security-api|postgres|api:3000/);
assert.match(
  JSON.stringify(wwwSite),
  /"Location":\["https:\/\/desarrolloseguro\.org\{http\.request\.uri\}"\]/,
);
assert.equal(additional.apps.http.servers.srv0.logs, undefined);
NODE

printf 'Base and additional Caddy sites validated without network access.\n'
