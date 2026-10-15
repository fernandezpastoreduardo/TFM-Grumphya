ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS verified_token_expires_at timestamptz;
