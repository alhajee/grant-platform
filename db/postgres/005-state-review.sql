BEGIN;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'awaiting_review', 'changes_requested', 'approved'));
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS submission_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS workflow_updated_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS plan_submissions (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, number)
);
CREATE TABLE IF NOT EXISTS plan_review_events (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
  submission_number INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submit', 'request_changes', 'approve')),
  actor_name TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_review_events_plan ON plan_review_events(plan_id, id);
CREATE TABLE IF NOT EXISTS plan_notifications (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES plan_review_events(id) ON DELETE RESTRICT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);
COMMIT;
