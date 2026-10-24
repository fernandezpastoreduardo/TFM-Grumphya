-- deployment-rollback-compatible: true
ALTER TABLE application_error_events
  ADD COLUMN IF NOT EXISTS context_json jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'application_error_events_context_json_check'
  ) THEN
    ALTER TABLE application_error_events
      ADD CONSTRAINT application_error_events_context_json_check
      CHECK (
        context_json IS NULL OR (
          jsonb_typeof(context_json) = 'object'
          AND context_json->>'useCase' = 'idea_evaluation'
          AND jsonb_typeof(context_json->'inputText') = 'string'
          AND length(context_json->>'inputText') <= 2000
        )
      );
  END IF;
END $$;
