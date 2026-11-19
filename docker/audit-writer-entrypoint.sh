#!/bin/sh
set -eu

SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}
SETTINGS_FILE="$SECRETS_DIR/audit_writer_settings"
CA_FILE="$SECRETS_DIR/internal_tls_ca.crt"
MANIFEST_FILE=${AUDIT_MANIFEST_FILE:-/workspace/release-manifest.json}
SIGNATURE_FILE=${AUDIT_MANIFEST_SIGNATURE_FILE:-/workspace/release-manifest.sig}

if [ ! -r "$SETTINGS_FILE" ] || [ ! -r "$CA_FILE" ]; then
  echo "Audit writer secrets are missing or unreadable." >&2
  exit 1
fi
if [ ! -r "$MANIFEST_FILE" ] || [ ! -r "$SIGNATURE_FILE" ]; then
  echo "Audit release manifest is missing or unreadable." >&2
  exit 1
fi

while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    ''|\#*) continue ;;
    PGDATABASE=*) PGDATABASE=${settings_line#*=} ;;
    PGUSER=*) PGUSER=${settings_line#*=} ;;
    PGPASSWORD=*) PGPASSWORD=${settings_line#*=} ;;
    AUDIT_RELEASE_MANIFEST_PUBLIC_KEY=*) AUDIT_RELEASE_MANIFEST_PUBLIC_KEY=${settings_line#*=} ;;
    AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS=*) AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS=${settings_line#*=} ;;
    AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS=*) AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS=${settings_line#*=} ;;
    EVALUATION_PROVIDER=*) EVALUATION_PROVIDER=${settings_line#*=} ;;
    OPENAI_MODEL=*) OPENAI_MODEL=${settings_line#*=} ;;
  esac
done < "$SETTINGS_FILE"

for required_setting in PGDATABASE PGUSER PGPASSWORD AUDIT_RELEASE_MANIFEST_PUBLIC_KEY AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS; do
  eval "setting_value=\${$required_setting-}"
  if [ -z "$setting_value" ]; then
    echo "Audit writer setting '$required_setting' is missing." >&2
    exit 1
  fi
done

RUNTIME_DIR=$(mktemp -d /tmp/grumphya-audit-writer.XXXXXX)
cleanup() { rm -rf "$RUNTIME_DIR"; }
trap cleanup EXIT
install -o node -g node -m 0444 "$CA_FILE" "$RUNTIME_DIR/ca.crt"
install -o node -g node -m 0444 "$MANIFEST_FILE" "$RUNTIME_DIR/release-manifest.json"
install -o node -g node -m 0444 "$SIGNATURE_FILE" "$RUNTIME_DIR/release-manifest.sig"
chown node:node "$RUNTIME_DIR"
chmod 0700 "$RUNTIME_DIR"

export PGHOST=${PGHOST:-db} PGPORT=${PGPORT:-5432}
export PGSSL_MODE=verify-full PGSSL_CA_FILE="$RUNTIME_DIR/ca.crt"
export NODE_EXTRA_CA_CERTS="$RUNTIME_DIR/ca.crt"
export AUDIT_RELEASE_MANIFEST_PUBLIC_KEY
export AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS AUDIT_TECHNICAL_AUTH_ALLOWED_KIDS
export EVALUATION_PROVIDER=${EVALUATION_PROVIDER:-openai}
export OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.4-mini}
export AUDIT_MANIFEST_FILE="$RUNTIME_DIR/release-manifest.json"
export AUDIT_MANIFEST_SIGNATURE_FILE="$RUNTIME_DIR/release-manifest.sig"

if [ "$(id -u)" -eq 0 ]; then
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
