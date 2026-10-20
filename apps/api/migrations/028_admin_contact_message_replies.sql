CREATE TABLE IF NOT EXISTS admin_contact_message_replies (
  contact_message_id uuid PRIMARY KEY
    REFERENCES contact_messages(id) ON DELETE CASCADE,
  admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'previewed', 'uncertain')),
  attempt_count integer NOT NULL DEFAULT 1
    CHECK (attempt_count BETWEEN 1 AND 2),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
