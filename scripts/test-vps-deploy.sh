#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
readonly DEPLOY_HELPER="$SCRIPT_DIR/../docker/vps-deploy.sh"
readonly OLD_SHA=1111111111111111111111111111111111111111
readonly NEW_SHA=2222222222222222222222222222222222222222
readonly THIRD_SHA=3333333333333333333333333333333333333333
readonly SYSTEM_HEAD=$(command -v head)
readonly SYSTEM_STAT=$(command -v stat)
readonly FOURTH_SHA=4444444444444444444444444444444444444444
readonly INTERNAL_TLS_SECRETS=(
  internal_tls_ca.crt
  api_tls.crt api_tls.key
  web_tls.crt web_tls.key
  postgres_tls.crt postgres_tls.key
)

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_eq() {
  [[ $1 == "$2" ]] || fail "$3 (expected '$2', got '$1')"
}

assert_contains() {
  grep -Fq -- "$2" "$1" || fail "expected '$2' in $1"
}

new_fixture() {
  TEST_ROOT=$(mktemp -d)
  TEST_BIN="$TEST_ROOT/bin"
  mkdir -p "$TEST_BIN" "$TEST_ROOT/.secrets" "$TEST_ROOT/state" "$TEST_ROOT/releases"
  printf 'DOMAIN=example.invalid\n' > "$TEST_ROOT/.env.production"
  chmod 600 "$TEST_ROOT/.env.production"
  for secret in \
    admin_settings audit_writer_settings database_settings grumphya_env mail_settings openai_key \
    openai_settings postgres_admin_settings "${INTERNAL_TLS_SECRETS[@]}"; do
    printf 'TEST_SECRET=placeholder\n' > "$TEST_ROOT/.secrets/$secret"
    chmod 600 "$TEST_ROOT/.secrets/$secret"
  done
  chmod 700 "$TEST_ROOT/.secrets"
  export TEST_ROOT TEST_BIN
  export SYSTEM_STAT
  export DOCKER_LOG="$TEST_ROOT/docker.log"
  export HEAD_LOG="$TEST_ROOT/head.log"
  export DOCKER_STORAGE="$TEST_ROOT/docker-storage"
  mkdir -p "$DOCKER_STORAGE"
  cat > "$TEST_BIN/docker" <<'DOCKER_STUB'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [[ $1 == compose && ${2:-} == version ]]; then
  echo 'Docker Compose version v2.test'
  exit 0
fi
if [[ $1 == info && ${2:-} == --format ]]; then
  printf '%s\n' "$DOCKER_STORAGE"
  exit 0
fi
if [[ $1 == info ]]; then exit 0; fi
if [[ $1 == load ]]; then exit 0; fi
if [[ $1 == exec ]]; then exit 0; fi
if [[ $1 == volume && ${2:-} == inspect ]]; then exit 0; fi
if [[ $1 == run ]]; then
  if [[ " $* " == *" --entrypoint node "* ]]; then
    [[ ${TEST_AUDIT_KEY_MATCH:-0} == 1 ]]
    exit
  fi
  [[ ${TEST_PG19_READY:-0} == 1 ]]
  exit
fi
if [[ $1 == image && ${2:-} == inspect ]]; then
  if [[ ${3:-} == --format ]]; then
    printf 'sha256:fake-id\n'
  fi
  exit 0
fi
if [[ $1 == image && ${2:-} == tag ]]; then exit 0; fi
if [[ $1 == image && ${2:-} == rm ]]; then exit 0; fi
if [[ $1 == save ]]; then
  while (($#)); do
    if [[ $1 == --output ]]; then
      shift
      printf 'fake docker archive\n' > "$1"
      exit 0
    fi
    shift
  done
fi
if [[ $1 == ps ]]; then
  service=''
  while (($#)); do
    case $1 in
      *com.docker.compose.service=*) service=${1##*=} ;;
    esac
    shift
  done
  printf 'container-%s\n' "$service"
  exit 0
fi
if [[ $1 == inspect ]]; then
  case ${2:-} in
    --format)
      case ${3:-} in
        '{{.State.Status}}') echo running ;;
        '{{.State.Health.Status}}') echo healthy ;;
        '{{.Image}}') echo sha256:fake-id ;;
        '{{.Id}}') echo sha256:fake-id ;;
      esac
      exit 0
      ;;
  esac
fi
if [[ $1 == network && ${2:-} == inspect ]]; then
  [[ -n ${MOCK_INGRESS_INTERNAL:-} ]] || exit 1
  printf '%s\n' "$MOCK_INGRESS_INTERNAL"
  exit 0
