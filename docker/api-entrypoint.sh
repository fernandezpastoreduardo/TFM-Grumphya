#!/bin/sh
set -eu
SECRETS_DIR=${GRUMPHYA_SECRETS_DIR:-/run/secrets}

load_api_settings() {
  settings_file="$1"
  shift
  while IFS= read -r settings_line || [ -n "$settings_line" ]; do
    case "$settings_line" in
      ''|\#*) continue ;;
      *=*) ;;
      *) continue ;;
    esac

    setting_name=${settings_line%%=*}
    setting_value=${settings_line#*=}
    for allowed_setting in "$@"; do
      if [ "$setting_name" = "$allowed_setting" ]; then
        export "$setting_name=$setting_value"
        break
      fi
    done
  done < "$settings_file"
}

require_secret() {
  if [ ! -r "$SECRETS_DIR/$1" ]; then
    echo "Required secret '$1' is missing or unreadable in $SECRETS_DIR." >&2
    exit 1
  fi
}

if [ "${REQUIRE_PRODUCTION_SECRETS:-false}" = "true" ]; then
  require_secret grumphya_env
  require_secret database_settings
  require_secret openai_settings
  require_secret openai_key
  require_secret mail_settings
fi

if [ -r "$SECRETS_DIR/grumphya_env" ]; then
  load_api_settings "$SECRETS_DIR/grumphya_env" \
    ACCESS_TOKEN_SECRET ANONYMOUS_IP_HMAC_SECRET
  if [ ! -r "$SECRETS_DIR/database_settings" ]; then
    load_api_settings "$SECRETS_DIR/grumphya_env" PGDATABASE PGUSER GRUMPHYA_DB_PASSWORD
  fi
fi
if [ -r "$SECRETS_DIR/database_settings" ]; then
  load_api_settings "$SECRETS_DIR/database_settings" \
    PGDATABASE PGUSER GRUMPHYA_DB_PASSWORD
fi
if [ -r "$SECRETS_DIR/openai_settings" ]; then
  load_api_settings "$SECRETS_DIR/openai_settings" \
    EVALUATION_PROVIDER OPENAI_MODEL OPENAI_REASONING_EFFORT EVALUATION_TIMEOUT_MS
fi
if [ -r "$SECRETS_DIR/openai_key" ]; then
  load_api_settings "$SECRETS_DIR/openai_key" OPENAI_API_KEY
fi
if [ -r "$SECRETS_DIR/mail_settings" ]; then
  load_api_settings "$SECRETS_DIR/mail_settings" MAIL_SMTP_HOST MAIL_SMTP_PORT MAIL_USERNAME MAIL_PASSWORD MAIL_FROM_ADDRESS
fi

if [ "${REQUIRE_PRODUCTION_SECRETS:-false}" = "true" ]; then
  for required_setting in ACCESS_TOKEN_SECRET ANONYMOUS_IP_HMAC_SECRET PGDATABASE PGUSER GRUMPHYA_DB_PASSWORD OPENAI_API_KEY EVALUATION_PROVIDER MAIL_SMTP_HOST MAIL_SMTP_PORT MAIL_USERNAME MAIL_PASSWORD MAIL_FROM_ADDRESS; do
    eval "setting_value=\${$required_setting-}"
    if [ -z "$setting_value" ]; then
      echo "Required setting '$required_setting' is missing from its production secret file." >&2
      exit 1
    fi
  done
fi

export API_HOST=0.0.0.0
export API_PORT=3000
export PGHOST=db
export PGPORT=5432
export PGSSL_MODE=${PGSSL_MODE:-verify-full}
export WEB_ORIGIN=${WEB_ORIGIN:-http://127.0.0.1:5173}
export PGPASSWORD="$GRUMPHYA_DB_PASSWORD"
unset GRUMPHYA_DB_PASSWORD

if [ "$(id -u)" -eq 0 ]; then
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
