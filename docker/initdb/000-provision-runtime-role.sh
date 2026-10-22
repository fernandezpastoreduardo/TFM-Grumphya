#!/bin/sh
set -eu

SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}
APP_DATABASE=${APP_PGDATABASE:-}
APP_USER=${APP_PGUSER:-}
APP_PASSWORD=${APP_PG_PASSWORD:-}
if [ -z "$APP_DATABASE" ] || [ -z "$APP_USER" ] || [ -z "$APP_PASSWORD" ]; then
  SETTINGS_FILE="$SECRETS_DIR/database_settings"
  if [ ! -r "$SETTINGS_FILE" ]; then
    echo "Required database secret 'database_settings' is missing or unreadable in $SECRETS_DIR." >&2
    exit 1
  fi
  while IFS= read -r settings_line || [ -n "$settings_line" ]; do
    case "$settings_line" in
      PGDATABASE=*) APP_DATABASE=${settings_line#*=} ;;
      PGUSER=*) APP_USER=${settings_line#*=} ;;
      GRUMPHYA_DB_PASSWORD=*) APP_PASSWORD=${settings_line#*=} ;;
    esac
  done < "$SETTINGS_FILE"
fi

if [ -z "${APP_DATABASE:-}" ] || [ -z "${APP_USER:-}" ] || [ -z "${APP_PASSWORD:-}" ]; then
  echo "database_settings must define PGDATABASE, PGUSER, and GRUMPHYA_DB_PASSWORD." >&2
  exit 1
fi
if [ "$APP_USER" = postgres ] || [ "$APP_DATABASE" = postgres ]; then
  echo "PGUSER and PGDATABASE must not use the PostgreSQL bootstrap account or database." >&2
  exit 1
fi

escape_identifier() {
  printf '%s' "$1" | sed 's/"/""/g'
}

escape_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

escaped_user=$(escape_identifier "$APP_USER")
escaped_database=$(escape_identifier "$APP_DATABASE")
escaped_password=$(escape_literal "$APP_PASSWORD")

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE "$escaped_user" LOGIN PASSWORD '$escaped_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER DATABASE "$escaped_database" OWNER TO "$escaped_user";
SQL

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$APP_DATABASE" \
  --command 'CREATE EXTENSION IF NOT EXISTS vector;'
