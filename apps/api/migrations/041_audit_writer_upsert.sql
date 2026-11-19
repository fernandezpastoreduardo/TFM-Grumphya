-- deployment-rollback-compatible: true
-- deployment-schema-change: add-audit-writer-upsert
CREATE OR REPLACE FUNCTION audit.upsert_evidence(
  p_resource text,
  p_observed_at timestamptz,
  p_valid_until timestamptz,
  p_environment text,
  p_deployment_digest text,
  p_cardinality integer,
  p_jwt_kid text,
  p_items jsonb,
  p_attestation jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, pg_catalog
AS $function$
BEGIN
  update audit.evidence
  SET observed_at = p_observed_at,
      valid_until = p_valid_until,
      environment = p_environment,
      deployment_digest = p_deployment_digest,
      cardinality = p_cardinality,
      jwt_kid = p_jwt_kid,
      items = p_items,
      attestation = p_attestation
  WHERE resource = p_resource;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO audit.evidence (
        resource,
        observed_at,
        valid_until,
        environment,
        deployment_digest,
        cardinality,
        jwt_kid,
        items,
        attestation
      )
      VALUES (
        p_resource,
        p_observed_at,
        p_valid_until,
        p_environment,
        p_deployment_digest,
        p_cardinality,
        p_jwt_kid,
        p_items,
        p_attestation
      );
    EXCEPTION WHEN unique_violation THEN
      update audit.evidence
      SET observed_at = p_observed_at,
          valid_until = p_valid_until,
          environment = p_environment,
          deployment_digest = p_deployment_digest,
          cardinality = p_cardinality,
          jwt_kid = p_jwt_kid,
          items = p_items,
          attestation = p_attestation
      WHERE resource = p_resource;
    END;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION audit.upsert_evidence(
  text,
  timestamptz,
  timestamptz,
  text,
  text,
  integer,
  text,
  jsonb,
  jsonb
) FROM PUBLIC;

DO $roles$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'grumphya_audit_owner') THEN
    ALTER FUNCTION audit.upsert_evidence(
      text,
      timestamptz,
      timestamptz,
      text,
      text,
      integer,
      text,
      jsonb,
      jsonb
    ) OWNER TO grumphya_audit_owner;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'grumphya_audit_writer') THEN
    GRANT EXECUTE ON FUNCTION audit.upsert_evidence(
      text,
      timestamptz,
      timestamptz,
      text,
      text,
      integer,
      text,
      jsonb,
      jsonb
    ) TO grumphya_audit_writer;
  END IF;
END;
$roles$;