fi
if [[ $1 == compose ]]; then
  file=''
  action=''
  previous=''
  while (($#)); do
    case $1 in
      --file) shift; [[ -n $file ]] || file=${1:-} ;;
      config|up|run|stop) action=$1 ;;
    esac
    shift
  done
  if [[ $action == config && ${FAIL_CONFIG_SHA:-} && $file == *"/$FAIL_CONFIG_SHA/"* ]]; then
    exit 2
  fi
  if [[ $action == up && ${FAIL_UP_SHA:-} && $file == *"/$FAIL_UP_SHA/"* ]]; then
    exit 42
  fi
  if [[ $action == run && ${FAIL_AI_SMOKE_SHA:-} && $file == *"/$FAIL_AI_SMOKE_SHA/"* ]]; then
    exit 43
  fi
  exit 0
fi
exit 0
DOCKER_STUB
  chmod +x "$TEST_BIN/docker"
  cat > "$TEST_BIN/head" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >> "\$HEAD_LOG"
exec "$SYSTEM_HEAD" "\$@"
EOF
  chmod +x "$TEST_BIN/head"
  cat > "$TEST_BIN/stat" <<'STAT_STUB'
#!/usr/bin/env bash
set -Eeuo pipefail
if "$SYSTEM_STAT" -c '%a' "${3:-}" >/dev/null 2>&1; then
  exec "$SYSTEM_STAT" "$@"
fi
if [[ ${1:-} == -c && ${2:-} == %a ]]; then
  exec "$SYSTEM_STAT" -f '%Lp' "$3"
fi
if [[ ${1:-} == -c && ${2:-} == %u ]]; then
  exec "$SYSTEM_STAT" -f '%u' "$3"
fi
exec "$SYSTEM_STAT" "$@"
STAT_STUB
  chmod +x "$TEST_BIN/stat"
  cat > "$TEST_BIN/flock" <<'FLOCK_STUB'
#!/usr/bin/env bash
exit 0
FLOCK_STUB
  chmod +x "$TEST_BIN/flock"
  cat > "$TEST_BIN/mv" <<'MV_STUB'
#!/usr/bin/env bash
set -Eeuo pipefail
destination=''
for argument in "$@"; do destination=$argument; done
if [[ ${FAIL_CURRENT_STATE_MOVE_ONCE:-0} == 1 && "$destination" == "$TEST_ROOT/state/current" && ! -e $TEST_ROOT/failed-current-move ]]; then
  : > "$TEST_ROOT/failed-current-move"
  exit 1
fi
exec /bin/mv "$@"
MV_STUB
  chmod +x "$TEST_BIN/mv"
  export PATH="$TEST_BIN:$PATH"
  export GRUMPHYA_ROOT="$TEST_ROOT"
  export GRUMPHYA_DEPLOY_HELPER_PATH="$TEST_ROOT/usr/local/sbin/grumphya-deploy"
  export GRUMPHYA_TESTING=1
  unset FAIL_UP_SHA FAIL_CONFIG_SHA FAIL_AI_SMOKE_SHA FAIL_CURRENT_STATE_MOVE_ONCE MOCK_INGRESS_INTERNAL BUNDLE_POSTGRES_MAJOR TEST_PG19_READY || true
}

cleanup_fixture() {
  rm -rf -- "$TEST_ROOT"
}

seed_release() {
  local sha=$1 dir="$TEST_ROOT/releases/$1"
  mkdir -p "$dir/docker" "$dir/migrations"
  printf 'example.invalid {\n}\n' > "$dir/docker/Caddyfile"
  cp "$DEPLOY_HELPER" "$dir/docker/vps-deploy.sh"
  printf 'services: {}\n' > "$dir/compose.production.yaml"
  printf 'CREATE TABLE baseline(id integer);\n' > "$dir/migrations/001_baseline.sql"
  : > "$dir/images.tar"
  cat > "$dir/release.env" <<EOF
API_IMAGE=grumphya-api:$sha
WEB_IMAGE=grumphya-web:$sha
DATABASE_IMAGE=grumphya-database:$sha
PROXY_IMAGE=grumphya-proxy:$sha
DEPLOY_SHA=$sha
POSTGRES_MAJOR=17
POSTGRES_DATA_MOUNT=/var/lib/postgresql/data
POSTGRES_DATA_DIRECTORY=/var/lib/postgresql/data
POSTGRES_VOLUME=grumphya-production-postgres
EOF
  ln -s "$TEST_ROOT/.secrets" "$dir/.secrets"
  chmod -R u+rwX "$dir"
  printf '%s\n' "$sha" > "$TEST_ROOT/state/current"
  : > "$TEST_ROOT/state/previous"
}

