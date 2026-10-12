-- Quality Assurance update from the client's observations (October 2026), lib/activity-extras.ts.
-- 1. New activity 11 "Server renewal and dashboard"; Others (specify) moves from 11 to 12 so it stays last
--    (saved Others lines move with it). The activity and custom-activity CHECKs follow.
-- 2. Mobility and office equipment (0) and its maintenance (1) record a category, Mobility or Office equipment,
--    beside the type (equipment_category). Earlier equipment lines get the category their type implies
--    ("Motorcycles" also becomes the listed "Motorcycle"); typed types that imply none stay blank until edited.
-- Activity percentages are enforced by the APIs (activityShareCaps / activityShareGroups), not here.
-- Idempotent.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_custom_activity_check;

-- Others (specify) 11 -> 12, only while line 12 does not exist yet (re-runs leave it alone).
UPDATE activity_plan_lines SET activity = 12
WHERE workstream = 'quality' AND activity = 11 AND custom_activity <> ''
  AND NOT EXISTS (SELECT 1 FROM activity_plan_lines WHERE workstream = 'quality' AND activity = 12);

ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 17 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 5 WHEN 'gscci' THEN 10 WHEN 'curriculum' THEN 5 WHEN 'quality' THEN 13 WHEN 'ict' THEN 10 WHEN 'teachers' THEN 19 WHEN 'planning' THEN 7 ELSE 0 END
);
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_custom_activity_check CHECK (
  custom_activity = btrim(custom_activity) AND char_length(custom_activity) <= 160 AND
  CASE
    WHEN workstream = 'tlm' AND activity = 4 THEN TRUE
    WHEN activity = CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 22 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 9 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 12 WHEN 'ict' THEN 9 WHEN 'teachers' THEN 18 WHEN 'planning' THEN 6 END
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

ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS equipment_category TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_equipment_category_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_equipment_category_check CHECK (equipment_category IN ('', 'Mobility', 'Office equipment'));

UPDATE activity_plan_lines SET equipment_category = 'Mobility', equipment_type = CASE equipment_type WHEN 'Motorcycles' THEN 'Motorcycle' ELSE equipment_type END
WHERE workstream = 'quality' AND activity = 0 AND equipment_category = '' AND equipment_type IN ('Motorcycles', 'Vehicles');
UPDATE activity_plan_lines SET equipment_category = 'Office equipment'
WHERE workstream = 'quality' AND activity = 0 AND equipment_category = '' AND equipment_type LIKE 'Office equipment%';

COMMIT;
