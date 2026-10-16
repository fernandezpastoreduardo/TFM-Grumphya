-- Bind a submission key to the evaluated payload without retaining idea text.
ALTER TABLE approved_ideas
  ADD COLUMN IF NOT EXISTS submission_hash text;
ALTER TABLE approved_ideas
  ADD COLUMN IF NOT EXISTS request_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS approved_ideas_user_submission_hash_idx
  ON approved_ideas (user_id, submission_hash);