make_bundle() {
  local sha=$1 migration_content=$2 migration_name=${3:-002_candidate.sql}
  local postgres_major=${BUNDLE_POSTGRES_MAJOR:-17}
  local postgres_data_mount=/var/lib/postgresql/data
  local postgres_data_directory=/var/lib/postgresql/data
  local postgres_volume=grumphya-production-postgres
  if [[ $postgres_major == 19 ]]; then
    postgres_data_mount=/var/lib/postgresql
    postgres_data_directory=/var/lib/postgresql/19/docker
    postgres_volume=grumphya-production-postgres-pg19
  fi
  local dir="$TEST_ROOT/payload"
  rm -rf -- "$dir"
  mkdir -p "$dir/docker" "$dir/migrations"
  printf 'example.invalid {\n}\n' > "$dir/docker/Caddyfile"
  cp "$DEPLOY_HELPER" "$dir/docker/vps-deploy.sh"
  printf 'services: {}\n' > "$dir/compose.production.yaml"
  printf 'CREATE TABLE baseline(id integer);\n' > "$dir/migrations/001_baseline.sql"
  if [[ -n $migration_content ]]; then
    printf '%s\n' "$migration_content" > "$dir/migrations/$migration_name"
  fi
  : > "$dir/images.tar"
  cat > "$dir/release.env" <<EOF
API_IMAGE=grumphya-api:$sha
WEB_IMAGE=grumphya-web:$sha
DATABASE_IMAGE=grumphya-database:$sha
PROXY_IMAGE=grumphya-proxy:$sha
DEPLOY_SHA=$sha
POSTGRES_MAJOR=$postgres_major
POSTGRES_DATA_MOUNT=$postgres_data_mount
POSTGRES_DATA_DIRECTORY=$postgres_data_directory
POSTGRES_VOLUME=$postgres_volume
EOF
  tar -C "$dir" -czf "$TEST_ROOT/bundle.tar.gz" .
  BUNDLE_BYTES=$(wc -c < "$TEST_ROOT/bundle.tar.gz" | tr -d '[:space:]')
  BUNDLE_HASH=$(sha256sum "$TEST_ROOT/bundle.tar.gz" | awk '{print $1}')
}

run_deploy() {
  local sha=$1
  SSH_ORIGINAL_COMMAND="deploy $sha $BUNDLE_BYTES $BUNDLE_HASH" \
    "$DEPLOY_HELPER" gateway < "$TEST_ROOT/bundle.tar.gz"
}

run_deploy_with_declared_bytes() {
  local sha=$1 declared_bytes=$2
  SSH_ORIGINAL_COMMAND="deploy $sha $declared_bytes $BUNDLE_HASH" \
    "$DEPLOY_HELPER" gateway < "$TEST_ROOT/bundle.tar.gz"
}

test_deploy_ok() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  run_deploy "$NEW_SHA" >/dev/null || fail 'deploy success scenario failed'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'current state after deploy'
  assert_eq "$(cat "$TEST_ROOT/state/previous")" "$OLD_SHA" 'previous state after deploy'
  assert_contains "$DOCKER_LOG" '--no-build --wait'
  if grep -Fq 'additional-sites.compose.yaml' "$DOCKER_LOG"; then
    fail 'default deployment loaded optional Caddy sites'
  fi
  if grep -Fq 'network inspect' "$DOCKER_LOG"; then
    fail 'default deployment depended on the external ingress network'
  fi
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$NEW_SHA/compose.production.yaml run --rm --no-deps -T api sh /workspace/docker/api-entrypoint.sh node apps/api/dist/infrastructure/ai/production-ai-smoke.js"
  assert_contains "$DOCKER_LOG" "image inspect grumphya-api:$NEW_SHA"
  assert_contains "$DOCKER_LOG" "image inspect grumphya-api:$OLD_SHA"
  cmp -s "$DEPLOY_HELPER" "$GRUMPHYA_DEPLOY_HELPER_PATH" || fail 'successful deploy did not update the persistent helper'
  [[ -x $GRUMPHYA_DEPLOY_HELPER_PATH ]] || fail 'updated helper is not executable'
  if grep -Fq "image rm grumphya-api:$OLD_SHA" "$DOCKER_LOG"; then
    fail 'successful deploy removed the last-known-good API image tag'
  fi
  if grep -Eq '(^| )down( |$)|-v|--volumes|volume prune' "$DOCKER_LOG"; then
    fail 'deploy used a volume-destructive command'
  fi
  cleanup_fixture
}

test_pg19_release_requires_verified_versioned_volume() {
  new_fixture
  seed_release "$OLD_SHA"
  export BUNDLE_POSTGRES_MAJOR=19
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'PostgreSQL 19 release deployed without a verified restored volume'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after missing PostgreSQL 19 restore marker'
  if grep -Fq -- "--file $TEST_ROOT/releases/$NEW_SHA/compose.production.yaml up" "$DOCKER_LOG"; then
    fail 'PostgreSQL 19 release started before the restored volume was verified'
  fi

  export TEST_PG19_READY=1
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  run_deploy "$NEW_SHA" >/dev/null || fail 'verified PostgreSQL 19 volume did not deploy'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'current state after verified PostgreSQL 19 deployment'
  cleanup_fixture
}

