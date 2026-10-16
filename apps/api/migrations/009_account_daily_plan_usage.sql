-- Cuenta de intentos diaria por usuario y plan. La fecha de corte se calcula
-- en Europe/Madrid para respetar el reinicio local a medianoche y DST.
CREATE TABLE IF NOT EXISTS account_daily_plan_usage (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES plans(code),
  usage_date date NOT NULL,
  ideas_used integer NOT NULL DEFAULT 0 CHECK (ideas_used >= 0),
  roasts_used integer NOT NULL DEFAULT 0 CHECK (roasts_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_code, usage_date)
);

CREATE INDEX IF NOT EXISTS account_daily_plan_usage_date_idx
  ON account_daily_plan_usage (usage_date);
