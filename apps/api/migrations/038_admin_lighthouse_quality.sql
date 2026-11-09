-- deployment-rollback-compatible: true
CREATE TABLE IF NOT EXISTS admin_lighthouse_quality_runs (
  commit_sha char(40) NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
  measured_at timestamptz NOT NULL,
  page_code text NOT NULL CHECK (page_code IN ('home', 'precios', 'lo-peor-de-lo-peor')),
  device_class text NOT NULL CHECK (device_class IN ('mobile', 'desktop')),
  sample_count smallint NOT NULL CHECK (sample_count = 3),
  performance real NOT NULL CHECK (performance BETWEEN 0 AND 1),
  accessibility real NOT NULL CHECK (accessibility BETWEEN 0 AND 1),
  best_practices real NOT NULL CHECK (best_practices BETWEEN 0 AND 1),
  seo real NOT NULL CHECK (seo BETWEEN 0 AND 1),
  lcp_ms real CHECK (lcp_ms >= 0),
  cls real CHECK (cls >= 0),
  tbt_ms real CHECK (tbt_ms >= 0),
  speed_index_ms real CHECK (speed_index_ms >= 0),
  PRIMARY KEY (commit_sha, page_code, device_class)
);

CREATE INDEX IF NOT EXISTS admin_lighthouse_quality_runs_latest_idx
  ON admin_lighthouse_quality_runs (measured_at DESC);
