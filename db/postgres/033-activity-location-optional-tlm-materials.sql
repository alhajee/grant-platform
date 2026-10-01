-- SBMC/TLM lines no longer collect a Rural/Urban location (UBEC17, UBEC22); existing values are kept.
-- TLM activities gain the UBEC allowable-materials checklist as indexes 5-22; legacy 0-4 stay valid.
BEGIN;
ALTER TABLE activity_plan_lines ALTER COLUMN location SET DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_location_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_location_check CHECK (location IN ('', 'Rural', 'Urban'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE WHEN workstream='sbmc' THEN 8 ELSE 23 END
);
COMMIT;
