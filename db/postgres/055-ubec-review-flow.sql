BEGIN;

-- UBEC review flow (docs/ubec-flow.md): the UBEC BEAP Chair releases a submitted round to the component
-- Directors, who assign Assessment Officers; officers accept or reject each item; the Director sends each
-- component for oversight (Audit, Procurement, Finance); the BEAP Chair approves or returns the plan.

-- Roles. 'UBEC Department Reviewer' stays allowed as a legacy value (an older container may still be running
-- during a rolling deploy); the application gives it no UBEC access.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'Data Entry Staff', 'Director', 'Executive Chairman', 'Super Admin',
  'UBEC Executive Secretary', 'UBEC BEAP Chair', 'UBEC Director', 'UBEC Oversight Director', 'UBEC Assessment Officer',
  'UBEC Department Reviewer'
));

-- Existing Department Reviewers: Audit and Finance reviewers become Oversight Directors of that department,
-- everyone else an Assessment Officer of their department. Sessions are kept (the role is re-read per request).
UPDATE users SET role = 'UBEC Oversight Director' WHERE role = 'UBEC Department Reviewer' AND department IN ('audit', 'finance');
UPDATE users SET role = 'UBEC Assessment Officer' WHERE role = 'UBEC Department Reviewer';

-- Release by the UBEC BEAP Chair.
ALTER TABLE ubec_rounds ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE ubec_rounds ADD COLUMN IF NOT EXISTS released_by_name TEXT;
ALTER TABLE ubec_rounds ADD COLUMN IF NOT EXISTS release_comment TEXT NOT NULL DEFAULT '';

-- Bell wording and links need the component an event is about.
ALTER TABLE ubec_events ADD COLUMN IF NOT EXISTS pillar TEXT;

CREATE TABLE IF NOT EXISTS ubec_round_components (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES ubec_rounds(id) ON DELETE CASCADE,
  pillar TEXT NOT NULL,
  department TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'director' CHECK (stage IN ('director', 'oversight', 'chair')),
  director_comment TEXT NOT NULL DEFAULT '',
  director_name TEXT,
  sent_to_oversight_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, pillar),
  CHECK ((stage = 'director') = (sent_to_oversight_at IS NULL)),
  CHECK ((stage = 'chair') = (arrived_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ubec_round_components_department_idx ON ubec_round_components (department, stage);

CREATE TABLE IF NOT EXISTS ubec_officer_assignments (
  id SERIAL PRIMARY KEY,
  round_component_id INTEGER NOT NULL REFERENCES ubec_round_components(id) ON DELETE CASCADE,
  officer_id INTEGER NOT NULL REFERENCES users(id),
  officer_name TEXT NOT NULL,
  assigned_by_id INTEGER NOT NULL REFERENCES users(id),
  assigned_by_name TEXT NOT NULL,
  comment TEXT NOT NULL CHECK (length(btrim(comment)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completion_note TEXT NOT NULL DEFAULT '',
  removed_at TIMESTAMPTZ,
  CHECK (removed_at IS NULL OR completed_at IS NULL)
);
-- One live assignment per officer and component; a removed one can be assigned again.
CREATE UNIQUE INDEX IF NOT EXISTS ubec_officer_assignments_live_idx ON ubec_officer_assignments (round_component_id, officer_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS ubec_officer_assignments_officer_idx ON ubec_officer_assignments (officer_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS ubec_item_decisions (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES ubec_rounds(id) ON DELETE CASCADE,
  pillar TEXT NOT NULL,
  row_ref TEXT NOT NULL CHECK (row_ref ~ '^-?[1-9][0-9]{0,17}$'),
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject')),
  note TEXT NOT NULL DEFAULT '',
  officer_id INTEGER NOT NULL REFERENCES users(id),
  officer_name TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, pillar, row_ref)
);

CREATE TABLE IF NOT EXISTS ubec_oversight_reviews (
  id SERIAL PRIMARY KEY,
  round_component_id INTEGER NOT NULL REFERENCES ubec_round_components(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('audit', 'procurement', 'finance')),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewer_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_component_id, department)
);

-- Rounds still open under the earlier flow go back to the BEAP Chair, who releases them in the new one.
-- Their department assignments (ubec_assignments) stay as read-only history.
UPDATE ubec_rounds SET status = 'received' WHERE status = 'reviewing' AND released_at IS NULL;
UPDATE action_plans p SET status = 'submitted_ubec', version = version + 1
  WHERE p.status = 'ubec_review' AND EXISTS (SELECT 1 FROM ubec_rounds r WHERE r.plan_id = p.id AND r.status = 'received');

COMMIT;
