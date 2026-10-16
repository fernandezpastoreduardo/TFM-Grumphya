ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS remember_me boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS auth_sessions_access_active_idx
  ON auth_sessions(access_token_hash, expires_at)
  WHERE revoked_at IS NULL;
