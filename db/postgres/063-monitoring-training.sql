-- Supervision & Monitoring gets a "Training" activity (client request, October 2026, lib/activity-plans.ts).
-- It takes index 4; Others (specify) moves from 4 to 5 so it stays last (saved Others lines move with it).
-- The activity and custom-activity CHECKs follow. UBEC round snapshots are untouched (older snapshots read
-- activity 4 as Training; their custom name still shows). Idempotent.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_custom_activity_check;

-- Others (specify) 4 -> 5: only named lines (Others always has a custom name), so re-runs leave Training lines alone.
UPDATE activity_plan_lines SET activity = 5
WHERE workstream = 'monitoring' AND activity = 4 AND custom_activity <> '';

ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 17 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 6 WHEN 'gscci' THEN 10 WHEN 'curriculum' THEN 5 WHEN 'quality' THEN 13 WHEN 'ict' THEN 10 WHEN 'teachers' THEN 19 WHEN 'planning' THEN 7 ELSE 0 END
);
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_custom_activity_check CHECK (
  custom_activity = btrim(custom_activity) AND char_length(custom_activity) <= 160 AND
  CASE
    WHEN workstream = 'tlm' AND activity = 4 THEN TRUE
    WHEN activity = CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 22 WHEN 'monitoring' THEN 5 WHEN 'gscci' THEN 9 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 12 WHEN 'ict' THEN 9 WHEN 'teachers' THEN 18 WHEN 'planning' THEN 6 END
      THEN custom_activity <> ''
    ELSE custom_activity = ''
  END
) NOT VALID;
DO $$
BEGIN
  ALTER TABLE activity_plan_lines VALIDATE CONSTRAINT activity_plan_lines_custom_activity_check;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'activity_plan_lines_custom_activity_check left NOT VALID: some saved lines do not follow the activity name rule.';
END $$;

COMMIT;
