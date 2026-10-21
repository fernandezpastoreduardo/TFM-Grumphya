#!/bin/sh
set -eu
SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}
ADMIN_SETTINGS="$SECRETS_DIR/admin_settings"
if [ ! -r "$ADMIN_SETTINGS" ]; then
  echo "Required secret 'admin_settings' is missing or unreadable in $SECRETS_DIR." >&2
  exit 1
fi
while IFS= read -r settings_line || [ -n "$settings_line" ]; do
  case "$settings_line" in
    ADMIN_PASSWORD=*) ADMIN_PASSWORD=${settings_line#*=} ;;
  esac
done < "$ADMIN_SETTINGS"
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "admin_settings must define ADMIN_PASSWORD." >&2
  exit 1
fi
export ADMIN_PASSWORD
exec sh /workspace/docker/database-entrypoint.sh node apps/api/dist/admin-dashboard/provision-admin.js "$@"
