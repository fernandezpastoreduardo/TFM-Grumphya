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

load_api_settings "$SECRETS_DIR/grumphya_env" \
  ACCESS_TOKEN_SECRET ANONYMOUS_IP_HMAC_SECRET PGDATABASE PGUSER \
  GRUMPHYA_DB_PASSWORD PGPASSWORD
load_api_settings "$SECRETS_DIR/openai_settings" \
  EVALUATION_PROVIDER OPENAI_MODEL OPENAI_REASONING_EFFORT EVALUATION_TIMEOUT_MS
load_api_settings "$SECRETS_DIR/openai_key" OPENAI_API_KEY

export API_HOST=0.0.0.0
export API_PORT=3000
export PGHOST=db
export PGPORT=5432
export WEB_ORIGIN=http://127.0.0.1:5173
export PGPASSWORD="$GRUMPHYA_DB_PASSWORD"
unset GRUMPHYA_DB_PASSWORD

exec "$@"
