BEGIN;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role='Data Entry Staff' WHERE role='Data Entry Officer';
UPDATE users SET role='Executive Chairman' WHERE role='Executive Secretary';
UPDATE users SET role='Director' WHERE role='Reviewer';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('Data Entry Staff','Director','Executive Chairman','UBEC Executive Secretary','UBEC Department Reviewer'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
-- Unassigned legacy staff remain read-only until their department is explicitly assigned.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_subeb_director ON users(state_code) WHERE role='Director' AND active;
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_status_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_status_check CHECK(status IN ('draft','awaiting_review','awaiting_chairman','changes_requested','approved','submitted_ubec','ubec_review','ubec_approved'));
ALTER TABLE plan_review_events DROP CONSTRAINT IF EXISTS plan_review_events_action_check;
ALTER TABLE plan_review_events ADD CONSTRAINT plan_review_events_action_check CHECK(action IN ('submit','request_changes','endorse','approve'));
CREATE TABLE IF NOT EXISTS user_management_events (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  target_id INTEGER NOT NULL REFERENCES users(id),
  state_code TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
