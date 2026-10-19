ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS monthly_price_eur numeric(8,2) NOT NULL DEFAULT 0;
UPDATE plans SET monthly_price_eur = CASE code
  WHEN 'ILUMINADO' THEN 2.00
  WHEN 'FALTON' THEN 1.00
  ELSE monthly_price_eur
END
WHERE monthly_price_eur = 0;

ALTER TABLE simulated_purchases
  ADD COLUMN IF NOT EXISTS amount_eur numeric(8,2) NOT NULL DEFAULT 0;
UPDATE simulated_purchases purchase
SET amount_eur = plan.monthly_price_eur
FROM subscriptions subscription
JOIN plans plan ON plan.code = subscription.plan_code
WHERE purchase.subscription_id = subscription.id AND purchase.amount_eur = 0;

CREATE TABLE IF NOT EXISTS admin_ai_usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('idea_evaluation', 'idea_fingerprint', 'idea_similarity', 'idea_embedding', 'roast')),
  model text NOT NULL,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  estimated_cost_usd numeric(16,10),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_ai_usage_events_occurred_at_idx
  ON admin_ai_usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS admin_ai_usage_events_user_occurred_at_idx
  ON admin_ai_usage_events (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS application_error_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  error_code varchar(100) NOT NULL,
  status_code integer NOT NULL CHECK (status_code BETWEEN 400 AND 599),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS application_error_events_occurred_at_idx
  ON application_error_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS application_error_events_code_occurred_at_idx
  ON application_error_events (error_code, occurred_at DESC);
