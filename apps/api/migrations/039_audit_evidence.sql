-- deployment-rollback-compatible: true
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.evidence (
  resource text PRIMARY KEY CHECK (resource IN (
    'infrastructure', 'auth', 'quality', 'privacy'
  )),
  observed_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > observed_at)
);

CREATE TABLE IF NOT EXISTS audit.release_attestations (
  deployment_sha char(40) PRIMARY KEY CHECK (deployment_sha ~ '^[a-f0-9]{40}$'),
  environment text NOT NULL CHECK (environment = 'production'),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  signature text NOT NULL CHECK (signature <> ''),
  observed_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > observed_at)
);

CREATE INDEX IF NOT EXISTS audit_release_attestations_latest_idx
  ON audit.release_attestations (observed_at DESC);

COMMENT ON SCHEMA audit IS
  'Evidence-only store. It must be provisioned with separate writer and reader roles.';
