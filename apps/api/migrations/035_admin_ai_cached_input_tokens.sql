-- deployment-rollback-compatible: true
ALTER TABLE admin_ai_usage_events
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_ai_usage_cached_input_tokens_check'
  ) THEN
    ALTER TABLE admin_ai_usage_events
      ADD CONSTRAINT admin_ai_usage_cached_input_tokens_check
      CHECK (cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens);
  END IF;
END $$;
