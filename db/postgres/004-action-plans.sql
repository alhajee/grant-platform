BEGIN;
CREATE TABLE IF NOT EXISTS action_plans (
  id SERIAL PRIMARY KEY,
  state_code TEXT NOT NULL,
  start_year INTEGER NOT NULL CHECK (start_year BETWEEN 2004 AND 2100),
  end_year INTEGER NOT NULL CHECK (end_year BETWEEN start_year AND 2100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_code, start_year, end_year)
);
-- Preserve the existing workspace as its original 2025 action plan.
INSERT INTO action_plans (state_code, start_year, end_year)
SELECT DISTINCT state_code, 2025, 2025 FROM (
  SELECT s.state_code FROM infrastructure_lines l JOIN schools s ON s.id = l.school_id
  UNION SELECT state_code FROM sports_budget_lines
) existing ON CONFLICT DO NOTHING;
ALTER TABLE infrastructure_lines ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES action_plans(id) ON DELETE RESTRICT;
ALTER TABLE sports_budget_lines ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES action_plans(id) ON DELETE RESTRICT;
UPDATE infrastructure_lines l SET plan_id = p.id FROM schools s, action_plans p
WHERE l.plan_id IS NULL AND s.id = l.school_id AND p.state_code = s.state_code AND p.start_year = 2025 AND p.end_year = 2025;
UPDATE sports_budget_lines l SET plan_id = p.id FROM action_plans p
WHERE l.plan_id IS NULL AND p.state_code = l.state_code AND p.start_year = 2025 AND p.end_year = 2025;
ALTER TABLE infrastructure_lines ALTER COLUMN plan_id SET NOT NULL;
ALTER TABLE sports_budget_lines ALTER COLUMN plan_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_infrastructure_plan ON infrastructure_lines(plan_id);
CREATE INDEX IF NOT EXISTS idx_sports_plan ON sports_budget_lines(plan_id);
COMMIT;
