-- Teacher Development lines may cover SUBEB staff as well as ECCDE, Primary and JSS (trainingSchoolLevels in
-- lib/teacher-development.ts). Widens the migration 040 check. Additive and idempotent.
BEGIN;
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_school_levels_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_school_levels_check CHECK (school_levels <@ ARRAY['ECCDE', 'Primary', 'JSS', 'SUBEB']::TEXT[]);
COMMIT;
