CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rejected_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_title text NOT NULL CHECK (length(safe_title) BETWEEN 1 AND 160),
  embedding vector(1536) NOT NULL,
  count bigint NOT NULL DEFAULT 1 CHECK (count > 0),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  embedding_source text NOT NULL,
  embedding_version text NOT NULL,
  embedding_dimension integer NOT NULL CHECK (embedding_dimension = 1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rejected_ideas_embedding_hnsw_idx
  ON rejected_ideas USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS rejected_idea_idempotency (
  idempotency_hash text PRIMARY KEY,
  submission_type text NOT NULL CHECK (submission_type IN ('match', 'new_rejection')),
  rejected_idea_id uuid REFERENCES rejected_ideas(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  continue_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rejected_idea_idempotency_expires_at_idx
  ON rejected_idea_idempotency (expires_at);

CREATE TABLE IF NOT EXISTS rejected_idea_weekly_counts (
  rejected_idea_id uuid NOT NULL REFERENCES rejected_ideas(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  rejected_count bigint NOT NULL CHECK (rejected_count > 0),
  PRIMARY KEY (rejected_idea_id, week_start)
);
