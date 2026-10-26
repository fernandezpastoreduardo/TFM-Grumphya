-- deployment-rollback-compatible: true
UPDATE users
SET public_rankings_consent_at = now(),
    public_rankings_consent_policy_version = 'v2'
WHERE role = 'admin'
  AND username_normalized = 'jappy'
  AND public_rankings_consent_at IS NULL;
