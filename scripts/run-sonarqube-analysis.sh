#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

SONAR_ENV_FILE=.secrets/sonarqube_settings
SONAR_TOKEN_FILE=.secrets/sonarqube_token
SONAR_NETWORK=grumphya-sonarqube_sonar-private
SONAR_SCANNER_IMAGE=sonarsource/sonar-scanner-cli:12.1.0.3233_8.0.1
POSTGRES_IMAGE=pgvector/pgvector:0.8.7-pg17
RUN_ID="grumphya-sonar-check-$$-${RANDOM}"
DB_CONTAINER="$RUN_ID-postgres"
GIT_METADATA_DIRECTORY=
GIT_REFERENCE_REF=

for required_file in "$SONAR_ENV_FILE" "$SONAR_TOKEN_FILE"; do
  if [[ ! -f "$required_file" || -L "$required_file" || ! -r "$required_file" ]]; then
    echo "Required SonarQube configuration must be a readable regular file: $required_file" >&2
    exit 1
  fi
  file_mode=$(stat -f '%Lp' "$required_file" 2>/dev/null) || \
    file_mode=$(stat -c '%a' "$required_file")
  if (( (8#$file_mode & 077) != 0 )); then
    echo "SonarQube configuration must not be accessible by group or others: $required_file" >&2
    exit 1
  fi
done
if ! grep -Eq '^SONAR_TOKEN=[^[:space:]#].*' "$SONAR_TOKEN_FILE"; then
  echo "SONAR_TOKEN is missing from .secrets/sonarqube_token." >&2
  exit 1
fi

SONAR_SERVER_CONTAINER=$(docker compose \
  --env-file "$SONAR_ENV_FILE" \
  --file compose.sonarqube.yaml \
  ps --status running --quiet sonarqube)
if [[ -z "$SONAR_SERVER_CONTAINER" ]]; then
  echo "SonarQube is not running. Start it with the documented Compose command." >&2
  exit 1
fi
if [[ "$(docker network inspect --format '{{.Internal}}' "$SONAR_NETWORK")" != true ]]; then
  echo "The SonarQube scanner network is missing or is not internal." >&2
  exit 1
fi

cleanup() {
  docker rm --force "$DB_CONTAINER" >/dev/null 2>&1 || true
  if [[ -n "$GIT_REFERENCE_REF" ]]; then
    git update-ref -d "$GIT_REFERENCE_REF" >/dev/null 2>&1 || true
  fi
  if [[ -n "$GIT_METADATA_DIRECTORY" ]]; then
    rm -rf "$GIT_METADATA_DIRECTORY"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker run --detach --rm \
  --name "$DB_CONTAINER" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_DB=grumphya_test \
  --env POSTGRES_USER=grumphya_test \
  --env POSTGRES_PASSWORD=grumphya_test \
  --health-cmd 'pg_isready -U grumphya_test -d grumphya_test' \
  --health-interval 2s \
  --health-timeout 3s \
  --health-retries 30 \
  "$POSTGRES_IMAGE" >/dev/null

for attempt in $(seq 1 60); do
  health=$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")
  [[ "$health" == healthy ]] && break
  if [[ "$health" == unhealthy ]]; then
    docker logs "$DB_CONTAINER" >&2
    echo "The isolated SonarQube coverage database failed to start." >&2
    exit 1
  fi
  sleep 1
done
if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")" != healthy ]]; then
  docker logs "$DB_CONTAINER" >&2
  echo "The isolated SonarQube coverage database did not become ready." >&2
  exit 1
fi

database_port=$(docker port "$DB_CONTAINER" 5432/tcp | sed -n '1{s/.*://;p;}')
if [[ ! "$database_port" =~ ^[0-9]+$ ]]; then
  echo "Could not determine the isolated test database port." >&2
  exit 1
fi
export TEST_DATABASE_URL="postgresql://grumphya_test:grumphya_test@127.0.0.1:$database_port/grumphya_test"
for variable in \
  ANONYMOUS_USAGE_TEST_DATABASE_URL \
  REGISTRATION_TEST_DATABASE_URL \
  WORST_IDEAS_USER_TEST_DATABASE_URL \
  WORST_IDEAS_RANKING_TEST_DATABASE_URL \
  USER_DELETE_TEST_DATABASE_URL \
  CONTACT_MESSAGE_TEST_DATABASE_URL \
  BEST_USERS_TEST_DATABASE_URL \
  ADMIN_DASHBOARD_TEST_DATABASE_URL \
  APPROVED_IDEAS_TEST_DATABASE_URL; do
  export "$variable=$TEST_DATABASE_URL"
done
export ACCESS_TOKEN_SECRET=ci-only-secret-with-more-than-32-bytes
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--no-experimental-webstorage"

pnpm --filter @grumphya/api exec tsx scripts/prepare-test-database.ts
pnpm --filter @grumphya/api test:coverage
pnpm --filter @grumphya/web test:coverage
test -s apps/api/coverage/lcov.info
test -s apps/web/coverage/lcov.info

REFERENCE_SHA=${SONAR_REFERENCE_SHA:-}
if [[ -z "$REFERENCE_SHA" ]]; then
  if ! git show-ref --verify --quiet refs/heads/main; then
    echo "Local main branch is required for an on-demand analysis." >&2
    exit 1
  fi
  REFERENCE_SHA=$(git rev-parse refs/heads/main)
fi
if [[ ! "$REFERENCE_SHA" =~ ^[[:xdigit:]]{40}([[:xdigit:]]{24})?$ ]]; then
  echo "The SonarQube reference commit must be a full Git object ID." >&2
  exit 1
fi
if ! git cat-file -e "$REFERENCE_SHA^{commit}"; then
  echo "The SonarQube reference commit is not available in this checkout." >&2
  exit 1
fi
ANALYSIS_SHA=$(git rev-parse HEAD)
if ! git merge-base --is-ancestor "$REFERENCE_SHA" "$ANALYSIS_SHA"; then
  echo "The analysis commit must include the selected main reference commit." >&2
  exit 1
fi
GIT_METADATA_DIRECTORY=$(mktemp -d "$ROOT/.sonar-git.XXXXXX")
GIT_REFERENCE_REF="refs/heads/sonar-main-base-$RUN_ID"
git update-ref "$GIT_REFERENCE_REF" "$REFERENCE_SHA"
git bundle create "$GIT_METADATA_DIRECTORY/repository.bundle" "$GIT_REFERENCE_REF" HEAD
git update-ref -d "$GIT_REFERENCE_REF"
GIT_REFERENCE_REF=
git clone --quiet "$GIT_METADATA_DIRECTORY/repository.bundle" "$GIT_METADATA_DIRECTORY/checkout"
env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE \
  git -C "$GIT_METADATA_DIRECTORY/checkout" update-ref refs/heads/main "$REFERENCE_SHA"
if [[ "$(git rev-parse HEAD)" != "$ANALYSIS_SHA" ]]; then
  echo "SonarQube analysis changed the candidate Git revision." >&2
  exit 1
fi

echo "Running SonarScanner against the private internal SonarQube network."
docker run --rm \
  --platform linux/amd64 \
  --network "$SONAR_NETWORK" \
  --env-file "$SONAR_TOKEN_FILE" \
  --env SONAR_HOST_URL=http://sonarqube:9000 \
  --volume "$ROOT/apps/api/src:/usr/src/apps/api/src:ro" \
  --volume "$ROOT/apps/api/coverage/lcov.info:/usr/src/apps/api/coverage/lcov.info:ro" \
  --volume "$ROOT/apps/api/tsconfig.json:/usr/src/apps/api/tsconfig.json:ro" \
  --volume "$ROOT/apps/web/src:/usr/src/apps/web/src:ro" \
  --volume "$ROOT/apps/web/coverage/lcov.info:/usr/src/apps/web/coverage/lcov.info:ro" \
  --volume "$ROOT/apps/web/tsconfig.json:/usr/src/apps/web/tsconfig.json:ro" \
  --volume "$GIT_METADATA_DIRECTORY/checkout/.git:/usr/src/.git:ro" \
  --volume "$ROOT/sonar-project.properties:/usr/src/sonar-project.properties:ro" \
  "$SONAR_SCANNER_IMAGE" \
  -Dsonar.scm.revision="$(git rev-parse HEAD)" \
  -Dsonar.qualitygate.wait=true \
  -Dsonar.qualitygate.timeout=300

echo "SonarQube Quality Gate passed for $(git rev-parse --short HEAD)."
