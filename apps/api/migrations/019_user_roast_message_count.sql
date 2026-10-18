ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roast_messages_sent bigint NOT NULL DEFAULT 0;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_roast_messages_sent_nonnegative;

ALTER TABLE users
  ADD CONSTRAINT users_roast_messages_sent_nonnegative
  CHECK (roast_messages_sent >= 0);
