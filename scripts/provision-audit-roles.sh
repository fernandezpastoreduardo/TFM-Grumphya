#!/usr/bin/env bash
set -Eeuo pipefail

: "${PGHOST:?PGHOST must point to the Grumphya PostgreSQL service}"
: "${PGDATABASE:?PGDATABASE must name the Grumphya database}"
: "${PGUSER:?PGUSER must be the PostgreSQL bootstrap administrator}"
: "${PGPASSWORD:?PGPASSWORD must be supplied by the administrator secret}"
: "${PGSSLROOTCERT:?PGSSLROOTCERT must point to the trusted PostgreSQL CA}"
: "${AUDIT_API_ROLE:?AUDIT_API_ROLE must be the existing Grumphya API role}"
: "${AUDIT_OWNER_ROLE:?AUDIT_OWNER_ROLE must be a NOLOGIN owner role}"
: "${AUDIT_INGEST_ROLE:?AUDIT_INGEST_ROLE must be the evidence writer role}"
: "${AUDIT_INGEST_PASSWORD:?AUDIT_INGEST_PASSWORD must come from the ingest secret}"
: "${AUDIT_RETENTION_ROLE:?AUDIT_RETENTION_ROLE must be the retention role}"
: "${AUDIT_RETENTION_PASSWORD:?AUDIT_RETENTION_PASSWORD must come from the retention secret}"

if [[ "${PGSSLMODE:-verify-full}" != verify-full ]]; then
  printf '%s\n' 'PGSSLMODE must be verify-full.' >&2
  exit 1
fi

validate_role_name() {
  local value=$1
  if [[ ! $value =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then
    printf 'Invalid PostgreSQL role name: %s\n' "$value" >&2
    exit 1
  fi
}

quote_identifier() {
  printf '"%s"' "$1"
}

quote_literal() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

for role in "$AUDIT_API_ROLE" "$AUDIT_OWNER_ROLE" "$AUDIT_INGEST_ROLE" "$AUDIT_RETENTION_ROLE"; do
  validate_role_name "$role"
done

if [[ $(printf '%s\n' "$AUDIT_API_ROLE" "$AUDIT_OWNER_ROLE" "$AUDIT_INGEST_ROLE" "$AUDIT_RETENTION_ROLE" | sort -u | wc -l) -ne 4 ]]; then
  printf '%s\n' 'Audit API, owner, ingest and retention roles must be distinct.' >&2
  exit 1
fi

api_role=$(quote_identifier "$AUDIT_API_ROLE")
owner_role=$(quote_identifier "$AUDIT_OWNER_ROLE")
ingest_role=$(quote_identifier "$AUDIT_INGEST_ROLE")
retention_role=$(quote_identifier "$AUDIT_RETENTION_ROLE")
ingest_password=$(quote_literal "$AUDIT_INGEST_PASSWORD")
retention_password=$(quote_literal "$AUDIT_RETENTION_PASSWORD")
owner_literal=$(quote_literal "$AUDIT_OWNER_ROLE")
ingest_literal=$(quote_literal "$AUDIT_INGEST_ROLE")
retention_literal=$(quote_literal "$AUDIT_RETENTION_ROLE")

psql --set ON_ERROR_STOP=1 <<SQL
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = $owner_literal) THEN
    CREATE ROLE $owner_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE $owner_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = $ingest_literal) THEN
    CREATE ROLE $ingest_role LOGIN PASSWORD $ingest_password NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE $ingest_role LOGIN PASSWORD $ingest_password NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = $retention_literal) THEN
    CREATE ROLE $retention_role LOGIN PASSWORD $retention_password NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE $retention_role LOGIN PASSWORD $retention_password NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
\$do\$;

DO \$check\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'audit') THEN
    RAISE EXCEPTION 'audit schema is missing; apply migration 039 before provisioning roles';
  END IF;
END
\$check\$;

ALTER SCHEMA audit OWNER TO $owner_role;
ALTER TABLE audit.evidence OWNER TO $owner_role;
ALTER TABLE audit.release_attestations OWNER TO $owner_role;

REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON TABLE audit.evidence, audit.release_attestations FROM PUBLIC;
REVOKE ALL ON TABLE audit.evidence, audit.release_attestations FROM $api_role, $ingest_role, $retention_role;

GRANT USAGE ON SCHEMA audit TO $api_role, $ingest_role, $retention_role;
GRANT SELECT ON TABLE audit.evidence, audit.release_attestations TO $api_role;
GRANT INSERT, UPDATE ON TABLE audit.evidence, audit.release_attestations TO $ingest_role;
GRANT DELETE ON TABLE audit.evidence, audit.release_attestations TO $retention_role;

ALTER DEFAULT PRIVILEGES FOR ROLE $owner_role IN SCHEMA audit REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE $owner_role IN SCHEMA audit GRANT SELECT ON TABLES TO $api_role;
ALTER DEFAULT PRIVILEGES FOR ROLE $owner_role IN SCHEMA audit GRANT INSERT, UPDATE ON TABLES TO $ingest_role;
ALTER DEFAULT PRIVILEGES FOR ROLE $owner_role IN SCHEMA audit GRANT DELETE ON TABLES TO $retention_role;
SQL

unset PGPASSWORD AUDIT_INGEST_PASSWORD AUDIT_RETENTION_PASSWORD
printf '%s\n' 'Audit PostgreSQL roles provisioned without exposing credentials.'
