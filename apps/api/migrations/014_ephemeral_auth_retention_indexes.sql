CREATE INDEX IF NOT EXISTS registration_intents_expires_at_idx
  ON registration_intents (expires_at, token_hash);

CREATE INDEX IF NOT EXISTS auth_sessions_revoked_cleanup_idx
  ON auth_sessions (revoked_at, id)
  WHERE revoked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_expired_cleanup_idx
  ON auth_sessions (expires_at, id)
  WHERE revoked_at IS NULL;