test_optional_caddy_sites_survive_new_release() {
  new_fixture
  seed_release "$OLD_SHA"
  mkdir -p "$TEST_ROOT/integrations/sites"
  cp "$SCRIPT_DIR/../docker/additional-sites.compose.yaml.example" \
    "$TEST_ROOT/integrations/compose.yaml"
  cp "$SCRIPT_DIR/../docker/additional-sites/desarrolloseguro.caddy.example" \
    "$TEST_ROOT/integrations/sites/desarrolloseguro.caddy"
  export MOCK_INGRESS_INTERNAL=true
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  run_deploy "$NEW_SHA" >/dev/null || fail 'optional Caddy sites deployment failed'
  assert_contains "$DOCKER_LOG" 'network inspect --format {{.Internal}} development-security-ingress'
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$NEW_SHA/compose.production.yaml --file $TEST_ROOT/integrations/compose.yaml up -d --no-build --wait"
  [[ -f $TEST_ROOT/integrations/sites/desarrolloseguro.caddy ]] ||
    fail 'the stable Caddy site was removed with the old release'
  cleanup_fixture
}

test_missing_ingress_keeps_default_deployment() {
  new_fixture
  seed_release "$OLD_SHA"
  mkdir -p "$TEST_ROOT/integrations/sites"
  cp "$SCRIPT_DIR/../docker/additional-sites.compose.yaml.example" \
    "$TEST_ROOT/integrations/compose.yaml"
  cp "$SCRIPT_DIR/../docker/additional-sites/desarrolloseguro.caddy.example" \
    "$TEST_ROOT/integrations/sites/desarrolloseguro.caddy"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  run_deploy "$NEW_SHA" >/dev/null 2>&1 || fail 'missing ingress blocked Grumphya deployment'
  if grep -Fq -- "--file $TEST_ROOT/integrations/compose.yaml" "$DOCKER_LOG"; then
    fail 'missing ingress still loaded the optional Compose file'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'release state without ingress'
  cleanup_fixture
}

test_failed_ai_smoke_restores_previous() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  export FAIL_AI_SMOKE_SHA=$NEW_SHA
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'failed production AI smoke scenario unexpectedly succeeded'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after failed AI smoke'
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$OLD_SHA/compose.production.yaml up -d --no-build --wait"
  [[ ! -e $TEST_ROOT/state/deploying ]] || fail 'AI smoke rollback did not clear the deployment journal'
  [[ ! -e $TEST_ROOT/releases/$NEW_SHA ]] || fail 'failed AI smoke release was retained'
  if grep -Eq '(^| )down( |$)|-v|--volumes|volume prune' "$DOCKER_LOG"; then
    fail 'AI smoke rollback used a volume-destructive command'
  fi
  cleanup_fixture
}

test_all_time_ranking_migration_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" "$(<"$SCRIPT_DIR/../apps/api/migrations/032_worst_ideas_all_time_ranking.sql")"
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the all-time ranking migration was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'current state after compatible aggregate migration'
  cleanup_fixture
}

test_ai_cached_input_migration_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" \
    "$(<"$SCRIPT_DIR/../apps/api/migrations/035_admin_ai_cached_input_tokens.sql")" \
    '035_admin_ai_cached_input_tokens.sql'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the AI cached-input migration was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after compatible AI cached-input migration'
  cleanup_fixture
}

test_approved_illuminado_repricing_migration_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" "$(<"$SCRIPT_DIR/../apps/api/migrations/034_illuminado_price_retroactive.sql")" \
    '034_illuminado_price_retroactive.sql'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the explicitly approved Illuminado price backfill was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'current state after Illuminado price backfill'
  cleanup_fixture
}

test_application_error_context_redaction_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
-- deployment-data-rewrite: redact-application-error-context
UPDATE application_error_events SET context_json = NULL WHERE context_json IS NOT NULL;' \
    '036_redact_application_error_context.sql'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the approved application error context redaction was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after application error context redaction'
  cleanup_fixture
}

test_application_error_context_redaction_rejects_extra_destructive_sql() {
  new_fixture
  seed_release "$OLD_SHA"
  local migration_content
  migration_content='-- deployment-rollback-compatible: true
-- deployment-data-rewrite: redact-application-error-context
UPDATE application_error_events SET context_json = NULL WHERE context_json IS NOT NULL;'
  make_bundle "$NEW_SHA" "$migration_content
DROP TABLE users;" '036_redact_application_error_context.sql'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'the application error context allowlist accepted extra destructive SQL'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after rejected application error redaction SQL'
  cleanup_fixture
}

test_audit_contract_migration_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" "$(<"$SCRIPT_DIR/../apps/api/migrations/040_audit_contract_beta_d02.sql")" \
    '040_audit_contract_beta_d02.sql'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the audit contract constraint replacement was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after compatible audit contract migration'
  cleanup_fixture
}

test_audit_contract_migration_rejects_extra_destructive_sql() {
  new_fixture
  seed_release "$OLD_SHA"
  local migration_content
  migration_content=$(<"$SCRIPT_DIR/../apps/api/migrations/040_audit_contract_beta_d02.sql")
  make_bundle "$NEW_SHA" "$migration_content
DROP TABLE users;" '040_audit_contract_beta_d02.sql'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'the audit contract allowlist accepted extra destructive SQL'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after rejected audit contract migration'
  cleanup_fixture
}

