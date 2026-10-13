CREATE TABLE IF NOT EXISTS plans (
  code text PRIMARY KEY CHECK (code IN ('ILUMINADO', 'FALTON')),
  ideas_per_day integer NOT NULL CHECK (ideas_per_day >= 0),
  roasts_per_day integer NOT NULL CHECK (roasts_per_day >= 0),
  validity_months integer NOT NULL CHECK (validity_months > 0)
);

INSERT INTO plans (code, ideas_per_day, roasts_per_day, validity_months)
VALUES ('ILUMINADO', 11, 0, 1), ('FALTON', 0, 11, 1)
ON CONFLICT (code) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_intents_plan_code_fkey') THEN
    ALTER TABLE registration_intents ADD CONSTRAINT registration_intents_plan_code_fkey
      FOREIGN KEY (plan_code) REFERENCES plans(code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_registrations_plan_code_fkey') THEN
    ALTER TABLE pending_registrations ADD CONSTRAINT pending_registrations_plan_code_fkey
      FOREIGN KEY (plan_code) REFERENCES plans(code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_code_fkey') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_code_fkey
      FOREIGN KEY (plan_code) REFERENCES plans(code);
  END IF;
END $$;
