ALTER TABLE rejected_ideas
  ADD COLUMN IF NOT EXISTS rubric_score numeric(4, 2)
  CHECK (rubric_score IS NULL OR (rubric_score >= 0 AND rubric_score <= 10));