test_audit_writer_migration_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" "$(<"$SCRIPT_DIR/../apps/api/migrations/041_audit_writer_upsert.sql")" \
    '041_audit_writer_upsert.sql'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the audit writer migration was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after compatible audit writer migration'
  cleanup_fixture
}

test_audit_writer_migration_rejects_extra_destructive_sql() {
  new_fixture
  seed_release "$OLD_SHA"
  local migration_content
  migration_content=$(<"$SCRIPT_DIR/../apps/api/migrations/041_audit_writer_upsert.sql")
  make_bundle "$NEW_SHA" "$migration_content
DROP TABLE users;" '041_audit_writer_upsert.sql'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'the audit writer allowlist accepted extra destructive SQL'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after rejected audit writer SQL'
  cleanup_fixture
}

test_audit_evidence_shape_migration_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" "$(<"$SCRIPT_DIR/../apps/api/migrations/042_audit_evidence_shape.sql")" \
    '042_audit_evidence_shape.sql'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'the audit evidence shape migration was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after compatible audit evidence shape migration'
  cleanup_fixture
}

test_audit_evidence_shape_migration_rejects_extra_destructive_sql() {
  new_fixture
  seed_release "$OLD_SHA"
  local migration_content
  migration_content=$(<"$SCRIPT_DIR/../apps/api/migrations/042_audit_evidence_shape.sql")
  make_bundle "$NEW_SHA" "$migration_content
DROP TABLE users;" '042_audit_evidence_shape.sql'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'the audit evidence shape allowlist accepted extra destructive SQL'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after rejected audit evidence shape SQL'
  cleanup_fixture
}

test_illuminado_repricing_migration_rejects_extra_destructive_sql() {
  new_fixture
  seed_release "$OLD_SHA"
  local migration_content
  migration_content=$(<"$SCRIPT_DIR/../apps/api/migrations/034_illuminado_price_retroactive.sql")
  make_bundle "$NEW_SHA" "$migration_content
DROP TABLE users;" '034_illuminado_price_retroactive.sql'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'the Illuminado pricing allowlist accepted extra destructive SQL'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after rejected repricing SQL'
  cleanup_fixture
}

test_illuminado_repricing_allowlist_requires_exact_migration_name() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" "$(<"$SCRIPT_DIR/../apps/api/migrations/034_illuminado_price_retroactive.sql")" \
    '035_illuminado_price_retroactive.sql'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'the Illuminado repricing exception was accepted under a different migration name'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after renamed repricing migration'
  cleanup_fixture
}

test_failed_compose_restores_previous() {
  new_fixture
  seed_release "$OLD_SHA"
  printf '%s\n' "$THIRD_SHA" > "$TEST_ROOT/state/previous"
  seed_release "$THIRD_SHA"
  printf '%s\n' "$OLD_SHA" > "$TEST_ROOT/state/current"
  printf '%s\n' "$THIRD_SHA" > "$TEST_ROOT/state/previous"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  export FAIL_UP_SHA=$NEW_SHA
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'failed compose scenario unexpectedly succeeded'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after failed deploy'
  assert_eq "$(cat "$TEST_ROOT/state/previous")" "$THIRD_SHA" 'previous state after failed deploy'
  [[ -d $TEST_ROOT/releases/$OLD_SHA ]] || fail 'rollback target release was removed'
  [[ -d $TEST_ROOT/releases/$THIRD_SHA ]] || fail 'previous release was removed during rollback'
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$OLD_SHA/compose.production.yaml up -d --no-build --wait"
  assert_contains "$DOCKER_LOG" "image inspect grumphya-database:$OLD_SHA"
  [[ ! -e $TEST_ROOT/releases/$NEW_SHA ]] || fail 'failed release directory was retained after rollback'
  if grep -Fq "image rm grumphya-api:$OLD_SHA" "$DOCKER_LOG"; then
    fail 'failed deploy removed the last-known-good API image tag'
  fi
  if grep -Eq '(^| )down( |$)|-v|--volumes|volume prune' "$DOCKER_LOG"; then
    fail 'rollback used a volume-destructive command'
  fi
  cleanup_fixture
}

test_bundle_digest_mismatch_is_rejected_before_image_load() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  printf 'X' | dd of="$TEST_ROOT/bundle.tar.gz" bs=1 seek=0 conv=notrunc status=none
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'bundle with a mismatched SHA-256 unexpectedly deployed'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after bundle digest mismatch'
  if grep -Fq 'load --input' "$DOCKER_LOG"; then
    fail 'image loading began before the bundle digest was verified'
  fi
  if grep -Fq ' compose ' "$DOCKER_LOG"; then
    fail 'Compose was invoked for a bundle with a mismatched digest'
  fi
  cleanup_fixture
}

