ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS confirmation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_error_code varchar(80);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_confirmation_status_check'
  ) THEN
    ALTER TABLE contact_messages ADD CONSTRAINT contact_messages_confirmation_status_check
      CHECK (confirmation_status IN ('not_requested', 'pending', 'sending', 'sent', 'previewed', 'failed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_confirmation_attempts_check'
  ) THEN
    ALTER TABLE contact_messages ADD CONSTRAINT contact_messages_confirmation_attempts_check
      CHECK (confirmation_attempts BETWEEN 0 AND 3);
  END IF;
END $$;

ALTER TABLE contact_messages
  ALTER COLUMN confirmation_status SET DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS contact_messages_user_idempotency_key_idx
  ON contact_messages (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
