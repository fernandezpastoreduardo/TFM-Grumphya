CREATE TABLE IF NOT EXISTS anonymous_analytics_daily (
  metric_date date NOT NULL,
  event_name text NOT NULL CHECK (event_name IN ('page_view', 'plan_selection')),
  page_code text NOT NULL CHECK (page_code IN (
    'home', 'precios', 'buenas-practicas', 'humanos-notables',
    'lo-peor-de-lo-peor', 'contacto', 'descargate'
  )),
  device_class text NOT NULL CHECK (device_class IN ('mobile', 'desktop')),
  plan_code text NOT NULL DEFAULT '' CHECK (plan_code IN ('', 'ILUMINADO', 'FALTON')),
  event_count bigint NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (metric_date, event_name, page_code, device_class, plan_code),
  CHECK ((event_name = 'page_view' AND plan_code = '') OR
         (event_name = 'plan_selection' AND page_code = 'precios' AND plan_code IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS anonymous_analytics_daily_date_idx
  ON anonymous_analytics_daily (metric_date DESC);
