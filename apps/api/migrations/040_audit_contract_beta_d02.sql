-- deployment-rollback-compatible: true
ALTER TABLE audit.evidence
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS deployment_digest text NOT NULL DEFAULT ('sha256:' || repeat('0', 64)),
  ADD COLUMN IF NOT EXISTS cardinality integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS jwt_kid text NOT NULL DEFAULT 'ds-auditor-2026',
  ADD COLUMN IF NOT EXISTS attestation jsonb NOT NULL DEFAULT '{"alg":"EdDSA","kid":"","signature":""}'::jsonb;

ALTER TABLE audit.release_attestations
  ADD COLUMN IF NOT EXISTS kid text NOT NULL DEFAULT 'grumphya-release-2026';

ALTER TABLE audit.evidence DROP CONSTRAINT IF EXISTS evidence_resource_check;
ALTER TABLE audit.evidence
  ADD CONSTRAINT evidence_resource_check CHECK (resource IN (
    'infrastructure', 'deployment', 'dependencies', 'auth', 'quality', 'privacy', 'ai'
  ));

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_environment_check'
      AND conrelid = 'audit.evidence'::regclass
  ) THEN
    ALTER TABLE audit.evidence
      ADD CONSTRAINT evidence_environment_check CHECK (environment = 'production');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_deployment_digest_check'
      AND conrelid = 'audit.evidence'::regclass
  ) THEN
    ALTER TABLE audit.evidence
      ADD CONSTRAINT evidence_deployment_digest_check
      CHECK (deployment_digest ~ '^sha256:[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_cardinality_check'
      AND conrelid = 'audit.evidence'::regclass
  ) THEN
    ALTER TABLE audit.evidence
      ADD CONSTRAINT evidence_cardinality_check CHECK (cardinality = 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_attestation_object_check'
      AND conrelid = 'audit.evidence'::regclass
  ) THEN
    ALTER TABLE audit.evidence
      ADD CONSTRAINT evidence_attestation_object_check
      CHECK (jsonb_typeof(attestation) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_jwt_kid_check'
      AND conrelid = 'audit.evidence'::regclass
  ) THEN
    ALTER TABLE audit.evidence
      ADD CONSTRAINT evidence_jwt_kid_check CHECK (jwt_kid <> '');
  END IF;
END
$constraints$;
