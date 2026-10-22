-- ICT: does the state already have UBEC-SUBEB Connect? (client, October 2026, UBEC123). NULL = not answered yet;
-- 'has' = a UBEC HQ waiver (component_documents, component 'ict', kind 'connect_waiver') replaces the required
-- "Maintenance of UBEC-SUBEB Connect" activity; 'needs' = that activity stays required. Plans that already budget the
-- activity are answered 'needs', so nothing they have planned changes. Idempotent.
BEGIN;

ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS ict_connect TEXT;
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_ict_connect_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_ict_connect_check CHECK (ict_connect IS NULL OR ict_connect IN ('has', 'needs'));
UPDATE action_plans p SET ict_connect = 'needs' WHERE p.ict_connect IS NULL
  AND EXISTS (SELECT 1 FROM activity_plan_lines l WHERE l.plan_id = p.id AND l.workstream = 'ict' AND l.activity = 3);

ALTER TABLE component_documents DROP CONSTRAINT IF EXISTS component_documents_component_check;
ALTER TABLE component_documents ADD CONSTRAINT component_documents_component_check CHECK (component IN ('monitoring', 'ict'));
ALTER TABLE component_documents DROP CONSTRAINT IF EXISTS component_documents_kind_check;
ALTER TABLE component_documents ADD CONSTRAINT component_documents_kind_check CHECK (kind IN ('proforma', 'connect_waiver'));
ALTER TABLE component_documents DROP CONSTRAINT IF EXISTS component_documents_kind_component_check;
ALTER TABLE component_documents ADD CONSTRAINT component_documents_kind_component_check
  CHECK ((component = 'monitoring' AND kind = 'proforma') OR (component = 'ict' AND kind = 'connect_waiver'));

COMMIT;
