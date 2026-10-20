CREATE TABLE IF NOT EXISTS password_reset_tokens (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  request_window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND 3),
  last_requested_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens(expires_at);
