ALTER TABLE admin_ai_usage_events
  ADD COLUMN actor_type text;

UPDATE admin_ai_usage_events usage
SET actor_type = CASE
  WHEN usage.user_id IS NULL THEN 'anonymous'
  WHEN EXISTS (
    SELECT 1 FROM users user_account
    WHERE user_account.id = usage.user_id AND user_account.role = 'admin'
  ) THEN 'admin'
  ELSE 'registered_user'
END;

ALTER TABLE admin_ai_usage_events
  ALTER COLUMN actor_type SET NOT NULL,
  ADD CONSTRAINT admin_ai_usage_events_actor_type_check
    CHECK (actor_type IN ('registered_user', 'admin', 'anonymous'));

CREATE INDEX admin_ai_usage_events_actor_occurred_at_idx
  ON admin_ai_usage_events (actor_type, occurred_at DESC);
