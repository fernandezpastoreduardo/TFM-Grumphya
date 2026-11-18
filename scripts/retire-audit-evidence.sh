#!/usr/bin/env bash
set -Eeuo pipefail

: "${PGHOST:?PGHOST must point to the Grumphya PostgreSQL service}"
: "${PGDATABASE:?PGDATABASE must name the Grumphya database}"
: "${PGUSER:?PGUSER must be the audit retention role}"
: "${PGPASSWORD:?PGPASSWORD must come from the retention secret}"
: "${PGSSLROOTCERT:?PGSSLROOTCERT must point to the trusted PostgreSQL CA}"

if [[ "${PGSSLMODE:-verify-full}" != verify-full ]]; then
  printf '%s\n' 'PGSSLMODE must be verify-full.' >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 --tuples-only --no-align <<'SQL'
WITH due AS (
  SELECT ctid FROM audit.evidence
  WHERE created_at <= now() - interval '30 days'
  ORDER BY created_at
  LIMIT 500
  FOR UPDATE SKIP LOCKED
)
DELETE FROM audit.evidence AS evidence USING due
WHERE evidence.ctid = due.ctid;

WITH due AS (
  SELECT deployment_sha FROM audit.release_attestations
  WHERE created_at <= now() - interval '30 days'
  ORDER BY created_at
  LIMIT 500
  FOR UPDATE SKIP LOCKED
)
DELETE FROM audit.release_attestations AS attestation USING due
WHERE attestation.deployment_sha = due.deployment_sha;
SQL

unset PGPASSWORD
