CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  username text NOT NULL,
  username_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  privacy_policy_version text NOT NULL,
  privacy_policy_acknowledged_at timestamptz NOT NULL,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'pending_email_verification' CHECK (status IN ('pending_email_verification', 'email_verified', 'active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_normalized text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_normalized text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_version text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_acknowledged_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
UPDATE users SET username_normalized = lower(username) WHERE username_normalized IS NULL;
UPDATE users SET email_normalized = lower(email) WHERE email IS NOT NULL AND email_normalized IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_key ON users(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_key ON users(username_normalized) WHERE username_normalized IS NOT NULL;

CREATE TABLE IF NOT EXISTS registration_intents (
  token_hash text PRIMARY KEY,
  plan_code text NOT NULL CHECK (plan_code IN ('ILUMINADO', 'FALTON')),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_code text NOT NULL CHECK (plan_code IN ('ILUMINADO', 'FALTON')),
  verification_token_hash text NOT NULL UNIQUE,
  verification_expires_at timestamptz NOT NULL,
  verified_token_hash text UNIQUE,
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  plan_code text NOT NULL CHECK (plan_code IN ('ILUMINADO', 'FALTON')),
  status text NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  activation_source text NOT NULL CHECK (activation_source = 'simulated'),
  idempotency_key uuid NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS simulated_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  subscription_id uuid NOT NULL UNIQUE REFERENCES subscriptions(id),
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NOT NULL
);
