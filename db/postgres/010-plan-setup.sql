BEGIN;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS implementation_year INTEGER;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS funding_quarters INTEGER[];
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS state_lodgment NUMERIC(16,2);
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS other_funding NUMERIC(16,2);
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS beap_name TEXT;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS funding_total NUMERIC(16,2)
  GENERATED ALWAYS AS (state_lodgment * 2 + other_funding) STORED;
CREATE TABLE IF NOT EXISTS plan_quarters (
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,
  planning_year INTEGER NOT NULL CHECK(planning_year BETWEEN 2004 AND 2100),
  quarter INTEGER NOT NULL CHECK(quarter BETWEEN 1 AND 4),
  PRIMARY KEY(state_code,planning_year,quarter),
  UNIQUE(plan_id,planning_year,quarter)
);
-- Legacy plans reserve their complete periods without fabricating setup metadata.
INSERT INTO plan_quarters(plan_id,state_code,planning_year,quarter)
SELECT p.id,p.state_code,y,q FROM action_plans p,
  LATERAL generate_series(p.start_year,p.end_year) y,
  LATERAL unnest(COALESCE(p.funding_quarters,ARRAY[1,2,3,4])) q
WHERE NOT EXISTS(SELECT 1 FROM plan_quarters existing WHERE existing.plan_id=p.id);
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_state_code_start_year_end_year_key;
CREATE TABLE IF NOT EXISTS plan_documents (
  id UUID PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  content BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0 AND size <= 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(octet_length(content)=size)
);
CREATE INDEX IF NOT EXISTS idx_plan_documents_plan ON plan_documents(plan_id);
COMMIT;
