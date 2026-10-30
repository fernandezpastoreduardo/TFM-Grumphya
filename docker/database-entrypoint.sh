#!/bin/sh
set -eu
SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}
SETTINGS_FILE="$SECRETS_DIR/database_settings"

if [ ! -r "$SETTINGS_FILE" ]; then
  echo "Required secret 'database_settings' is missing or unreadable in $SECRETS_DIR." >&2
  exit 1
fi

while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    PGDATABASE=*) PGDATABASE=${settings_line#*=} ;;
    PGUSER=*) PGUSER=${settings_line#*=} ;;
    GRUMPHYA_DB_PASSWORD=*) PGPASSWORD=${settings_line#*=} ;;
  esac
done < "$SETTINGS_FILE"

if [ -z "${PGDATABASE:-}" ] || [ -z "${PGUSER:-}" ] || [ -z "${PGPASSWORD:-}" ]; then
  echo "database_settings must define PGDATABASE, PGUSER, and GRUMPHYA_DB_PASSWORD." >&2
  exit 1
fi

export PGDATABASE PGUSER PGPASSWORD
export PGHOST=${PGHOST:-db} PGPORT=${PGPORT:-5432}
export NODE_ENV=${NODE_ENV:-production}
export PGSSL_MODE=${PGSSL_MODE:-verify-full}
if [ "$NODE_ENV" = production ]; then
  CA_FILE="$SECRETS_DIR/internal_tls_ca.crt"
  if [ ! -r "$CA_FILE" ]; then
    echo "Required secret 'internal_tls_ca.crt' is missing or unreadable in $SECRETS_DIR." >&2
    exit 1
  fi
  if [ "$(id -u)" -eq 0 ]; then
    TLS_RUNTIME_DIR=$(mktemp -d /tmp/grumphya-database-tls.XXXXXX)
    chown node:node "$TLS_RUNTIME_DIR"
    chmod 0700 "$TLS_RUNTIME_DIR"
    install -o node -g node -m 0444 "$CA_FILE" "$TLS_RUNTIME_DIR/ca.crt"
    CA_FILE="$TLS_RUNTIME_DIR/ca.crt"
  fi
  export PGSSL_CA_FILE=${PGSSL_CA_FILE:-$CA_FILE}
fi
if [ "$(id -u)" -eq 0 ]; then
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
