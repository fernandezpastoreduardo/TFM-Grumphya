#!/bin/sh
set -eu
SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}

DATABASE_SETTINGS_FILE="$SECRETS_DIR/database_settings"
if [ ! -r "$DATABASE_SETTINGS_FILE" ]; then
  echo "Required database secret 'database_settings' is missing or unreadable in $SECRETS_DIR." >&2
  exit 1
fi
ADMIN_SETTINGS_FILE="$SECRETS_DIR/postgres_admin_settings"
if [ ! -r "$ADMIN_SETTINGS_FILE" ]; then
  echo "Required database secret 'postgres_admin_settings' is missing or unreadable in $SECRETS_DIR." >&2
  exit 1
fi
TLS_CERT_FILE="$SECRETS_DIR/postgres_tls.crt"
TLS_KEY_FILE="$SECRETS_DIR/postgres_tls.key"
if [ ! -r "$TLS_CERT_FILE" ] || [ ! -r "$TLS_KEY_FILE" ]; then
  echo "Required PostgreSQL TLS certificate and key are missing or unreadable in $SECRETS_DIR." >&2
  exit 1
fi

while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    PGDATABASE=*) PGDATABASE=${settings_line#*=} ;;
    PGUSER=*) PGUSER=${settings_line#*=} ;;
    GRUMPHYA_DB_PASSWORD=*) APP_PG_PASSWORD=${settings_line#*=} ;;
  esac
done < "$DATABASE_SETTINGS_FILE"

while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    POSTGRES_ADMIN_PASSWORD=*) POSTGRES_PASSWORD=${settings_line#*=} ;;
  esac
done < "$ADMIN_SETTINGS_FILE"

if [ -z "${PGDATABASE:-}" ] || [ -z "${PGUSER:-}" ] || [ -z "${APP_PG_PASSWORD:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "Required PostgreSQL database or administrator settings are missing." >&2
  exit 1
fi
if [ "$PGUSER" = postgres ] || [ "$PGDATABASE" = postgres ]; then
  echo "PGUSER and PGDATABASE must not use the PostgreSQL bootstrap account or database." >&2
  exit 1
fi

POSTGRES_USER=postgres
POSTGRES_DB=$PGDATABASE
APP_PGUSER=$PGUSER
APP_PGDATABASE=$PGDATABASE
export POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD APP_PGUSER APP_PGDATABASE APP_PG_PASSWORD
POSTGRES_TLS_DIRECTORY=${GRUMPHYA_POSTGRES_TLS_DIRECTORY:-/run/postgresql/grumphya-tls}
if [ "$(id -u)" -eq 0 ]; then
  install -d -o postgres -g postgres -m 0700 "$POSTGRES_TLS_DIRECTORY"
  install -o postgres -g postgres -m 0644 "$TLS_CERT_FILE" "$POSTGRES_TLS_DIRECTORY/server.crt"
  install -o postgres -g postgres -m 0600 "$TLS_KEY_FILE" "$POSTGRES_TLS_DIRECTORY/server.key"
else
  install -d -m 0700 "$POSTGRES_TLS_DIRECTORY"
  install -m 0644 "$TLS_CERT_FILE" "$POSTGRES_TLS_DIRECTORY/server.crt"
  install -m 0600 "$TLS_KEY_FILE" "$POSTGRES_TLS_DIRECTORY/server.key"
fi
exec docker-entrypoint.sh "$@"
