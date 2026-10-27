ALTER TABLE rejected_idea_idempotency
  ADD COLUMN IF NOT EXISTS generated_headline text;
