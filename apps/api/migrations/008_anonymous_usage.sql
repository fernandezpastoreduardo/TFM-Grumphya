CREATE TABLE IF NOT EXISTS anonymous_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anonymous_usage_counters (
  visitor_id uuid NOT NULL REFERENCES anonymous_visitors(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('ideas', 'roasts')),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count BETWEEN 0 AND 3),
  reserved_count integer NOT NULL DEFAULT 0 CHECK (reserved_count BETWEEN 0 AND 3),
  CHECK (used_count + reserved_count <= 3),
  PRIMARY KEY (visitor_id, scope)
);

CREATE TABLE IF NOT EXISTS anonymous_usage_requests (
  visitor_id uuid NOT NULL REFERENCES anonymous_visitors(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('ideas', 'roasts')),
  idempotency_hash text NOT NULL CHECK (idempotency_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('reserved', 'committed', 'released')),
  response_json jsonb,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (visitor_id, scope, idempotency_hash)
);

CREATE INDEX IF NOT EXISTS anonymous_usage_requests_expiry_idx
  ON anonymous_usage_requests (expires_at);

CREATE TABLE IF NOT EXISTS anonymous_ip_activity (
  ip_hmac text PRIMARY KEY CHECK (ip_hmac ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  profiles_created integer NOT NULL CHECK (profiles_created >= 0),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS anonymous_ip_activity_expiry_idx
  ON anonymous_ip_activity (expires_at);
