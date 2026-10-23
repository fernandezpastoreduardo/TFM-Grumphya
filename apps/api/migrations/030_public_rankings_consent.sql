-- deployment-rollback-compatible: true
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_rankings_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_rankings_consent_policy_version text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_public_rankings_consent_pair_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_public_rankings_consent_pair_check
      CHECK ((public_rankings_consent_at IS NULL) = (public_rankings_consent_policy_version IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_public_rankings_consent_idx
  ON users (public_rankings_consent_at)
  WHERE public_rankings_consent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS anonymous_visitors_last_seen_idx
  ON anonymous_visitors (last_seen_at);
CREATE INDEX IF NOT EXISTS rejected_ideas_last_received_idx
  ON rejected_ideas (last_received_at);
CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON contact_messages (created_at);
CREATE INDEX IF NOT EXISTS account_roast_message_events_created_at_idx
  ON account_roast_message_events (created_at);
