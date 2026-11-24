#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly SOURCE_IMAGE=${SOURCE_IMAGE:-pgvector/pgvector:0.8.7-pg17-bookworm}
readonly TARGET_IMAGE=${TARGET_IMAGE:-pgvector/pgvector:0.8.7-pg19-trixie}
readonly RUN_ID="grumphya-pg-upgrade-$(date +%s)-$$"
readonly SOURCE_CONTAINER="$RUN_ID-source"
readonly TARGET_CONTAINER="$RUN_ID-target"
readonly SOURCE_VOLUME="$RUN_ID-source-data"
readonly TARGET_VOLUME="$RUN_ID-target-data"
readonly TEMP_DIR=$(mktemp -d)
readonly DATABASE_NAME=grumphya_upgrade_test
readonly APPLICATION_ROLE=grumphya_upgrade_runtime
readonly TEST_PASSWORD=fixture-only-not-a-production-secret
readonly ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
readonly DATABASE_SETTINGS_FILE="$TEMP_DIR/database_settings"
readonly ADMIN_SETTINGS_FILE="$TEMP_DIR/postgres_admin_settings"
readonly TLS_CERT_FILE="$TEMP_DIR/postgres_tls.crt"
readonly TLS_KEY_FILE="$TEMP_DIR/postgres_tls.key"

started_source=0
started_target=0

cleanup() {
  local status=$?
  trap - EXIT ERR
  set +e
  if (( started_target == 1 )); then
    docker rm --force "$TARGET_CONTAINER" >/dev/null 2>&1
  fi
  if (( started_source == 1 )); then
    docker rm --force "$SOURCE_CONTAINER" >/dev/null 2>&1
  fi
  docker volume rm "$TARGET_VOLUME" "$SOURCE_VOLUME" >/dev/null 2>&1
  rm -rf -- "$TEMP_DIR"
  exit "$status"
}
trap cleanup EXIT

cat > "$DATABASE_SETTINGS_FILE" <<EOF
PGDATABASE=$DATABASE_NAME
PGUSER=$APPLICATION_ROLE
GRUMPHYA_DB_PASSWORD=$TEST_PASSWORD
EOF
cat > "$ADMIN_SETTINGS_FILE" <<EOF
POSTGRES_ADMIN_PASSWORD=$TEST_PASSWORD
EOF
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$TLS_KEY_FILE" -out "$TLS_CERT_FILE" \
  -subj '/CN=postgres' >/dev/null 2>&1
chmod 0600 "$TLS_KEY_FILE"

docker image inspect "$SOURCE_IMAGE" >/dev/null 2>&1 || docker pull "$SOURCE_IMAGE"
docker image inspect "$TARGET_IMAGE" >/dev/null 2>&1 || docker pull "$TARGET_IMAGE"
docker volume create "$SOURCE_VOLUME" >/dev/null
docker volume create "$TARGET_VOLUME" >/dev/null

start_database() {
  local name=$1 volume=$2 mount_path=$3 image=$4
  docker run --detach \
    --name "$name" \
    --env POSTGRES_PASSWORD="$TEST_PASSWORD" \
    --env POSTGRES_DB=postgres \
    --mount "type=volume,src=$volume,dst=$mount_path" \
    --mount "type=bind,src=$DATABASE_SETTINGS_FILE,dst=/run/secrets/database_settings,readonly" \
    --mount "type=bind,src=$ROOT_DIR/docker/postgres-backup.sh,dst=/usr/local/bin/grumphya-postgres-backup.sh,readonly" \
    --mount "type=bind,src=$ADMIN_SETTINGS_FILE,dst=/run/secrets/postgres_admin_settings,readonly" \
    --mount "type=bind,src=$TLS_CERT_FILE,dst=/run/secrets/postgres_tls.crt,readonly" \
    --mount "type=bind,src=$TLS_KEY_FILE,dst=/run/secrets/postgres_tls.key,readonly" \
    --env GRUMPHYA_SECRETS_DIR=/run/secrets \
    "$image" >/dev/null
}

wait_for_database() {
  local name=$1 attempt status
  for attempt in $(seq 1 120); do
    # pg_isready can report readiness during the brief interval before the
    # server accepts an actual SQL session. Require a real query before the
    # migration fixture starts issuing DDL through docker exec.
    if docker exec "$name" pg_isready --username postgres --dbname postgres >/dev/null 2>&1 \
      && docker exec "$name" psql --no-password --tuples-only --no-align \
        --username postgres --dbname postgres --command 'SELECT 1;' >/dev/null 2>&1; then
      return 0
    fi
    status=$(docker inspect --format '{{.State.Status}}' "$name")
    if [[ $status == exited || $status == dead ]]; then
      printf 'PostgreSQL migration fixture exited before becoming ready.\n' >&2
      docker logs --tail 40 "$name" >&2 || true
      return 1
    fi
    sleep 1
  done
  printf 'PostgreSQL migration fixture failed to become ready.\n' >&2
  docker logs --tail 40 "$name" >&2 || true
  return 1
}

