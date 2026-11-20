#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly DOMAIN=${1:-${PRODUCTION_DOMAIN:-grumphya.com}}
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || {
  printf 'Invalid public domain.\n' >&2
  exit 2
}

readonly TEMP_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEMP_ROOT"' EXIT

assert_header() {
  local headers=$1 name=$2 pattern=$3
  if ! grep -Eiq "^${name}:[[:space:]]*${pattern}[[:space:]]*$" "$headers"; then
    printf 'Missing or invalid %s header.\n' "$name" >&2
    exit 1
  fi
}

assert_tls_accepted() {
  local version=$1 output_file=$2 output
  output=$(timeout 15 openssl s_client \
    -connect "$DOMAIN:443" \
    -servername "$DOMAIN" \
    "-$version" </dev/null 2>&1 || true)
  printf '%s\n' "$output" > "$output_file"
  grep -q '^New, [^ (]' "$output_file" || {
    printf 'TLS %s was not negotiated.\n' "$version" >&2
    exit 1
  }
  grep -q 'Cipher is \|^    Cipher    : ' "$output_file" || {
    printf 'TLS %s did not negotiate a cipher.\n' "$version" >&2
    exit 1
  }
}

assert_tls_rejected() {
  local version=$1 output_file=$2 output
  output=$(timeout 15 openssl s_client \
    -connect "$DOMAIN:443" \
    -servername "$DOMAIN" \
    "-$version" </dev/null 2>&1 || true)
  printf '%s\n' "$output" > "$output_file"
  if grep -q '^New, [^ (]' "$output_file" &&
    ! grep -q 'Cipher is (NONE)' "$output_file"; then
    printf 'TLS %s was unexpectedly negotiated.\n' "$version" >&2
    exit 1
  fi
  grep -Eiq 'alert protocol version|unsupported protocol|handshake failure|no protocols available' "$output_file" || {
    printf 'TLS %s did not produce a conclusive protocol rejection.\n' "$version" >&2
    exit 1
  }
}

https_headers="$TEMP_ROOT/https.headers"
https_second_headers="$TEMP_ROOT/https-second.headers"
http_headers="$TEMP_ROOT/http.headers"
http_www_headers="$TEMP_ROOT/http-www.headers"
www_headers="$TEMP_ROOT/www.headers"
health_headers="$TEMP_ROOT/health.headers"

https_status=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --dump-header "$https_headers" --output "$TEMP_ROOT/home.html" --write-out '%{http_code}' \
  "https://$DOMAIN/")
[[ "$https_status" == 200 ]] || {
  printf 'HTTPS root must return 200 (got %s).\n' "$https_status" >&2
  exit 1
}
! grep -Eiq '^location:' "$https_headers" || {
  printf 'HTTPS root must not redirect.\n' >&2
  exit 1
}
! grep -Eiq '^set-cookie:' "$https_headers" || {
  printf 'HTTPS root must not set cookies before a user action.\n' >&2
  exit 1
}
assert_header "$https_headers" 'strict-transport-security' 'max-age=31536000; includeSubDomains'
assert_header "$https_headers" 'x-content-type-options' 'nosniff'
assert_header "$https_headers" 'x-frame-options' 'DENY'
assert_header "$https_headers" 'referrer-policy' 'strict-origin-when-cross-origin'
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --dump-header "$https_second_headers" --output "$TEMP_ROOT/home-second.html" \
  "https://$DOMAIN/"
node - "$https_headers" "$TEMP_ROOT/home.html" "$https_second_headers" "$TEMP_ROOT/home-second.html" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");

function readResponse(headersPath, bodyPath) {
  const headers = fs.readFileSync(headersPath, "utf8");
  const body = fs.readFileSync(bodyPath, "utf8");
  const csp = headers.match(/^content-security-policy:\s*(.+)$/im)?.[1];
  assert.ok(csp, "the blocking CSP must be present");
  assert.match(
    csp,
    /default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'nonce-([^']+)' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self' https:\/\/desarrolloseguro\.org/i,
    "the blocking CSP must use a nonce and strict-dynamic without script-src self",
  );
  const nonce = csp.match(/script-src 'nonce-([^']+)' 'strict-dynamic'/i)?.[1];
  assert.ok(nonce, "the blocking CSP nonce must be present");
  const scriptNonces = [...body.matchAll(/<script\b[^>]*\bnonce="([^"]+)"[^>]*>/gi)].map(
    ([, scriptNonce]) => scriptNonce,
  );
  assert.ok(scriptNonces.length >= 2, "the HTML must nonce every executable script");
  assert.ok(
    scriptNonces.every((scriptNonce) => scriptNonce === nonce),
    "every executable script must use the response CSP nonce",
  );
  return nonce;
}

