ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS verification_resend_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_last_sent_at timestamptz;

UPDATE pending_registrations
SET verification_last_sent_at = now()
WHERE verification_last_sent_at IS NULL;

ALTER TABLE pending_registrations
  ALTER COLUMN verification_last_sent_at SET DEFAULT now();
