ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_previous_refresh_hash_idx
  ON auth_sessions (previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;