const firstNonce = readResponse(process.argv[2], process.argv[3]);
const secondNonce = readResponse(process.argv[4], process.argv[5]);
assert.notEqual(firstNonce, secondNonce, "the CSP nonce must rotate per response");
NODE
! grep -Eiq '^server:' "$https_headers" || {
  printf 'HTTPS root must not disclose a server header.\n' >&2
  exit 1
}

health_status=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --dump-header "$health_headers" --output "$TEMP_ROOT/health.json" --write-out '%{http_code}' \
  "https://$DOMAIN/api/health")
[[ "$health_status" == 200 ]] || {
  printf 'Public health endpoint must return 200 (got %s).\n' "$health_status" >&2
  exit 1
}
! grep -Eiq '^location:' "$health_headers" || {
  printf 'Public health endpoint must not redirect.\n' >&2
  exit 1
}
grep -Eiq '^content-type:[[:space:]]*application/json(;|[[:space:]]|$)' "$health_headers" || {
  printf 'Public health endpoint must return JSON.\n' >&2
  exit 1
}
! grep -Eiq '^x-powered-by:' "$health_headers" || {
  printf 'Public health endpoint must not disclose the application framework.\n' >&2
  exit 1
}
node - "$TEMP_ROOT/health.json" <<'NODE'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const health = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
assert.equal(health.status, "ok");
NODE

http_status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
  --dump-header "$http_headers" --output /dev/null --write-out '%{http_code}' \
  "http://$DOMAIN/")
[[ "$http_status" == 301 || "$http_status" == 308 ]] || {
  printf 'HTTP root must redirect with 301 or 308 (got %s).\n' "$http_status" >&2
  exit 1
}
grep -Eiq "^location:[[:space:]]*https://$DOMAIN/[[:space:]]*$" "$http_headers" || {
  printf 'HTTP root must redirect exactly to the canonical HTTPS origin.\n' >&2
  exit 1
}
assert_header "$http_headers" 'content-security-policy' \
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
assert_header "$http_headers" 'cache-control' 'no-store'

http_www_status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 \
  --dump-header "$http_www_headers" --output /dev/null --write-out '%{http_code}' \
  "http://www.$DOMAIN/")
[[ "$http_www_status" == 301 || "$http_www_status" == 308 ]] || {
  printf 'HTTP www origin must redirect with 301 or 308 (got %s).\n' "$http_www_status" >&2
  exit 1
}
grep -Eiq "^location:[[:space:]]*https://$DOMAIN/[[:space:]]*$" "$http_www_headers" || {
  printf 'HTTP www origin must redirect exactly to the canonical HTTPS origin.\n' >&2
  exit 1
}
assert_header "$http_www_headers" 'content-security-policy' \
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
assert_header "$http_www_headers" 'cache-control' 'no-store'

www_status=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  --dump-header "$www_headers" --output /dev/null --write-out '%{http_code}' \
  "https://www.$DOMAIN/")
[[ "$www_status" == 301 || "$www_status" == 308 ]] || {
  printf 'www origin must redirect to the canonical domain (got %s).\n' "$www_status" >&2
  exit 1
}
grep -Eiq "^location:[[:space:]]*https://$DOMAIN/[[:space:]]*$" "$www_headers" || {
  printf 'www origin must redirect exactly to the canonical HTTPS origin.\n' >&2
  exit 1
}
assert_header "$www_headers" 'content-security-policy' \
  "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"
assert_header "$www_headers" 'cache-control' 'no-store'

assert_tls_accepted tls1_2 "$TEMP_ROOT/tls1_2.txt"
assert_tls_accepted tls1_3 "$TEMP_ROOT/tls1_3.txt"
assert_tls_rejected tls1 "$TEMP_ROOT/tls1.txt"
assert_tls_rejected tls1_1 "$TEMP_ROOT/tls1_1.txt"

printf 'Public certification smoke passed for %s (headers, redirects, cookies and TLS 1.2/1.3 acceptance with 1.0/1.1 rejection).\n' "$DOMAIN"
