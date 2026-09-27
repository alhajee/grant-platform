BEGIN;
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS custom_activity TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE WHEN workstream='sbmc' THEN 8 ELSE 5 END
);
COMMIT;
