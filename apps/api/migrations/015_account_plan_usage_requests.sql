CREATE TABLE IF NOT EXISTS account_plan_usage_requests (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES plans(code),
  usage_date date NOT NULL,
  idempotency_hash text NOT NULL CHECK (idempotency_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('reserved', 'committed', 'released')),
  response_json jsonb,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, plan_code, idempotency_hash)
);

CREATE INDEX IF NOT EXISTS account_plan_usage_requests_date_state_idx
  ON account_plan_usage_requests (user_id, plan_code, usage_date, state, reserved_at);

CREATE INDEX IF NOT EXISTS account_plan_usage_requests_expiry_idx
  ON account_plan_usage_requests (expires_at, user_id, plan_code, idempotency_hash);
