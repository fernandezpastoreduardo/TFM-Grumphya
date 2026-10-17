-- Private rejected-idea counts are attributed only to authenticated users.
-- Account deletion physically removes these rows through the owner FK.
CREATE TABLE IF NOT EXISTS user_rejected_ideas (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rejected_idea_id uuid NOT NULL REFERENCES rejected_ideas(id) ON DELETE CASCADE,
  submission_count bigint NOT NULL DEFAULT 1 CHECK (submission_count > 0),
  last_submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rejected_idea_id)
);

CREATE INDEX IF NOT EXISTS user_rejected_ideas_user_count_idx
  ON user_rejected_ideas (user_id, submission_count DESC, rejected_idea_id);
