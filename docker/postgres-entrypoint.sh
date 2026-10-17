#!/bin/sh
set -eu
SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}

while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    PGDATABASE=*) POSTGRES_DB=${settings_line#*=} ;;
    PGUSER=*) POSTGRES_USER=${settings_line#*=} ;;
    GRUMPHYA_DB_PASSWORD=*) POSTGRES_PASSWORD=${settings_line#*=} ;;
  esac
done < "$SECRETS_DIR/grumphya_env"

if [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "Required PostgreSQL settings are missing." >&2
  exit 1
fi

export POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
exec docker-entrypoint.sh postgres
