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
readonly DEVELOPMENT_SECURITY_SECRETS=(
  development_security_admin_password
  development_security_admin_url
  development_security_migrator_password
  development_security_api_database_url
  development_security_database_tls.crt
  development_security_database_tls.key
  development_security_api_tls.crt
  development_security_api_tls.key
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
    admin_settings database_settings grumphya_env mail_settings openai_key \
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
if [[ $1 == compose ]]; then
  file=''
  action=''
  service=''
  previous=''
  while (($#)); do
    case $1 in
      --file) shift; file=${1:-} ;;
      config|up|run|stop) action=$1 ;;
      api) service=$1 ;;
    esac
    shift
  done
  if [[ $action == config && ${FAIL_CONFIG_SHA:-} && $file == *"/$FAIL_CONFIG_SHA/"* ]]; then
    exit 2
  fi
  if [[ $action == up && ${FAIL_UP_SHA:-} && $file == *"/$FAIL_UP_SHA/"* ]]; then
    exit 42
  fi
  if [[ $action == run && $service == api && ${FAIL_AI_SMOKE_SHA:-} && $file == *"/$FAIL_AI_SMOKE_SHA/"* ]]; then
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
if [[ ${FAIL_BASELINE_STATE_MOVE_ONCE:-0} == 1 && "$destination" == "$TEST_ROOT/state/development_security_migration_baseline" && ! -e $TEST_ROOT/failed-baseline-move ]]; then
  : > "$TEST_ROOT/failed-baseline-move"
  exit 1
fi
exec /bin/mv "$@"
MV_STUB
  chmod +x "$TEST_BIN/mv"
  export PATH="$TEST_BIN:$PATH"
  export GRUMPHYA_ROOT="$TEST_ROOT"
  export GRUMPHYA_DEPLOY_HELPER_PATH="$TEST_ROOT/usr/local/sbin/grumphya-deploy"
  export GRUMPHYA_TESTING=1
  unset FAIL_UP_SHA FAIL_CONFIG_SHA FAIL_AI_SMOKE_SHA FAIL_CURRENT_STATE_MOVE_ONCE || true
  unset FAIL_BASELINE_STATE_MOVE_ONCE || true
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
EOF
  ln -s "$TEST_ROOT/.secrets" "$dir/.secrets"
  chmod -R u+rwX "$dir"
  printf '%s\n' "$sha" > "$TEST_ROOT/state/current"
  : > "$TEST_ROOT/state/previous"
}

make_bundle() {
  local sha=$1 migration_content=$2 migration_name=${3:-002_candidate.sql}
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
EOF
  refresh_bundle
}

