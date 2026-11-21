#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MODE=${1:-all}
case "$MODE" in
  all|quality|e2e|audit) ;;
  *) echo "Usage: bash scripts/ci-local.sh [all|quality|e2e|audit]" >&2; exit 2 ;;
esac

NODE_VERSION=$(tr -d '[:space:]' < "$ROOT/.node-version")
if [[ -f "$ROOT/.nvmrc" ]] && [[ "$(tr -d '[:space:]' < "$ROOT/.nvmrc")" != "$NODE_VERSION" ]]; then
  echo ".nvmrc and .node-version must specify the same Node.js version" >&2
  exit 1
fi
PNPM_VERSION=$(node -p "require('$ROOT/package.json').packageManager.replace(/^pnpm@/, '')")
PLAYWRIGHT_VERSION=$(awk '
  /^  apps\/web:/ { in_web = 1; next }
  in_web && /^  [^ ]/ { exit }
  in_web && /^      '\''@playwright\/test'\'':/ { in_playwright = 1; next }
  in_playwright && /version:/ { print $2; exit }
' "$ROOT/pnpm-lock.yaml")
if [[ -z "$PLAYWRIGHT_VERSION" ]]; then
  echo "Could not determine the locked Playwright version" >&2
  exit 1
fi
CI_PLAYWRIGHT_IMAGE=$(sed -nE 's/^[[:space:]]+image: (mcr\.microsoft\.com\/playwright:v[^[:space:]]+).*/\1/p' "$ROOT/.github/workflows/ci.yml")
if [[ "$CI_PLAYWRIGHT_IMAGE" != "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" ]]; then
  echo "The Playwright image in CI and the lockfile must use the same version" >&2
  exit 1
fi
POSTGRES_IMAGE=$(awk '
  /^      postgres:/ { in_postgres = 1; next }
  in_postgres && /^      [^ ]/ { exit }
  in_postgres && /image:/ { print $2; exit }
' "$ROOT/.github/workflows/ci.yml")
if [[ -z "$POSTGRES_IMAGE" ]]; then
  echo "Could not determine the PostgreSQL service image from CI" >&2
  exit 1
fi

RUN_ID="grumphya-ci-local-$$-$RANDOM"
NETWORK="$RUN_ID"
DB_CONTAINER="$RUN_ID-postgres"
ARTIFACTS="$ROOT/.ci-artifacts/$RUN_ID"
STAGING=$(mktemp -d "${TMPDIR:-/tmp}/grumphya-ci.XXXXXX")
IMAGE="$RUN_ID-runner"
cleanup() {
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  rm -rf "$STAGING"
}
trap cleanup EXIT

mkdir -p "$ARTIFACTS"
chmod 700 "$ROOT/.ci-artifacts" "$ARTIFACTS"
rsync -a --delete \
  --exclude='.git' --exclude='node_modules' --exclude='**/node_modules' \
  --exclude='.env*' --exclude='**/.env*' --exclude='.ci-artifacts' \
  --exclude='.secrets' --exclude='**/.secrets' --exclude='.aws' --exclude='**/.aws' \
  --exclude='.codex' --exclude='**/.codex' --exclude='.agents' --exclude='**/.agents' \
  --exclude='dist' --exclude='coverage' --exclude='test-results' \
  --exclude='playwright-report' --exclude='.turbo' \
  "$ROOT/" "$STAGING/source/"

docker build --progress plain --platform linux/amd64 \
  --build-arg "NODE_VERSION=$NODE_VERSION" \
  --build-arg "PNPM_VERSION=$PNPM_VERSION" \
  --build-arg "PLAYWRIGHT_VERSION=$PLAYWRIGHT_VERSION" \
  --file "$ROOT/docker/ci-runner.Dockerfile" \
  --tag "$IMAGE" "$ROOT" | tee "$ARTIFACTS/docker-build.log"

if [[ "$MODE" == all || "$MODE" == quality ]]; then
  docker network create "$NETWORK" >/dev/null
  docker run --detach --platform linux/amd64 --name "$DB_CONTAINER" \
    --network "$NETWORK" --network-alias postgres \
    --env POSTGRES_DB=grumphya_test \
    --env POSTGRES_USER=grumphya_test \
    --env POSTGRES_PASSWORD=grumphya_test \
    --health-cmd 'pg_isready -U grumphya_test -d grumphya_test' \
    --health-interval 5s --health-timeout 3s --health-retries 20 \
    "$POSTGRES_IMAGE" >/dev/null

  for attempt in $(seq 1 40); do
    health=$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")
    [[ "$health" == healthy ]] && break
    if [[ "$health" == unhealthy ]]; then
      docker logs "$DB_CONTAINER" | tee "$ARTIFACTS/postgres.log"
      exit 1
    fi
    sleep 2
  done
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")" != healthy ]]; then
    docker logs "$DB_CONTAINER" | tee "$ARTIFACTS/postgres.log"
    echo "PostgreSQL did not become healthy; see $ARTIFACTS/postgres.log" >&2
    exit 1
  fi
fi

set +e
docker_args=(--rm --platform linux/amd64 --shm-size=1gb)
if [[ "$MODE" == all || "$MODE" == quality ]]; then
  docker_args+=(--network "$NETWORK")
fi
docker run "${docker_args[@]}" \
  --mount "type=bind,source=$STAGING/source,target=/source,readonly" \
  --mount "type=bind,source=$ARTIFACTS,target=/artifacts" \
  "$IMAGE" "$MODE" 2>&1 | tee "$ARTIFACTS/$MODE.log"
status=${PIPESTATUS[0]}
set -e
docker logs "$DB_CONTAINER" > "$ARTIFACTS/postgres.log" 2>&1 || true
if (( status != 0 )); then
  echo "CI-equivalent checks failed (exit $status). Logs and Playwright artifacts: $ARTIFACTS" >&2
  exit "$status"
fi
if [[ "$MODE" == all || "$MODE" == quality ]]; then
  docker build --progress plain --file "$ROOT/Dockerfile" \
    --target database-production --build-arg POSTGRES_MAJOR=19 \
    --tag grumphya-database:postgres-19-candidate "$ROOT" \
    | tee "$ARTIFACTS/postgres-major-upgrade-build.log"
  TARGET_IMAGE=grumphya-database:postgres-19-candidate \
    bash "$ROOT/scripts/test-postgres-major-upgrade.sh"
fi
echo "CI-equivalent checks passed. Logs and Playwright artifacts: $ARTIFACTS"
