-- Retain only a generic safe title and aggregate count while the idea is active.
CREATE TABLE IF NOT EXISTS rejected_idea_all_time_counts (
  rejected_idea_id uuid PRIMARY KEY,
  safe_title text NOT NULL CHECK (length(safe_title) BETWEEN 1 AND 160),
  submission_count bigint NOT NULL CHECK (submission_count > 0),
  last_received_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rejected_idea_all_time_counts_last_received_idx
  ON rejected_idea_all_time_counts (last_received_at);

INSERT INTO rejected_idea_all_time_counts
  (rejected_idea_id, safe_title, submission_count, last_received_at)
SELECT id, safe_title, count, last_received_at
FROM rejected_ideas
ON CONFLICT (rejected_idea_id) DO UPDATE
SET safe_title = EXCLUDED.safe_title,
    submission_count = GREATEST(
      rejected_idea_all_time_counts.submission_count,
      EXCLUDED.submission_count
    ),
    last_received_at = GREATEST(
      rejected_idea_all_time_counts.last_received_at,
      EXCLUDED.last_received_at
    );
