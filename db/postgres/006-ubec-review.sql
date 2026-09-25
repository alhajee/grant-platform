BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Data Entry Officer','Reviewer','Executive Secretary','UBEC Executive Secretary','UBEC Department Reviewer'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_status_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_status_check CHECK (status IN ('draft','awaiting_review','changes_requested','approved','submitted_ubec','ubec_review','ubec_approved'));
CREATE TABLE IF NOT EXISTS ubec_rounds (
  id SERIAL PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL, state_submission INTEGER NOT NULL, snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','returned','approved')),
  submitted_by INTEGER NOT NULL REFERENCES users(id), submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision TEXT NOT NULL DEFAULT '', decided_at TIMESTAMPTZ,
  UNIQUE(plan_id,number), UNIQUE(plan_id,state_submission)
);
CREATE TABLE IF NOT EXISTS ubec_assignments (
  id SERIAL PRIMARY KEY, round_id INTEGER NOT NULL REFERENCES ubec_rounds(id) ON DELETE RESTRICT,
  pillar TEXT NOT NULL, department TEXT NOT NULL, feedback TEXT, recommendation TEXT CHECK(recommendation IN ('endorse','changes')),
  reviewer TEXT, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(round_id,pillar,department)
);
CREATE TABLE IF NOT EXISTS ubec_events (
  id SERIAL PRIMARY KEY, round_id INTEGER NOT NULL REFERENCES ubec_rounds(id), plan_id INTEGER NOT NULL REFERENCES action_plans(id),
  action TEXT NOT NULL, actor TEXT NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ubec_assignment_department ON ubec_assignments(department,round_id);
CREATE INDEX IF NOT EXISTS idx_ubec_round_plan ON ubec_rounds(plan_id,id);
COMMIT;
