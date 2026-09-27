ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS rationale text NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS implementation_approach text NOT NULL DEFAULT '';