refresh_bundle() {
  local dir="$TEST_ROOT/payload"
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

enable_development_security_bundle() {
  local dir=$1 sha=$2
  mkdir -p "$dir/development-security-migrations"
  if ! compgen -G "$dir/development-security-migrations/*.sql" >/dev/null; then
    cat > "$dir/development-security-migrations/001_baseline.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_test_baseline (id integer PRIMARY KEY);
SQL
  fi
  printf 'services:\n  development-security-api: {}\n  development-security-database: {}\n' > \
    "$dir/compose.development-security.production.yaml"
  cat >> "$dir/release.env" <<EOF
DEVELOPMENT_SECURITY_ENABLED=1
DEVELOPMENT_SECURITY_IMAGE=development-security-api:$sha
DEVELOPMENT_SECURITY_DATABASE_IMAGE=development-security-database:$sha
EOF
}

install_development_security_secrets() {
  local secret
  for secret in "${DEVELOPMENT_SECURITY_SECRETS[@]}"; do
    printf 'TEST_SECRET=placeholder\n' > "$TEST_ROOT/.secrets/$secret"
    chmod 600 "$TEST_ROOT/.secrets/$secret"
  done
}

test_base_release_does_not_require_development_security_secrets() {
  new_fixture
  seed_release "$OLD_SHA"
  "$DEPLOY_HELPER" preflight "$NEW_SHA" 1 >/dev/null ||
    fail 'base release preflight incorrectly required Development Security secrets'
  cleanup_fixture
}

test_current_development_security_release_requires_all_secrets() {
  new_fixture
  seed_release "$OLD_SHA"
  enable_development_security_bundle "$TEST_ROOT/releases/$OLD_SHA" "$OLD_SHA"
  if "$DEPLOY_HELPER" preflight "$NEW_SHA" 1 >/dev/null 2>&1; then
    fail 'preflight accepted an enabled Development Security release without its secrets'
  fi
  install_development_security_secrets
  "$DEPLOY_HELPER" preflight "$NEW_SHA" 1 >/dev/null ||
    fail 'preflight rejected an enabled Development Security release with all secrets'
  cleanup_fixture
}

test_development_security_candidate_requires_all_secrets_before_image_load() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  tar -C "$TEST_ROOT/payload" -czf "$TEST_ROOT/bundle.tar.gz" .
  BUNDLE_BYTES=$(wc -c < "$TEST_ROOT/bundle.tar.gz" | tr -d '[:space:]')
  BUNDLE_HASH=$(sha256sum "$TEST_ROOT/bundle.tar.gz" | awk '{print $1}')

  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'Development Security candidate without its secrets unexpectedly deployed'
  fi
  if grep -Fq 'load --input' "$DOCKER_LOG"; then
    fail 'Development Security images loaded before candidate secret validation'
  fi
  cleanup_fixture
}

test_development_security_release_loads_overlay_and_images() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  tar -C "$TEST_ROOT/payload" -czf "$TEST_ROOT/bundle.tar.gz" .
  BUNDLE_BYTES=$(wc -c < "$TEST_ROOT/bundle.tar.gz" | tr -d '[:space:]')
  BUNDLE_HASH=$(sha256sum "$TEST_ROOT/bundle.tar.gz" | awk '{print $1}')
  install_development_security_secrets

  run_deploy "$NEW_SHA" >/dev/null || fail 'Development Security release scenario failed'

  assert_contains "$DOCKER_LOG" "image inspect development-security-api:$NEW_SHA"
  assert_contains "$DOCKER_LOG" "image inspect development-security-database:$NEW_SHA"
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$NEW_SHA/compose.development-security.production.yaml"
  cleanup_fixture
}

test_first_development_security_enable_allows_baseline_migrations() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  cat > "$TEST_ROOT/payload/development-security-migrations/002_jobs.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_scan_jobs (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle
  install_development_security_secrets

  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'first Development Security enable rejected additive baseline migrations'

  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after first Development Security enable'
  cleanup_fixture
}

test_development_security_update_preserves_migrations_byte_for_byte() {
  new_fixture
  seed_release "$OLD_SHA"
  mkdir -p "$TEST_ROOT/releases/$OLD_SHA/development-security-migrations"
  cat > "$TEST_ROOT/releases/$OLD_SHA/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/releases/$OLD_SHA" "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cp "$TEST_ROOT/releases/$OLD_SHA/development-security-migrations/001_domains.sql" \
    "$TEST_ROOT/payload/development-security-migrations/001_domains.sql"
  cat > "$TEST_ROOT/payload/development-security-migrations/002_ds_index.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE INDEX ds_domains_created_idx ON ds_domains (id);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle
  install_development_security_secrets

  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'Development Security update rejected compatible migrations'

  cmp -s "$TEST_ROOT/releases/$OLD_SHA/development-security-migrations/001_domains.sql" \
    "$TEST_ROOT/releases/$NEW_SHA/development-security-migrations/001_domains.sql" ||
    fail 'Development Security update changed an existing migration'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after Development Security update'
  cleanup_fixture
}

