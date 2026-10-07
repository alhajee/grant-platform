-- "Others (specify)": every activity-line component gets a last activity whose lines name their own activity in
-- custom_activity (Teacher Development 18 and TLM 22 "Other TLMs" already had one). New indexes: SBMC 16,
-- Supervision & Monitoring 4, GSCCI 9, Curriculum 4, Quality Assurance 11, ICT 9, Planning 6. Existing indexes keep
-- their meaning. Additive and idempotent: no line is changed.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 17 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 5 WHEN 'gscci' THEN 10 WHEN 'curriculum' THEN 5 WHEN 'quality' THEN 12 WHEN 'ict' THEN 10 WHEN 'teachers' THEN 19 WHEN 'planning' THEN 7 ELSE 0 END
);

-- The activity name: required (trimmed, up to 160 characters) on an Others line, empty on every other line.
-- TLM 4 is the retired "Others" activity from before the materials checklist; its saved lines may or may not have a name.
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_custom_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_custom_activity_check CHECK (
  custom_activity = btrim(custom_activity) AND char_length(custom_activity) <= 160 AND
  CASE
    WHEN workstream = 'tlm' AND activity = 4 THEN TRUE
    WHEN activity = CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 22 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 9 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 11 WHEN 'ict' THEN 9 WHEN 'teachers' THEN 18 WHEN 'planning' THEN 6 END
      THEN custom_activity <> ''
    ELSE custom_activity = ''
  END
) NOT VALID;

COMMIT;

-- Check the saved lines separately so an unexpected older row cannot block the deployment: the rule still applies to
-- every new or edited line, and a later run validates it once such rows are fixed.
DO $$
BEGIN
  ALTER TABLE activity_plan_lines VALIDATE CONSTRAINT activity_plan_lines_custom_activity_check;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'activity_plan_lines_custom_activity_check left NOT VALID: some saved lines do not follow the activity name rule.';
END $$;
