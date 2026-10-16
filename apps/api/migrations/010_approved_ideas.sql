-- Approved idea titles are private account data. The original idea text is not
-- copied here, and deleting the owner physically deletes these rows.
CREATE TABLE IF NOT EXISTS approved_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 160
    AND title = btrim(title)
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approved_ideas_user_created_idx
  ON approved_ideas (user_id, created_at DESC, id DESC);
