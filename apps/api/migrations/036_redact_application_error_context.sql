UPDATE application_error_events
SET context_json = NULL
WHERE context_json IS NOT NULL;
