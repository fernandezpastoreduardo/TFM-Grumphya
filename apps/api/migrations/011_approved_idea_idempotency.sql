-- Keep retries of an authenticated evaluation from adding duplicate history.
-- Legacy rows may have no submission hash; every new write supplies one.
ALTER TABLE approved_ideas
  ADD COLUMN IF NOT EXISTS submission_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS approved_ideas_user_submission_hash_idx
  ON approved_ideas (user_id, submission_hash);
