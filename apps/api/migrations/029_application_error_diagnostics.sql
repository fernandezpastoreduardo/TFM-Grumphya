ALTER TABLE application_error_events
  ADD COLUMN IF NOT EXISTS diagnostic_code varchar(100);