test_development_security_reenable_preserves_all_prior_migrations() {
  local history_change
  for history_change in altered removed; do
    new_fixture
    seed_release "$OLD_SHA"

    make_bundle "$NEW_SHA" ''
    mkdir -p "$TEST_ROOT/payload/development-security-migrations"
    cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
    enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
    refresh_bundle
    install_development_security_secrets
    run_deploy "$NEW_SHA" >/dev/null || fail 'initial Development Security release failed'

    make_bundle "$THIRD_SHA" ''
    run_deploy "$THIRD_SHA" >/dev/null || fail 'base release after Development Security failed'

    make_bundle "$FOURTH_SHA" ''
    mkdir -p "$TEST_ROOT/payload/development-security-migrations"
    if [[ $history_change == altered ]]; then
      cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY, created_at timestamptz NOT NULL);
SQL
    fi
    enable_development_security_bundle "$TEST_ROOT/payload" "$FOURTH_SHA"
    refresh_bundle
    install_development_security_secrets

    if run_deploy "$FOURTH_SHA" >/dev/null 2>&1; then
      fail "re-enabled Development Security release accepted $history_change prior migration history"
    fi
    assert_eq "$(cat "$TEST_ROOT/state/current")" "$THIRD_SHA" \
      "current state after re-enable with $history_change migration history"
    cleanup_fixture
  done
}

test_new_migration_without_rollback_marker_is_rejected() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  printf 'CREATE TABLE unreviewed_table (id integer);\n' > \
    "$TEST_ROOT/payload/development-security-migrations/001_unreviewed.sql"
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle

  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'new migration without rollback compatibility marker was accepted'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after migration without rollback marker'
  cleanup_fixture
}

test_rollback_marker_does_not_allow_destructive_migrations() {
  local migration_sql
  for migration_sql in \
    'DROP TABLE baseline;' \
    'drop table baseline;' \
    'DROP /*x*/ TABLE baseline;' \
    'DROP OWNED BY ds_api;' \
    'TRUNCATE TABLE baseline;' \
    'Truncate table baseline;' \
    'DELETE FROM baseline;' \
    'delete FROM baseline;' \
    'DELETE /*x*/ FROM baseline;' \
    'UPDATE baseline SET note = NULL;' \
    'Update baseline SET note = NULL;' \
    'UPDATE ONLY baseline SET note = NULL;' \
    'UPDATE public . ds_domains SET hostname = hostname;'; do
    new_fixture
    seed_release "$OLD_SHA"
    make_bundle "$NEW_SHA" ''
    mkdir -p "$TEST_ROOT/payload/development-security-migrations"
    printf '%s\n%s\n' '-- deployment-rollback-compatible: true' "$migration_sql" > \
      "$TEST_ROOT/payload/development-security-migrations/001_destructive.sql"
    enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
    refresh_bundle

    if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
      fail "rollback marker allowed destructive migration: $migration_sql"
    fi
    assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
      "current state after destructive migration: $migration_sql"
    cleanup_fixture
  done
}

test_idempotent_drop_trigger_is_rollback_compatible() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle
  install_development_security_secrets
  run_deploy "$NEW_SHA" >/dev/null || fail 'baseline Development Security release failed'

  make_bundle "$THIRD_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cp "$TEST_ROOT/releases/$NEW_SHA/development-security-migrations/001_domains.sql" \
    "$TEST_ROOT/payload/development-security-migrations/001_domains.sql"
  cat > "$TEST_ROOT/payload/development-security-migrations/002_drop_trigger.sql" <<'SQL'
-- deployment-rollback-compatible: true
DROP TRIGGER IF EXISTS ds_test_trigger ON ds_domains;
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$THIRD_SHA"
  refresh_bundle

  run_deploy "$THIRD_SHA" >/dev/null ||
    fail 'idempotent DROP TRIGGER was incorrectly rejected'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$THIRD_SHA" \
    'current state after idempotent trigger removal'
  cleanup_fixture
}