test_release_retention_keeps_current_and_previous_only() {
  new_fixture
  seed_release "$OLD_SHA"
  seed_release "$THIRD_SHA"
  seed_release "$FOURTH_SHA"
  printf '%s\n' "$OLD_SHA" > "$TEST_ROOT/state/current"
  printf '%s\n' "$THIRD_SHA" > "$TEST_ROOT/state/previous"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'

  run_deploy "$NEW_SHA" >/dev/null || fail 'release-retention scenario failed'

  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'current release after retention'
  assert_eq "$(cat "$TEST_ROOT/state/previous")" "$OLD_SHA" 'previous release after retention'
  [[ -d $TEST_ROOT/releases/$NEW_SHA ]] || fail 'new current release was pruned'
  [[ -d $TEST_ROOT/releases/$OLD_SHA ]] || fail 'last-known-good release was pruned'
  [[ ! -e $TEST_ROOT/releases/$THIRD_SHA ]] || fail 'older previous release was retained'
  [[ ! -e $TEST_ROOT/releases/$FOURTH_SHA ]] || fail 'stale release was retained'
  assert_contains "$DOCKER_LOG" "image rm grumphya-api:$THIRD_SHA"
  assert_contains "$DOCKER_LOG" "image rm grumphya-api:$FOURTH_SHA"
  if grep -Fq "image rm grumphya-api:$OLD_SHA" "$DOCKER_LOG"; then
    fail 'release pruning removed the rollback target image'
  fi
  cleanup_fixture
}

test_failed_state_commit_after_compose_restores_previous() {
  new_fixture
  seed_release "$OLD_SHA"
  printf '%s\n' "$THIRD_SHA" > "$TEST_ROOT/state/previous"
  seed_release "$THIRD_SHA"
  printf '%s\n' "$OLD_SHA" > "$TEST_ROOT/state/current"
  printf '%s\n' "$THIRD_SHA" > "$TEST_ROOT/state/previous"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  export FAIL_CURRENT_STATE_MOVE_ONCE=1
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'state commit failure unexpectedly succeeded'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after state-commit failure'
  assert_eq "$(cat "$TEST_ROOT/state/previous")" "$THIRD_SHA" 'previous state after state-commit failure'
  [[ ! -e $TEST_ROOT/state/deploying ]] || fail 'deployment journal was not cleared after rollback'
  assert_contains "$DOCKER_LOG" "/releases/$NEW_SHA/compose.production.yaml"
  assert_contains "$DOCKER_LOG" "/releases/$OLD_SHA/compose.production.yaml"
  [[ ! -e $TEST_ROOT/releases/$NEW_SHA ]] || fail 'failed release directory was retained after state recovery'
  cleanup_fixture
}

test_missing_marker_is_blocked() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" 'ALTER TABLE baseline ADD COLUMN note text;'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'migration without marker was accepted'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after blocked migration'
  cleanup_fixture
}

test_oversized_bundle_is_bounded_by_preflight_size() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  if run_deploy_with_declared_bytes "$NEW_SHA" 1 >/dev/null 2>&1; then
    fail 'bundle larger than its declared preflight size was accepted'
  fi
  assert_contains "$HEAD_LOG" '-c 2'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after oversized bundle'
  [[ ! -e $TEST_ROOT/releases/$NEW_SHA ]] || fail 'oversized bundle created a release directory'
  cleanup_fixture
}

test_all_internal_tls_secrets_are_required() {
  new_fixture
  local secret
  for secret in "${INTERNAL_TLS_SECRETS[@]}"; do
    rm -f -- "$TEST_ROOT/.secrets/$secret"
    if "$DEPLOY_HELPER" preflight "$OLD_SHA" 1 >/dev/null 2>&1; then
      fail "preflight accepted a missing TLS secret: $secret"
    fi
    printf 'TEST_SECRET=placeholder\n' > "$TEST_ROOT/.secrets/$secret"
    chmod 600 "$TEST_ROOT/.secrets/$secret"
  done
  cleanup_fixture
}

