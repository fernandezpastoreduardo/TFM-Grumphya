#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly OUTPUT_DIR=${1:-.secrets}
readonly REQUIRED_FILES=(
  internal_tls_ca.crt internal_tls_ca.key
  api_tls.crt api_tls.key web_tls.crt web_tls.key
  postgres_tls.crt postgres_tls.key
)

mkdir -p -- "$OUTPUT_DIR"
for file in "${REQUIRED_FILES[@]}"; do
  if [[ -e "$OUTPUT_DIR/$file" ]]; then
    printf 'Refusing to overwrite existing internal TLS material: %s\n' "$OUTPUT_DIR/$file" >&2
    exit 1
  fi
done

readonly TEMP_DIR=$(mktemp -d "$OUTPUT_DIR/.internal-tls.XXXXXX")
cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
  -keyout "$TEMP_DIR/internal_tls_ca.key" \
  -out "$TEMP_DIR/internal_tls_ca.crt" \
  -subj "/CN=Grumphya Internal Services CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

create_leaf_certificate() {
  local service=$1 sans=$2
  openssl req -new -newkey rsa:2048 -nodes -sha256 \
    -keyout "$TEMP_DIR/${service}_tls.key" \
    -out "$TEMP_DIR/${service}_tls.csr" \
    -subj "/CN=$service"
  cat > "$TEMP_DIR/${service}_tls.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$sans
EOF
  openssl x509 -req -sha256 -days 397 \
    -in "$TEMP_DIR/${service}_tls.csr" \
    -CA "$TEMP_DIR/internal_tls_ca.crt" \
    -CAkey "$TEMP_DIR/internal_tls_ca.key" \
    -CAcreateserial \
    -extfile "$TEMP_DIR/${service}_tls.ext" \
    -out "$TEMP_DIR/${service}_tls.crt"
}

create_leaf_certificate api 'DNS:api,IP:127.0.0.1'
create_leaf_certificate web 'DNS:web,IP:127.0.0.1'
create_leaf_certificate postgres 'DNS:db'

for file in "${REQUIRED_FILES[@]}"; do
  install -m 0600 "$TEMP_DIR/$file" "$OUTPUT_DIR/$file"
done
chmod 0644 "$OUTPUT_DIR/internal_tls_ca.crt" "$OUTPUT_DIR/api_tls.crt" \
  "$OUTPUT_DIR/web_tls.crt" "$OUTPUT_DIR/postgres_tls.crt"

printf 'Created private internal TLS CA and service certificates in %s. Keep the CA key offline after provisioning.\n' "$OUTPUT_DIR"
