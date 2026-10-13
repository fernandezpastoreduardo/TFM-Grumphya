ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS simulated_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  subscription_id uuid NOT NULL UNIQUE REFERENCES subscriptions(id),
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NOT NULL
);
