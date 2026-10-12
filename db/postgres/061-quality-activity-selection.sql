-- Quality Assurance: the state chooses its optional activities up front (October 2026, lib/activity-selection.ts).
-- The compulsory activities are always included; quality_activities lists the optional ones chosen (Mobility and
-- office equipment 0, its maintenance 1, Literacy and Numeracy 4, Server renewal and dashboard 11). NULL = not chosen
-- yet, so no Quality Assurance items can be added. Activity caps are scaled so the chosen activities share the whole
-- allocation (the APIs enforce them).
-- Plans that already have Quality Assurance items start with the optional activities those items use. Idempotent.
BEGIN;

ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS quality_activities SMALLINT[];
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_quality_activities_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_quality_activities_check CHECK (
  quality_activities IS NULL OR (array_position(quality_activities, NULL) IS NULL AND quality_activities <@ ARRAY[0, 1, 4, 11]::SMALLINT[] AND cardinality(quality_activities) <= 4)
);

UPDATE action_plans p SET quality_activities = ARRAY(
  SELECT DISTINCT l.activity FROM activity_plan_lines l WHERE l.plan_id = p.id AND l.workstream = 'quality' AND l.activity IN (0, 1, 4, 11) ORDER BY 1
)::SMALLINT[]
WHERE p.quality_activities IS NULL AND EXISTS (SELECT 1 FROM activity_plan_lines l WHERE l.plan_id = p.id AND l.workstream = 'quality');

COMMIT;
