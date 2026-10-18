CREATE TABLE IF NOT EXISTS account_roast_message_events (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_hash)
);