test_internal_tls_secrets_reject_symlinks_and_broad_permissions() {
  new_fixture
  local secret="$TEST_ROOT/.secrets/internal_tls_ca.crt"
  mv "$secret" "$TEST_ROOT/real-internal-tls-ca.crt"
  ln -s "$TEST_ROOT/real-internal-tls-ca.crt" "$secret"
  if "$DEPLOY_HELPER" preflight "$OLD_SHA" 1 >/dev/null 2>&1; then
    fail 'preflight accepted a symlinked TLS certificate'
  fi
  rm "$secret"
  cp "$TEST_ROOT/real-internal-tls-ca.crt" "$secret"
  chmod 600 "$secret"

  chmod 644 "$TEST_ROOT/.secrets/api_tls.key"
  if "$DEPLOY_HELPER" preflight "$OLD_SHA" 1 >/dev/null 2>&1; then
    fail 'preflight accepted a TLS private key readable by other users'
  fi
  chmod 600 "$TEST_ROOT/.secrets/api_tls.key"

  chmod 755 "$TEST_ROOT/.secrets"
  if "$DEPLOY_HELPER" preflight "$OLD_SHA" 1 >/dev/null 2>&1; then
    fail 'preflight accepted a TLS secrets directory accessible to other users'
  fi
  chmod 700 "$TEST_ROOT/.secrets"

  local ca_private_key="$TEST_ROOT/.secrets/internal_tls_ca.key"
  printf 'offline-ca-private-key\n' > "$ca_private_key"
  chmod 600 "$ca_private_key"
  if "$DEPLOY_HELPER" preflight "$OLD_SHA" 1 >/dev/null 2>&1; then
    fail 'preflight accepted an online internal CA private key'
  fi
  rm -f -- "$ca_private_key"
  ln -s "$TEST_ROOT/real-internal-tls-ca.crt" "$ca_private_key"
  if "$DEPLOY_HELPER" preflight "$OLD_SHA" 1 >/dev/null 2>&1; then
    fail 'preflight accepted an internal CA private key symlink'
  fi
  cleanup_fixture
}

test_destructive_migration_is_blocked() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
DELETE FROM baseline;'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'destructive migration was accepted'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after destructive migration'
  cleanup_fixture
}

test_lowercase_destructive_migration_is_blocked() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
delete from baseline;'
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'lowercase destructive migration was accepted'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after lowercase destructive migration'
  cleanup_fixture
}

test_changed_old_migration_is_blocked() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  sed -i.bak 's/CREATE TABLE/CREATE TEMP TABLE/' "$TEST_ROOT/payload/migrations/001_baseline.sql"
  tar -C "$TEST_ROOT/payload" -czf "$TEST_ROOT/bundle.tar.gz" .
  BUNDLE_BYTES=$(wc -c < "$TEST_ROOT/bundle.tar.gz" | tr -d '[:space:]')
  BUNDLE_HASH=$(sha256sum "$TEST_ROOT/bundle.tar.gz" | awk '{print $1}')
  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'modified existing migration was accepted'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after modified migration'
  cleanup_fixture
}

test_bootstrap_snapshots_running_images_without_recreating() {
  new_fixture
  mkdir -p "$TEST_ROOT/docker" "$TEST_ROOT/apps/api/migrations"
  printf 'services: {}\n' > "$TEST_ROOT/compose.production.yaml"
  printf 'example.invalid {\n}\n' > "$TEST_ROOT/docker/Caddyfile"
  printf 'CREATE TABLE baseline(id integer);\n' > "$TEST_ROOT/apps/api/migrations/001_baseline.sql"
  "$DEPLOY_HELPER" bootstrap "$OLD_SHA" >/dev/null || fail 'bootstrap scenario failed'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after bootstrap'
  [[ -s $TEST_ROOT/releases/$OLD_SHA/images.tar ]] || fail 'bootstrap did not save the running images'
  assert_contains "$DOCKER_LOG" 'image tag sha256:fake-id grumphya-api:'
  assert_contains "$DOCKER_LOG" 'exec --env NODE_EXTRA_CA_CERTS=/run/secrets/internal_tls_ca.crt container-api node -e fetch("https://127.0.0.1:3000/api/health")'
  if grep -Eq ' compose .* up | compose .* stop |(^| )down( |$)|-v|--volumes|volume prune' "$DOCKER_LOG"; then
    fail 'bootstrap attempted to recreate services or touch volumes'
  fi
  cleanup_fixture
}

test_gateway_accepts_only_allowlisted_commands() {
  new_fixture
  local status_output injection_file="$TEST_ROOT/injected"
  status_output=$(SSH_ORIGINAL_COMMAND=status "$DEPLOY_HELPER" gateway)
  assert_eq "$status_output" none 'gateway status command'
  status_output=$(SSH_ORIGINAL_COMMAND=helper-version "$DEPLOY_HELPER" gateway)
  assert_eq "$status_output" 6 'gateway helper version command'
  for command in \
    'status extra' \
    'rollback --volumes' \
    'helper-version extra' \
    "status; touch $injection_file" \
    'deploy 2222222222222222222222222222222222222222 1 0000000000000000000000000000000000000000000000000000000000000000 extra'; do
    if SSH_ORIGINAL_COMMAND="$command" "$DEPLOY_HELPER" gateway >/dev/null 2>&1; then
      fail "gateway accepted an invalid command: $command"
    fi
  done
  [[ ! -e $injection_file ]] || fail 'gateway executed shell text from SSH_ORIGINAL_COMMAND'
  cleanup_fixture
}

