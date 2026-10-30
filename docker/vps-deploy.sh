#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly EXPECTED_SECRETS=(
  admin_settings
  database_settings
  grumphya_env
  mail_settings
  openai_key
  openai_settings
  postgres_admin_settings
)
readonly IMAGE_NAMES=(api web database proxy)
readonly SHA_PATTERN='^[0-9a-f]{40}$'
readonly HELPER_VERSION=2
readonly DEFAULT_ROOT=/opt/grumphya
readonly MIN_FREE_BYTES_DEFAULT=536870912

if [[ ${GRUMPHYA_TESTING:-0} == 1 ]]; then
  ROOT=${GRUMPHYA_ROOT:-$DEFAULT_ROOT}
  DEPLOY_HELPER_PATH=${GRUMPHYA_DEPLOY_HELPER_PATH:-"$ROOT/usr/local/sbin/grumphya-deploy"}
else
  ROOT=$DEFAULT_ROOT
  DEPLOY_HELPER_PATH=/usr/local/sbin/grumphya-deploy
fi
STATE_DIR="$ROOT/state"
RELEASES_DIR="$ROOT/releases"
SECRETS_DIR="$ROOT/.secrets"
ENV_FILE="$ROOT/.env.production"
LOCK_FD=9
DEPLOY_TEMP_DIR=''
ROLLOUT_IN_PROGRESS=0

die() {
  printf 'grumphya-deploy: %s\n' "$1" >&2
  exit 1
}

log() {
  printf 'grumphya-deploy: %s\n' "$1" >&2
}

require_sha() {
  [[ ${1:-} =~ $SHA_PATTERN ]] || die 'invalid deployment SHA'
}

parse_bytes() {
  local value=${1:-}
  [[ $value =~ ^[1-9][0-9]{0,9}$ ]] || die 'invalid bundle size'
  printf '%s' "$((10#$value))"
}

require_root() {
  if [[ ${GRUMPHYA_TESTING:-0} != 1 && $EUID -ne 0 ]]; then
    die 'must run as root through the restricted deployment gateway'
  fi
}

ensure_layout() {
  mkdir -p "$STATE_DIR" "$RELEASES_DIR" "$ROOT/incoming"
  chmod 700 "$STATE_DIR" "$RELEASES_DIR" "$ROOT/incoming"
  exec 9>"$STATE_DIR/deploy.lock"
  flock -x "$LOCK_FD"
}

read_state() {
  local name=$1 value=''
  local file="$STATE_DIR/$name"
  [[ -f $file ]] || return 0
  IFS= read -r value < "$file" || true
  if [[ -n $value ]]; then
    require_sha "$value"
  fi
  printf '%s' "$value"
}

write_state() {
  local name=$1 value=$2 tmp="$STATE_DIR/.$1.$$"
  if [[ -n $value ]]; then
    require_sha "$value"
    printf '%s\n' "$value" > "$tmp"
  else
    : > "$tmp"
  fi
  chmod 600 "$tmp"
  mv -f "$tmp" "$STATE_DIR/$name" || {
    rm -f -- "$tmp"
    return 1
  }
}

release_is_complete() {
  local sha=$1 dir="$RELEASES_DIR/$1"
  [[ -d $dir && -f $dir/compose.production.yaml && -f $dir/release.env && \
    -f $dir/images.tar && -d $dir/docker && -f $dir/docker/Caddyfile && \
    -d $dir/migrations && -L $dir/.secrets && -e $dir/.secrets ]] || return 1
  [[ $(read_release_sha "$dir/release.env") == "$sha" ]]
}

read_release_sha() {
  local env_file=$1 line key value found=''
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line == *=* ]] || continue
    key=${line%%=*}
    value=${line#*=}
    if [[ $key == DEPLOY_SHA ]]; then
      [[ -z $found ]] || return 1
      found=$value
    fi
  done < "$env_file"
  printf '%s' "$found"
}

