CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject varchar(120) NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_user_created_at_idx
  ON contact_messages (user_id, created_at DESC);