test_audit_signing_key_is_verified_and_provisioned_privately() {
  new_fixture
  local public_key_escaped
  node --input-type=module - "$TEST_ROOT" <<'NODE'
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
const root = process.argv[2];
const pair = generateKeyPairSync("ed25519");
writeFileSync(`${root}/audit-private.pem`, pair.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
writeFileSync(`${root}/audit-public.pem`, pair.publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
const wrong = generateKeyPairSync("ed25519");
writeFileSync(`${root}/wrong-private.pem`, wrong.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
NODE
  public_key_escaped=$(awk 'BEGIN { ORS="" } { printf "%s\\n", $0 }' "$TEST_ROOT/audit-public.pem")
  cat > "$TEST_ROOT/.secrets/grumphya_env" <<EOF
AUDIT_ENABLED=true
AUDIT_RELEASE_MANIFEST_PUBLIC_KEY=$public_key_escaped
EOF
  seed_release "$OLD_SHA"

  if ! TEST_AUDIT_KEY_MATCH=1 GRUMPHYA_TESTING=1 GRUMPHYA_ROOT="$TEST_ROOT" GRUMPHYA_DEPLOY_HELPER_PATH="$TEST_ROOT/usr/local/sbin/grumphya-deploy" \
    PATH="$TEST_BIN:$PATH" SSH_ORIGINAL_COMMAND=provision-audit-signing-key \
    "$DEPLOY_HELPER" gateway < "$TEST_ROOT/audit-private.pem" > "$TEST_ROOT/provision.out" 2> "$TEST_ROOT/provision.err"; then
    fail 'the matching audit signing key was not provisioned'
  fi
  [[ -f $TEST_ROOT/.secrets/audit_release_signing_key ]] || fail 'the audit signing key was not installed'
  assert_eq "$(stat -c '%a' "$TEST_ROOT/.secrets/audit_release_signing_key")" 600 'audit signing key mode'
  assert_contains "$TEST_ROOT/.env.production" "AUDIT_RELEASE_SIGNING_KEY_FILE=$TEST_ROOT/.secrets/audit_release_signing_key"
  assert_contains "$DOCKER_LOG" 'up -d --no-build --no-deps --force-recreate --wait api'
  assert_contains "$DOCKER_LOG" 'run --rm --network none --user 0:0'
  if grep -Fq 'PRIVATE KEY' "$TEST_ROOT/provision.out" "$TEST_ROOT/provision.err" "$DOCKER_LOG"; then
    fail 'audit signing key material appeared in command output or Docker logs'
  fi

  if TEST_AUDIT_KEY_MATCH=0 GRUMPHYA_TESTING=1 GRUMPHYA_ROOT="$TEST_ROOT" GRUMPHYA_DEPLOY_HELPER_PATH="$TEST_ROOT/usr/local/sbin/grumphya-deploy" \
    PATH="$TEST_BIN:$PATH" SSH_ORIGINAL_COMMAND=provision-audit-signing-key \
    "$DEPLOY_HELPER" gateway < "$TEST_ROOT/wrong-private.pem" > /dev/null 2>&1; then
    fail 'an audit signing key that did not match the release public key was accepted'
  fi
  cleanup_fixture
}

for test_case in \
  test_deploy_ok \
  test_pg19_release_requires_verified_versioned_volume \
  test_optional_caddy_sites_survive_new_release \
  test_missing_ingress_keeps_default_deployment \
  test_all_time_ranking_migration_is_rollback_compatible \
  test_ai_cached_input_migration_is_rollback_compatible \
  test_approved_illuminado_repricing_migration_is_rollback_compatible \
  test_application_error_context_redaction_is_rollback_compatible \
  test_application_error_context_redaction_rejects_extra_destructive_sql \
  test_audit_contract_migration_is_rollback_compatible \
  test_audit_contract_migration_rejects_extra_destructive_sql \
  test_audit_writer_migration_is_rollback_compatible \
  test_audit_writer_migration_rejects_extra_destructive_sql \
  test_audit_evidence_shape_migration_is_rollback_compatible \
  test_audit_evidence_shape_migration_rejects_extra_destructive_sql \
  test_illuminado_repricing_migration_rejects_extra_destructive_sql \
  test_illuminado_repricing_allowlist_requires_exact_migration_name \
  test_failed_compose_restores_previous \
  test_failed_ai_smoke_restores_previous \
  test_bundle_digest_mismatch_is_rejected_before_image_load \
  test_release_retention_keeps_current_and_previous_only \
  test_failed_state_commit_after_compose_restores_previous \
  test_missing_marker_is_blocked \
  test_oversized_bundle_is_bounded_by_preflight_size \
  test_all_internal_tls_secrets_are_required \
  test_internal_tls_secrets_reject_symlinks_and_broad_permissions \
  test_destructive_migration_is_blocked \
  test_lowercase_destructive_migration_is_blocked \
  test_changed_old_migration_is_blocked \
  test_bootstrap_snapshots_running_images_without_recreating \
  test_audit_signing_key_is_verified_and_provisioned_privately \
  test_gateway_accepts_only_allowlisted_commands; do
  "$test_case"
  printf 'PASS %s\n' "$test_case"
done

printf 'All VPS deployment helper scenarios passed.\n'