check_secrets() {
  local secret
  [[ -d $SECRETS_DIR && ! -L $SECRETS_DIR ]] || die 'VPS secrets directory is missing or invalid'
  [[ -r $ENV_FILE && -f $ENV_FILE && ! -L $ENV_FILE ]] || die 'VPS production environment file is missing or invalid'
  for secret in "${EXPECTED_SECRETS[@]}"; do
    [[ -r $SECRETS_DIR/$secret && -f $SECRETS_DIR/$secret && ! -L $SECRETS_DIR/$secret ]] ||
      die 'a required VPS secret file is missing or invalid'
  done
  if [[ ${GRUMPHYA_TESTING:-0} != 1 ]]; then
    local mode
    mode=$(stat -c '%a' "$SECRETS_DIR") || die 'cannot inspect VPS secrets permissions'
    [[ $(stat -c '%u' "$SECRETS_DIR") == 0 ]] || die 'VPS secrets must be owned by root'
    (( (8#$mode & 077) == 0 )) || die 'VPS secrets directory permissions are too broad'
    for secret in "${EXPECTED_SECRETS[@]}" "$ENV_FILE"; do
      if [[ $secret == /* ]]; then
        mode=$(stat -c '%a' "$secret") || die 'cannot inspect VPS secret permissions'
        [[ $(stat -c '%u' "$secret") == 0 ]] || die 'VPS secrets must be owned by root'
      else
        mode=$(stat -c '%a' "$SECRETS_DIR/$secret") || die 'cannot inspect VPS secret permissions'
        [[ $(stat -c '%u' "$SECRETS_DIR/$secret") == 0 ]] || die 'VPS secrets must be owned by root'
      fi
      (( (8#$mode & 077) == 0 )) || die 'VPS secret file permissions are too broad'
    done
  fi
}

check_tools() {
  local tool
  for tool in docker flock tar sha256sum df awk wc head mktemp mv cp rm find sort grep stat tr; do
    command -v "$tool" >/dev/null 2>&1 || die "required command is unavailable: $tool"
  done
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is unavailable'
  docker info >/dev/null 2>&1 || die 'Docker daemon is unavailable'
}

check_current_release() {
  local current
  current=$(read_state current)
  if [[ -n $current ]]; then
    release_is_complete "$current" || die 'current release state is incomplete; refusing deployment'
    compose_for "$RELEASES_DIR/$current" config --quiet >/dev/null ||
      die 'current production Compose configuration is invalid'
    verify_release_images "$current" || die 'current release images are unavailable; refusing deployment'
  fi
  printf '%s' "$current"
}

compose_for() {
  local dir=$1
  shift
  docker compose --project-name grumphya \
    --env-file "$ENV_FILE" \
    --env-file "$dir/release.env" \
    --file "$dir/compose.production.yaml" "$@"
}

free_bytes() {
  local path=$1 blocks
  blocks=$(df -Pk "$path" | awk 'NR == 2 { print $4 }')
  [[ $blocks =~ ^[0-9]+$ ]] || die 'cannot determine available disk space'
  printf '%s' "$((blocks * 1024))"
}

check_free_space() {
  local payload_bytes=$1 docker_root required min_free root_free docker_free
  min_free=${GRUMPHYA_DEPLOY_MIN_FREE_BYTES:-$MIN_FREE_BYTES_DEFAULT}
  [[ $min_free =~ ^[1-9][0-9]{0,11}$ ]] || die 'invalid minimum free-space setting'
  # Bundle, extracted image archive, and Docker's unpacked layer writes may
  # coexist during docker load. Keep an additional reserve for a small VPS.
  required=$((payload_bytes * 3 + min_free))
  root_free=$(free_bytes "$ROOT")
  docker_root=$(docker info --format '{{.DockerRootDir}}') || die 'cannot locate Docker image storage'
  [[ -d $docker_root ]] || die 'Docker image storage directory is unavailable'
  docker_free=$(free_bytes "$docker_root")
  (( root_free >= required && docker_free >= required )) || die 'insufficient free disk space for a safe deployment'
}

validate_bundle_listing() {
  local archive=$1 listing="$1.entries" entry
  tar -tzf "$archive" > "$listing" || die 'deployment bundle archive is invalid'
  while IFS= read -r entry; do
    case "${entry:0:1}" in
      -|d) ;;
      *) die 'bundle contains a non-regular file or directory' ;;
    esac
  done < <(tar -tvzf "$archive")
  while IFS= read -r entry; do
    [[ $entry == . || $entry == ./ ]] && continue
    [[ $entry == ./* ]] && entry=${entry#./}
    [[ -n $entry ]] || die 'bundle contains an empty path'
    case "$entry" in
      /*|../*|*/../*|*/..|..|./*|*/./*) die 'bundle contains an unsafe path' ;;
      compose.production.yaml|release.env|images.tar|docker|docker/*|migrations|migrations/*) ;;
      *) die 'bundle contains an unexpected path' ;;
    esac
  done < "$listing"
  grep -Eq '^([.]/)?compose.production.yaml$' "$listing" || die 'bundle is missing Compose configuration'
  grep -Eq '^([.]/)?release.env$' "$listing" || die 'bundle is missing release metadata'
  grep -Eq '^([.]/)?images.tar$' "$listing" || die 'bundle is missing container images'
  grep -Eq '^([.]/)?docker/Caddyfile$' "$listing" || die 'bundle is missing the Caddy configuration'
  grep -Eq '^([.]/)?migrations/?$|^([.]/)?migrations/' "$listing" || die 'bundle is missing migrations'
}

validate_release_env() {
  local dir=$1 sha=$2 line key value
  local seen=' ' API_IMAGE='' WEB_IMAGE='' DATABASE_IMAGE='' PROXY_IMAGE='' DEPLOY_SHA=''
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^([A-Z_]+)=([A-Za-z0-9_./:@-]+)$ ]] || die 'release metadata has invalid syntax'
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    case "$key" in
      API_IMAGE|WEB_IMAGE|DATABASE_IMAGE|PROXY_IMAGE|DEPLOY_SHA) ;;
      *) die 'release metadata contains an unexpected key' ;;
    esac
    [[ $seen != *" $key "* ]] || die 'release metadata contains a duplicate key'
    seen+="$key "
    case "$key" in
      API_IMAGE) API_IMAGE=$value ;;
      WEB_IMAGE) WEB_IMAGE=$value ;;
      DATABASE_IMAGE) DATABASE_IMAGE=$value ;;
      PROXY_IMAGE) PROXY_IMAGE=$value ;;
      DEPLOY_SHA) DEPLOY_SHA=$value ;;
    esac
  done < "$dir/release.env"
  [[ -n $DEPLOY_SHA && -n $API_IMAGE && -n $WEB_IMAGE && -n $DATABASE_IMAGE && -n $PROXY_IMAGE ]] ||
    die 'release metadata is incomplete'
  [[ $DEPLOY_SHA == "$sha" ]] || die 'release metadata SHA does not match requested deployment'
  [[ $API_IMAGE == "grumphya-api:$sha" && \
    $WEB_IMAGE == "grumphya-web:$sha" && \
    $DATABASE_IMAGE == "grumphya-database:$sha" && \
    $PROXY_IMAGE == "grumphya-proxy:$sha" ]] ||
    die 'release image tags do not match the requested SHA'
}

install_release_helper() {
  local source=$1 version temporary
  [[ -f $source && ! -L $source ]] || die 'release is missing its deployment helper'
  bash -n "$source" || die 'release deployment helper has invalid shell syntax'
  version=$(sed -nE 's/^readonly HELPER_VERSION=([0-9]+)$/\1/p' "$source")
  [[ $version =~ ^[0-9]+$ ]] || die 'release deployment helper version is missing or invalid'
  (( 10#$version >= HELPER_VERSION )) || die 'release deployment helper is older than the installed helper'

  mkdir -p "${DEPLOY_HELPER_PATH%/*}"
  temporary=$(mktemp "${DEPLOY_HELPER_PATH}.XXXXXXXX")
  if [[ ${GRUMPHYA_TESTING:-0} == 1 ]]; then
    install -m 0755 "$source" "$temporary" || die 'cannot stage the release deployment helper'
  else
    install -o root -g root -m 0755 "$source" "$temporary" || die 'cannot stage the release deployment helper'
  fi
  mv -f -- "$temporary" "$DEPLOY_HELPER_PATH" || {
    rm -f -- "$temporary"
    die 'cannot activate the release deployment helper'
  }
  log "deployment helper updated to version $version from the validated release"
}

is_approved_illuminado_repricing_migration() {
  local name=$1 content=$2 normalized_sql expected_sql
  local marker='-- deployment-data-rewrite: retroactive-illuminado-price'
  [[ $name == '034_illuminado_price_retroactive.sql' ]] || return 1
  grep -Fq -- "$marker" <<< "$content" || return 1
  normalized_sql=$(sed -E '/^[[:space:]]*(--|$)/d; s/[[:space:]]+/ /g' <<< "$content" |
    tr '\n' ' ' | sed -E 's/ +/ /g; s/^ //; s/ $//')
  expected_sql="UPDATE plans SET monthly_price_eur = 3.00 WHERE code = 'ILUMINADO'; UPDATE simulated_purchases purchase SET amount_eur = 3.00 FROM subscriptions subscription WHERE purchase.subscription_id = subscription.id AND subscription.plan_code = 'ILUMINADO';"
  [[ $normalized_sql == "$expected_sql" ]]
}

migrations_compatible() {
  local previous_dir=$1 candidate_dir=$2 file name old_content new_content
  local marker='-- deployment-rollback-compatible: true'
  local destructive='(^|[^[:alnum:]_])(DROP|TRUNCATE|DELETE|UPDATE)([^[:alnum:]_]|$)'
  local alter_destructive='ALTER[[:space:]]+TABLE[^;]*(DROP|RENAME|TYPE|SET[[:space:]]+NOT[[:space:]]+NULL)'

  for file in "$previous_dir"/migrations/*.sql; do
    [[ -f $file ]] || continue
    name=${file##*/}
    [[ -f $candidate_dir/migrations/$name ]] || {
      log "migration compatibility blocked: removed migration $name"
      return 1
    }
    old_content=$(<"$file")
    new_content=$(<"$candidate_dir/migrations/$name")
    [[ $old_content == "$new_content" ]] || {
      log "migration compatibility blocked: modified migration $name"
      return 1
    }
  done

  for file in "$candidate_dir"/migrations/*.sql; do
    [[ -f $file ]] || continue
    name=${file##*/}
    [[ -f $previous_dir/migrations/$name ]] && continue
    new_content=$(<"$file")
    if ! grep -Fq -- "$marker" <<< "$new_content"; then
      log "migration compatibility blocked: new migration $name lacks the compatibility marker"
      return 1
    fi
    if [[ $new_content =~ $destructive || $new_content =~ $alter_destructive ]]; then
      if is_approved_illuminado_repricing_migration "$name" "$new_content"; then
        continue
      fi
      log "migration compatibility blocked: new migration $name contains a destructive operation"
      return 1
    fi
  done
}

validate_previous_release() {
  local previous=$1
  [[ -n $previous ]] || return 0
  release_is_complete "$previous" || die 'previous release state is incomplete; refusing rollback'
  compose_for "$RELEASES_DIR/$previous" config --quiet >/dev/null ||
    die 'previous production Compose configuration is invalid'
  verify_release_images "$previous" || die 'previous release images are unavailable; refusing deployment'
}

load_release_images() {
  local dir=$1 sha=$2 image
  docker load --input "$dir/images.tar" >/dev/null || die 'container image archive could not be loaded'
  for image in "grumphya-api:$sha" "grumphya-web:$sha" "grumphya-database:$sha" "grumphya-proxy:$sha"; do
    docker image inspect "$image" >/dev/null 2>&1 || die 'loaded image archive is missing an expected image'
  done
}

verify_release_images() {
  local sha=$1 image
  for image in "grumphya-api:$sha" "grumphya-web:$sha" "grumphya-database:$sha" "grumphya-proxy:$sha"; do
    docker image inspect "$image" >/dev/null 2>&1 || return 1
  done
}

verify_bootstrap_revision() {
  local api_container=$1 web_container=$2 sha=$3
  docker exec "$api_container" node -e \
    'fetch("http://127.0.0.1:3000/api/health").then(async response => { const body = await response.json(); if (!response.ok || body.status !== "ok" || body.revision !== process.argv[1]) process.exit(1); }).catch(() => process.exit(1))' \
    "$sha" >/dev/null || die 'running API health revision does not match bootstrap SHA'
  docker exec "$web_container" sh -c \
    'test -s /usr/share/nginx/html/build.json && grep -Eq "\\\"revision\\\"[[:space:]]*:[[:space:]]*\\\"$1\\\"" /usr/share/nginx/html/build.json' \
    sh "$sha" >/dev/null || die 'running web build revision does not match bootstrap SHA'
}

clear_pending_state() {
  rm -f -- "$STATE_DIR/deploying" "$STATE_DIR/deploying_previous"
}

recover_pending_state() {
  local pending current previous
  [[ -f $STATE_DIR/deploying ]] || return 0
  pending=$(read_state deploying)
  current=$(read_state current)
  previous=$(read_state deploying_previous)
  [[ -n $pending && -n $current ]] || die 'incomplete interrupted deployment journal; refusing further changes'
  if [[ $current == "$pending" ]]; then
    release_is_complete "$current" || die 'completed deployment journal points to an incomplete release'
    verify_release_images "$current" || die 'completed deployment journal images are unavailable'
    clear_pending_state
    return 0
  fi
  release_is_complete "$current" || die 'interrupted deployment has no complete last-known-good release'
  verify_release_images "$current" || die 'last-known-good images are unavailable for interrupted deployment recovery'
  log "recovering interrupted deployment by restoring release $current"
  compose_for "$RELEASES_DIR/$current" up -d --no-build --wait >/dev/null ||
    die 'interrupted deployment recovery could not restore the last-known-good release'
  write_state previous "$previous"
  prune_old_releases "$current" "$previous"
  clear_pending_state
  log "interrupted deployment recovered to release $current"
}

deploy_exit_recovery() {
  local exit_code=$1
  if (( ROLLOUT_IN_PROGRESS == 1 )); then
    trap - EXIT
    log 'deployment exited before its state was committed; attempting journaled rollback'
    if recover_pending_state; then
      ROLLOUT_IN_PROGRESS=0
    else
      log 'journaled rollback could not complete; persistent volumes were left untouched'
    fi
    rm -rf -- "$DEPLOY_TEMP_DIR"
    DEPLOY_TEMP_DIR=''
    exit "$exit_code"
  fi
  if [[ -n $DEPLOY_TEMP_DIR ]]; then
    rm -rf -- "$DEPLOY_TEMP_DIR"
    DEPLOY_TEMP_DIR=''
  fi
}

prune_old_releases() {
  local current=$1 previous=$2 dir sha image
  for dir in "$RELEASES_DIR"/*; do
    [[ -d $dir ]] || continue
    sha=${dir##*/}
    [[ $sha =~ $SHA_PATTERN ]] || continue
    [[ $sha == "$current" || $sha == "$previous" ]] && continue
    for image in "grumphya-api:$sha" "grumphya-web:$sha" "grumphya-database:$sha" "grumphya-proxy:$sha"; do
      docker image rm "$image" >/dev/null 2>&1 || true
    done
    rm -rf -- "$dir"
  done
}

preflight() {
  [[ $# -eq 2 ]] || die 'usage: preflight <sha> <bytes>'
  local sha=$1 bytes current
  require_sha "$sha"
  bytes=$(parse_bytes "$2")
  require_root
  ensure_layout
  check_secrets
  check_tools
  recover_pending_state
  current=$(check_current_release)
  check_free_space "$bytes"
  printf '%s\n' "${current:-none}"
}

deploy() {
  [[ $# -eq 3 ]] || die 'usage: deploy <sha> <bytes> <sha256>'
  local sha=$1 bytes=$2 expected_hash=$3 payload_bytes actual_bytes actual_hash
  local previous original_previous candidate_dir release_path temp_dir bundle_dir
  require_sha "$sha"
  payload_bytes=$(parse_bytes "$bytes")
  [[ $expected_hash =~ ^[0-9a-f]{64}$ ]] || die 'invalid bundle SHA-256'
  require_root
  ensure_layout
  check_secrets
  check_tools
  recover_pending_state
  previous=$(check_current_release)
  [[ -n $previous ]] || die 'no current release exists; bootstrap the running production stack before deployment'
  original_previous=$(read_state previous)
  validate_previous_release "$original_previous"
  check_free_space "$payload_bytes"

  temp_dir=$(mktemp -d "$ROOT/incoming/$sha.XXXXXXXX")
  DEPLOY_TEMP_DIR=$temp_dir
  bundle_dir="$temp_dir/bundle.tar.gz"
  candidate_dir="$temp_dir/release"
  release_path="$RELEASES_DIR/$sha"
  trap 'if [[ -n ${DEPLOY_TEMP_DIR:-} ]]; then rm -rf -- "$DEPLOY_TEMP_DIR"; fi' EXIT
  # Bound stdin before writing: a compromised authorized key must not be able
  # to fill the VPS disk by claiming a small preflight size and streaming more.
  head -c "$((payload_bytes + 1))" > "$bundle_dir" || die 'failed to receive deployment bundle'
  actual_bytes=$(wc -c < "$bundle_dir" | tr -d '[:space:]')
  [[ $actual_bytes == "$payload_bytes" ]] || die 'deployment bundle size does not match preflight'
  actual_hash=$(sha256sum "$bundle_dir" | awk '{print $1}')
  [[ $actual_hash == "$expected_hash" ]] || die 'deployment bundle SHA-256 verification failed'
  log "release bundle received and SHA-256 verified for $sha ($actual_bytes bytes)"
  validate_bundle_listing "$bundle_dir"
  [[ ! -e $release_path ]] || die 'release directory already exists'
  mkdir -m 700 "$candidate_dir"
  tar --no-same-owner -xzf "$bundle_dir" -C "$candidate_dir"
  ln -s "$SECRETS_DIR" "$candidate_dir/.secrets"
  validate_release_env "$candidate_dir" "$sha"
  if [[ -n $previous ]]; then
    migrations_compatible "$RELEASES_DIR/$previous" "$candidate_dir" ||
      die 'migrations are not safe for application rollback'
  fi

  compose_for "$candidate_dir" config --quiet >/dev/null || die 'candidate production Compose configuration is invalid'
  log "release contents and rollback compatibility validated for $sha"
  log "loading scanned release images for $sha"
  load_release_images "$candidate_dir" "$sha"
  log "scanned release images loaded for $sha"
  mv "$candidate_dir" "$release_path"
  candidate_dir=$release_path
  install_release_helper "$release_path/docker/vps-deploy.sh"

  write_state deploying_previous "$original_previous"
  write_state deploying "$sha"
  write_state previous "$previous"
  ROLLOUT_IN_PROGRESS=1
  trap 'deploy_exit_recovery $?' EXIT
  log "starting atomic Compose rollout for $sha"
  if compose_for "$candidate_dir" up -d --no-build --wait >/dev/null; then
    log 'checking production AI providers before committing the release'
    compose_for "$candidate_dir" run --rm --no-deps -T api \
      sh /workspace/docker/api-entrypoint.sh node apps/api/dist/infrastructure/ai/production-ai-smoke.js >/dev/null ||
      die 'production AI provider smoke failed; restoring the previous release'
    write_state current "$sha"
    clear_pending_state
    ROLLOUT_IN_PROGRESS=0
    log "release $sha is healthy"
    prune_old_releases "$sha" "$previous"
    printf '%s\n' "$sha"
    return 0
  fi

  if ! recover_pending_state; then
    die 'new release and automatic rollback both failed; inspect the VPS before retrying'
  fi
  ROLLOUT_IN_PROGRESS=0
  die 'new release failed; automatic rollback completed'
}

rollback() {
  [[ $# -eq 0 ]] || die 'usage: rollback'
  require_root
  ensure_layout
  check_secrets
  check_tools
  recover_pending_state
  local current previous
  current=$(read_state current)
  previous=$(read_state previous)
  [[ -n $current ]] || die 'there is no current release to roll back from'
  [[ -n $previous ]] || die 'there is no previous release to restore'
  release_is_complete "$current" || die 'current release state is incomplete'
  release_is_complete "$previous" || die 'previous release state is incomplete'
  verify_release_images "$current" || die 'current release images are unavailable'
  verify_release_images "$previous" || die 'previous release images are unavailable'
  compose_for "$RELEASES_DIR/$previous" config --quiet >/dev/null || die 'previous Compose configuration is invalid'
  compose_for "$RELEASES_DIR/$previous" up -d --no-build --wait >/dev/null ||
    die 'previous release failed to become healthy; state was not changed'
  write_state current "$previous"
  write_state previous "$current"
  log "restored release $previous; current and previous have been swapped"
  printf '%s\n' "$previous"
}

status() {
  [[ $# -eq 0 ]] || die 'usage: status'
  require_root
  ensure_layout
  if [[ -f $STATE_DIR/deploying ]]; then
    check_secrets
    check_tools
    recover_pending_state
  fi
  local current
  current=$(read_state current)
  printf '%s\n' "${current:-none}"
}

helper_version() {
  [[ $# -eq 0 ]] || die 'usage: helper-version'
  printf '%s\n' "$HELPER_VERSION"
}

gateway() {
  [[ $# -eq 0 ]] || die 'usage: gateway'
  local command=${SSH_ORIGINAL_COMMAND:-}
  local sha bytes bundle_hash
  if [[ $command =~ ^preflight\ ([0-9a-f]{40})\ ([1-9][0-9]{0,9})$ ]]; then
    sha=${BASH_REMATCH[1]}
    bytes=${BASH_REMATCH[2]}
    exec "$0" preflight "$sha" "$bytes"
  fi
  if [[ $command =~ ^deploy\ ([0-9a-f]{40})\ ([1-9][0-9]{0,9})\ ([0-9a-f]{64})$ ]]; then
    sha=${BASH_REMATCH[1]}
    bytes=${BASH_REMATCH[2]}
    bundle_hash=${BASH_REMATCH[3]}
    exec "$0" deploy "$sha" "$bytes" "$bundle_hash"
  fi
  if [[ $command == rollback ]]; then
    exec "$0" rollback
  fi
  if [[ $command == status ]]; then
    exec "$0" status
  fi
  if [[ $command == helper-version ]]; then
    exec "$0" helper-version
  fi
  die 'SSH command rejected by deployment gateway'
}

bootstrap() {
  [[ $# -eq 1 ]] || die 'usage: bootstrap <sha>'
  local sha=$1 staging="$RELEASES_DIR/.bootstrap-$1.$$" migration_source
  local service container image_id image_name
  local container_api='' container_web=''
  require_sha "$sha"
  require_root
  ensure_layout
  [[ ! -e $STATE_DIR/current && ! -L $STATE_DIR/current ]] || die 'bootstrap refused because current state already exists'
  check_secrets
  check_tools
  [[ -f $ROOT/compose.production.yaml && -d $ROOT/docker && -f $ROOT/docker/Caddyfile ]] ||
    die 'bootstrap source configuration is incomplete'
  if [[ -d $ROOT/migrations ]]; then
    migration_source=$ROOT/migrations
  elif [[ -d $ROOT/apps/api/migrations ]]; then
    migration_source=$ROOT/apps/api/migrations
  else
    die 'bootstrap migration source is missing'
  fi

  for service in api web db proxy; do
    container=$(docker ps -q --filter 'label=com.docker.compose.project=grumphya' \
      --filter "label=com.docker.compose.service=$service") || die 'cannot inspect running production containers'
    [[ -n $container && $container != *$'\n'* ]] || die 'bootstrap requires exactly one running container per production service'
    [[ $(docker inspect --format '{{.State.Status}}' "$container") == running ]] ||
      die 'bootstrap requires every production service to be running'
    [[ $(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || true) == healthy ]] ||
      die 'bootstrap requires every production service to be healthy'
    image_id=$(docker inspect --format '{{.Image}}' "$container") || die 'cannot determine a running container image'
    case "$service" in
      api) container_api=$container; image_name=api ;;
      web) container_web=$container; image_name=web ;;
      db) image_name=database ;;
      proxy) image_name=proxy ;;
    esac
    docker image tag "$image_id" "grumphya-$image_name:$sha" || die 'cannot tag a running production image'
    [[ $(docker image inspect --format '{{.Id}}' "grumphya-$image_name:$sha") == "$image_id" ]] ||
      die 'tagged production image does not preserve the running image ID'
  done

  verify_bootstrap_revision "$container_api" "$container_web" "$sha"

  mkdir -m 700 "$staging"
  cp "$ROOT/compose.production.yaml" "$staging/compose.production.yaml"
  cp -R "$ROOT/docker" "$staging/docker"
  mkdir "$staging/migrations"
  cp "$migration_source"/*.sql "$staging/migrations/"
  ln -s "$SECRETS_DIR" "$staging/.secrets"
  cat > "$staging/release.env" <<EOF
API_IMAGE=grumphya-api:$sha
WEB_IMAGE=grumphya-web:$sha
DATABASE_IMAGE=grumphya-database:$sha
PROXY_IMAGE=grumphya-proxy:$sha
DEPLOY_SHA=$sha
EOF
  docker save --output "$staging/images.tar" \
    "grumphya-api:$sha" "grumphya-web:$sha" \
    "grumphya-database:$sha" "grumphya-proxy:$sha" || die 'cannot save the running production images'
  validate_release_env "$staging" "$sha"
  compose_for "$staging" config --quiet >/dev/null || die 'bootstrapped Compose configuration is invalid'
  mv "$staging" "$RELEASES_DIR/$sha"
  write_state current "$sha"
  write_state previous ''
  log "bootstrapped currently running image IDs as release $sha; no containers or volumes were changed"
  printf '%s\n' "$sha"
}

main() {
  [[ $# -ge 1 ]] || die 'usage: preflight|deploy|rollback|status|helper-version|bootstrap|gateway'
  local action=$1
  shift
  case "$action" in
    preflight) preflight "$@" ;;
    deploy) deploy "$@" ;;
    rollback) rollback "$@" ;;
    status) status "$@" ;;
    helper-version) helper_version "$@" ;;
    bootstrap) bootstrap "$@" ;;
    gateway) gateway "$@" ;;
    *) die 'unknown action' ;;
  esac
}

main "$@"
