#!/bin/sh
set -eu

SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}
SETTINGS_FILE="$SECRETS_DIR/database_settings"
if [ ! -r "$SETTINGS_FILE" ]; then
  echo "Required database secret 'database_settings' is missing or unreadable in $SECRETS_DIR." >&2
  exit 1
fi

while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    PGDATABASE=*) APP_DATABASE=${settings_line#*=} ;;
    PGUSER=*) APP_USER=${settings_line#*=} ;;
  esac
done < "$SETTINGS_FILE"

if [ -z "${APP_DATABASE:-}" ] || [ -z "${APP_USER:-}" ]; then
  echo "database_settings must define PGDATABASE and PGUSER." >&2
  exit 1
fi
if [ "$APP_USER" = postgres ] || [ "$APP_DATABASE" = postgres ]; then
  echo "PGUSER and PGDATABASE must not use the PostgreSQL bootstrap account or database." >&2
  exit 1
fi

case "${1:-}" in
  dump)
    exec pg_dump --username postgres --dbname "$APP_DATABASE"
    ;;
  restore)
    dropdb --if-exists --username postgres "$APP_DATABASE"
    createdb --username postgres --owner "$APP_USER" "$APP_DATABASE"
    exec psql --set ON_ERROR_STOP=1 --username postgres --dbname "$APP_DATABASE"
    ;;
  *)
    echo "Usage: grumphya-postgres-backup.sh dump|restore" >&2
    exit 2
    ;;
esac