test_drop_trigger_without_if_exists_is_rejected() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle
  install_development_security_secrets
  run_deploy "$NEW_SHA" >/dev/null || fail 'baseline Development Security release failed'

  make_bundle "$THIRD_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cp "$TEST_ROOT/releases/$NEW_SHA/development-security-migrations/001_domains.sql" \
    "$TEST_ROOT/payload/development-security-migrations/001_domains.sql"
  cat > "$TEST_ROOT/payload/development-security-migrations/002_drop_trigger.sql" <<'SQL'
-- deployment-rollback-compatible: true
DROP TRIGGER ds_test_trigger ON ds_domains;
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$THIRD_SHA"
  refresh_bundle

  if run_deploy "$THIRD_SHA" >/dev/null 2>&1; then
    fail 'non-idempotent DROP TRIGGER was incorrectly accepted'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after non-idempotent trigger removal'
  cleanup_fixture
}

test_retry_reuses_persisted_migration_baseline() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle
  install_development_security_secrets
  export FAIL_AI_SMOKE_SHA=$NEW_SHA

  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'failed AI smoke unexpectedly committed the Development Security release'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after failed Development Security smoke'
  assert_eq "$(cat "$TEST_ROOT/state/development_security_migration_baseline")" "$NEW_SHA" \
    'persistent migration baseline after the migration completed'

  unset FAIL_AI_SMOKE_SHA
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle

  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'retry with the already persisted migration baseline failed'
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" \
    'current state after retry with the persisted migration baseline'
  cleanup_fixture
}

test_pending_baseline_blocks_destructive_migration_after_interrupted_finalization() {
  new_fixture
  seed_release "$OLD_SHA"
  make_bundle "$NEW_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cat > "$TEST_ROOT/payload/development-security-migrations/001_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
CREATE TABLE ds_domains (id uuid PRIMARY KEY);
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$NEW_SHA"
  refresh_bundle
  install_development_security_secrets
  export FAIL_BASELINE_STATE_MOVE_ONCE=1

  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'baseline finalization failure unexpectedly committed the release'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after interrupted migration baseline finalization'
  assert_eq "$(cat "$TEST_ROOT/state/development_security_migration_pending")" "$NEW_SHA" \
    'pending baseline after interrupted finalization'
  [[ -d "$TEST_ROOT/state/development-security-migrations-$NEW_SHA" ]] ||
    fail 'candidate migrations were not snapshotted before execution'
  unset FAIL_BASELINE_STATE_MOVE_ONCE

  make_bundle "$THIRD_SHA" ''
  mkdir -p "$TEST_ROOT/payload/development-security-migrations"
  cp "$TEST_ROOT/state/development-security-migrations-$NEW_SHA/001_domains.sql" \
    "$TEST_ROOT/payload/development-security-migrations/001_domains.sql"
  cat > "$TEST_ROOT/payload/development-security-migrations/002_drop_domains.sql" <<'SQL'
-- deployment-rollback-compatible: true
DROP TABLE ds_domains;
SQL
  enable_development_security_bundle "$TEST_ROOT/payload" "$THIRD_SHA"
  refresh_bundle

  if run_deploy "$THIRD_SHA" >/dev/null 2>&1; then
    fail 'pending baseline allowed a destructive migration after interrupted finalization'
  fi
  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" \
    'current state after pending baseline compatibility rejection'
  cleanup_fixture
}

test_disabling_development_security_removes_only_its_containers() {
  new_fixture
  seed_release "$OLD_SHA"
  enable_development_security_bundle "$TEST_ROOT/releases/$OLD_SHA" "$OLD_SHA"
  install_development_security_secrets
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  run_deploy "$NEW_SHA" >/dev/null ||
    fail 'base release failed while disabling Development Security'

  assert_eq "$(cat "$TEST_ROOT/state/current")" "$NEW_SHA" 'current state after opting out'
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$OLD_SHA/compose.development-security.production.yaml rm --stop --force development-security-api development-security-database development-security-migrate"
  if grep -Eq '(^| )down( |$)|--volumes|volume prune| rm .* -v' "$DOCKER_LOG"; then
    fail 'opting out of Development Security removed persistent volumes'
  fi
  cleanup_fixture
}

