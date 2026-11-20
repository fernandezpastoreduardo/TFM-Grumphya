-- deployment-rollback-compatible: true
-- deployment-schema-change: replace-audit-evidence-shape-check
ALTER TABLE audit.evidence
  DROP CONSTRAINT IF EXISTS evidence_items_check;

UPDATE audit.evidence
SET items = jsonb_build_object('legacyItems', items)
WHERE jsonb_typeof(items) = 'array';

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_items_object_check'
      AND conrelid = 'audit.evidence'::regclass
  ) THEN
    ALTER TABLE audit.evidence
      ADD CONSTRAINT evidence_items_object_check
      CHECK (jsonb_typeof(items) = 'object');
  END IF;
END
$constraints$;
