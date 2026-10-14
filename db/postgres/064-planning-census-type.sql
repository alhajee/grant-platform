-- Planning, EMIS & Data Platform: "Conduct annual school census" (activity 0) lines name the type of census, Annual
-- School Census or NPA (client request, October 2026, lib/activity-extras.ts censusTypes). Required by the line
-- schema on save; the database checks the value and that only that activity uses it. Earlier lines keep '' until
-- edited. Additive and idempotent.
BEGIN;

ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS census_type TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_census_type_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_census_type_check
  CHECK (census_type IN ('', 'Annual School Census', 'NPA') AND (census_type = '' OR (workstream = 'planning' AND activity = 0)));

COMMIT;
