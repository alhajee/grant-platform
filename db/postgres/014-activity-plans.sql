BEGIN;
CREATE TABLE IF NOT EXISTS activity_plan_lines (
 id SERIAL PRIMARY KEY,
 plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
 workstream TEXT NOT NULL CHECK(workstream IN ('sbmc','tlm')),
 activity INTEGER NOT NULL CHECK(activity>=0 AND activity<CASE WHEN workstream='sbmc' THEN 7 ELSE 4 END),
 description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=1000000),
 unit_cost NUMERIC(14,2) NOT NULL CHECK(unit_cost>0),
 strategy TEXT NOT NULL, target_group TEXT NOT NULL,
 location TEXT NOT NULL CHECK(location IN ('Rural','Urban')), equipment TEXT NOT NULL DEFAULT '',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_plan_lines_plan ON activity_plan_lines(plan_id,workstream);
CREATE TABLE IF NOT EXISTS tlm_distribution (
 plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
 school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(plan_id,school_id)
);
ALTER TABLE plan_pillar_reviews DROP CONSTRAINT IF EXISTS plan_pillar_reviews_pillar_check;
ALTER TABLE plan_pillar_reviews ADD CONSTRAINT plan_pillar_reviews_pillar_check CHECK(pillar IN ('infrastructure','sports','sbmc','tlm'));
COMMIT;