start_database "$SOURCE_CONTAINER" "$SOURCE_VOLUME" /var/lib/postgresql/data "$SOURCE_IMAGE"
started_source=1
start_database "$TARGET_CONTAINER" "$TARGET_VOLUME" /var/lib/postgresql "$TARGET_IMAGE"
started_target=1
wait_for_database "$SOURCE_CONTAINER"
wait_for_database "$TARGET_CONTAINER"

ensure_fixture_database() {
  local name=$1 role_exists database_exists
  role_exists=$(docker exec "$name" psql --tuples-only --no-align --username postgres --dbname postgres \
    --command "SELECT count(*) FROM pg_roles WHERE rolname = '$APPLICATION_ROLE';")
  if [[ $role_exists == 0 ]]; then
    docker exec "$name" psql --set ON_ERROR_STOP=1 --username postgres --dbname postgres \
      --command "CREATE ROLE $APPLICATION_ROLE LOGIN PASSWORD '$TEST_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;"
  fi
  database_exists=$(docker exec "$name" psql --tuples-only --no-align --username postgres --dbname postgres \
    --command "SELECT count(*) FROM pg_database WHERE datname = '$DATABASE_NAME';")
  if [[ $database_exists == 0 ]]; then
    docker exec "$name" createdb --username postgres --owner "$APPLICATION_ROLE" "$DATABASE_NAME"
  fi
  docker exec "$name" psql --set ON_ERROR_STOP=1 --username postgres --dbname "$DATABASE_NAME" \
    --command 'CREATE EXTENSION IF NOT EXISTS vector;'
}

ensure_fixture_database "$SOURCE_CONTAINER"
ensure_fixture_database "$TARGET_CONTAINER"

docker exec --interactive "$SOURCE_CONTAINER" psql --set ON_ERROR_STOP=1 --username "$APPLICATION_ROLE" --dbname "$DATABASE_NAME" <<'SQL'
CREATE TABLE migration_probe (
  id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  label text NOT NULL,
  embedding vector(3) NOT NULL
);
CREATE INDEX migration_probe_embedding_idx
  ON migration_probe USING hnsw (embedding vector_cosine_ops);
INSERT INTO migration_probe (label, embedding) VALUES
  ('fixture one', '[1,0,0]'),
  ('fixture two', '[0,1,0]');
SQL

printf 'Streaming a synthetic PostgreSQL 17 dump into a clean PostgreSQL 19 cluster.\n'
set -o pipefail
source_count_before_dump=$(docker exec "$SOURCE_CONTAINER" psql --tuples-only --no-align --username postgres --dbname "$DATABASE_NAME" \
  --command 'SELECT count(*) FROM migration_probe;')
[[ $source_count_before_dump == 2 ]]
docker exec "$SOURCE_CONTAINER" sh /usr/local/bin/grumphya-postgres-backup.sh dump \
  | docker exec --interactive "$TARGET_CONTAINER" \
    sh /usr/local/bin/grumphya-postgres-backup.sh restore

source_version=$(docker exec "$SOURCE_CONTAINER" psql --tuples-only --no-align --username postgres --dbname postgres \
  --command 'SHOW server_version_num;')
target_version=$(docker exec "$TARGET_CONTAINER" psql --tuples-only --no-align --username postgres --dbname postgres \
  --command 'SHOW server_version_num;')
source_count=$(docker exec "$SOURCE_CONTAINER" psql --tuples-only --no-align --username postgres --dbname "$DATABASE_NAME" \
  --command 'SELECT count(*) FROM migration_probe;')
target_count=$(docker exec "$TARGET_CONTAINER" psql --tuples-only --no-align --username postgres --dbname "$DATABASE_NAME" \
  --command 'SELECT count(*) FROM migration_probe;')
target_vector=$(docker exec "$TARGET_CONTAINER" psql --tuples-only --no-align --username postgres --dbname "$DATABASE_NAME" \
  --command "SELECT extversion FROM pg_extension WHERE extname = 'vector';")
target_index=$(docker exec "$TARGET_CONTAINER" psql --tuples-only --no-align --username postgres --dbname "$DATABASE_NAME" \
  --command "SELECT count(*) FROM pg_indexes WHERE indexname = 'migration_probe_embedding_idx';")

[[ $source_version -ge 170000 && $source_version -lt 180000 ]]
[[ $target_version -ge 190000 && $target_version -lt 200000 ]]
[[ $source_count == 2 && $target_count == "$source_count" ]]
[[ $target_vector == 0.8.7 ]]
[[ $target_index == 1 ]]

printf 'PostgreSQL major-upgrade rehearsal passed: source=%s target=%s pgvector=%s rows=%s; source volume remained unchanged.\n' \
  "$source_version" "$target_version" "$target_vector" "$target_count"
