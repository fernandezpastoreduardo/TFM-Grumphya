ALTER TABLE rejected_idea_idempotency
  ADD COLUMN IF NOT EXISTS request_hash text;
