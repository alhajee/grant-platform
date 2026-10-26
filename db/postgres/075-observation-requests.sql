-- Observations before sending to UBEC (bug sheet row 156, client 26 October 2026). The SUBEB Executive Chairman may
-- (optionally) ask some or all of UBEC Audit, Procurement and Finance for observations on the whole plan before sending
-- it. Each department asked comments per activity on the plan workbook (plan_comments scope 'observation', tagged with
-- the department) and sends its observations back; the plan cannot go to UBEC while a department asked has not replied,
-- or while any observation is unresolved at the SUBEB. Requests may be repeated; earlier observations stay visible to the
-- SUBEB, the departments and the UBEC BEAP Chair, but never in the formal UBEC review.
BEGIN;
CREATE TABLE IF NOT EXISTS plan_observation_requests (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  submission_number INTEGER NOT NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  requested_by_name TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS plan_observation_requests_plan_idx ON plan_observation_requests(plan_id, id DESC);
CREATE TABLE IF NOT EXISTS plan_observation_departments (
  request_id INTEGER NOT NULL REFERENCES plan_observation_requests(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('audit', 'procurement', 'finance')),
  completed_at TIMESTAMPTZ,
  completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_by_name TEXT,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 2000),
  PRIMARY KEY (request_id, department),
  CHECK ((completed_at IS NULL) = (completed_by_name IS NULL))
);

ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS observation_department TEXT;
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_scope_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_scope_check CHECK (scope IN ('state', 'ubec', 'observation'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_observation_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_observation_check
  CHECK ((scope = 'observation') = (observation_department IS NOT NULL) AND (observation_department IS NULL OR observation_department IN ('audit', 'procurement', 'finance')));
-- One open thread per cell or row, per scope, UBEC round and (observations) department.
DROP INDEX IF EXISTS plan_comments_one_open_thread_scope_idx;
CREATE UNIQUE INDEX IF NOT EXISTS plan_comments_one_open_thread_dept_idx ON plan_comments (plan_id, scope, COALESCE(ubec_round_id, 0), COALESCE(observation_department, ''), sheet, row_ref, COALESCE(column_id, '')) WHERE parent_id IS NULL AND resolved_at IS NULL;

ALTER TABLE plan_review_events DROP CONSTRAINT IF EXISTS plan_review_events_action_check;
ALTER TABLE plan_review_events ADD CONSTRAINT plan_review_events_action_check
  CHECK (action IN ('submit','request_changes','endorse','forward','approve','edit','finance_submit','observation_request','observation_return'));
COMMIT;