test_failed_opt_out_keeps_development_security_active() {
  new_fixture
  seed_release "$OLD_SHA"
  enable_development_security_bundle "$TEST_ROOT/releases/$OLD_SHA" "$OLD_SHA"
  install_development_security_secrets
  make_bundle "$NEW_SHA" '-- deployment-rollback-compatible: true
ALTER TABLE baseline ADD COLUMN note text;'
  export FAIL_UP_SHA=$NEW_SHA

  if run_deploy "$NEW_SHA" >/dev/null 2>&1; then
    fail 'failed base release unexpectedly disabled Development Security'
  fi

  assert_eq "$(cat "$TEST_ROOT/state/current")" "$OLD_SHA" 'current state after failed opt-out'
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$OLD_SHA/compose.development-security.production.yaml up -d --no-build --wait"
  if grep -Fq ' rm --stop --force development-security-api' "$DOCKER_LOG"; then
    fail 'failed opt-out removed the active Development Security containers'
  fi
  cleanup_fixture
}

test_rollback_from_development_security_removes_only_its_services() {
  new_fixture
  seed_release "$OLD_SHA"
  seed_release "$NEW_SHA"
  enable_development_security_bundle "$TEST_ROOT/releases/$NEW_SHA" "$NEW_SHA"
  printf '%s\n' "$OLD_SHA" > "$TEST_ROOT/state/previous"
  printf '%s\n' "$NEW_SHA" > "$TEST_ROOT/state/current"
  install_development_security_secrets

  "$DEPLOY_HELPER" rollback >/dev/null || fail 'rollback from Development Security release failed'

  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$NEW_SHA/compose.development-security.production.yaml rm --stop --force development-security-api development-security-database development-security-migrate"
  assert_contains "$DOCKER_LOG" "--file $TEST_ROOT/releases/$OLD_SHA/compose.production.yaml up -d --no-build --wait"
  if grep -Eq '(^| )down( |$)|--volumes|volume prune| rm .* -v' "$DOCKER_LOG"; then
    fail 'Development Security rollback used a volume-destructive command'
  fi
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
  assert_eq "$status_output" 3 'gateway helper version command'
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

for test_case in \
  test_deploy_ok \
  test_base_release_does_not_require_development_security_secrets \
  test_current_development_security_release_requires_all_secrets \
  test_development_security_candidate_requires_all_secrets_before_image_load \
  test_development_security_release_loads_overlay_and_images \
  test_first_development_security_enable_allows_baseline_migrations \
  test_development_security_update_preserves_migrations_byte_for_byte \
  test_development_security_reenable_preserves_all_prior_migrations \
  test_new_migration_without_rollback_marker_is_rejected \
  test_rollback_marker_does_not_allow_destructive_migrations \
  test_idempotent_drop_trigger_is_rollback_compatible \
  test_drop_trigger_without_if_exists_is_rejected \
  test_retry_reuses_persisted_migration_baseline \
  test_pending_baseline_blocks_destructive_migration_after_interrupted_finalization \
  test_disabling_development_security_removes_only_its_containers \
  test_failed_opt_out_keeps_development_security_active \
  test_rollback_from_development_security_removes_only_its_services \
  test_all_time_ranking_migration_is_rollback_compatible \
  test_ai_cached_input_migration_is_rollback_compatible \
  test_approved_illuminado_repricing_migration_is_rollback_compatible \
  test_application_error_context_redaction_is_rollback_compatible \
  test_application_error_context_redaction_rejects_extra_destructive_sql \
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
  test_changed_old_migration_is_blocked \
  test_bootstrap_snapshots_running_images_without_recreating \
  test_gateway_accepts_only_allowlisted_commands; do
  "$test_case"
  printf 'PASS %s\n' "$test_case"
done

printf 'All VPS deployment helper scenarios passed.\n'
