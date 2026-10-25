-- Assessment Officers for the oversight departments (UBEC56/UBEC95, client 25 October 2026). Audit, Procurement and
-- Finance have Assessment Officers (role 'UBEC Assessment Officer', department audit/procurement/finance). Their
-- Oversight Director assigns them to a component while it is with oversight; they comment on items like the other
-- UBEC reviewers but never accept or reject. Their open comments (and their Director's) block the UBEC BEAP Chair's
-- approval. Kept apart from ubec_officer_assignments so the accept/reject and Complete assessment rules never see them.
-- Cascades with the round.
CREATE TABLE IF NOT EXISTS ubec_oversight_assignments (
  id SERIAL PRIMARY KEY,
  round_component_id INTEGER NOT NULL REFERENCES ubec_round_components(id) ON DELETE CASCADE,
  department TEXT NOT NULL CHECK (department IN ('audit', 'procurement', 'finance')),
  officer_id INTEGER NOT NULL REFERENCES users(id),
  officer_name TEXT NOT NULL,
  assigned_by_id INTEGER NOT NULL REFERENCES users(id),
  assigned_by_name TEXT NOT NULL,
  comment TEXT NOT NULL CHECK (length(btrim(comment)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ubec_oversight_assignments_live ON ubec_oversight_assignments(round_component_id, officer_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS ubec_oversight_assignments_officer ON ubec_oversight_assignments(officer_id) WHERE removed_at IS NULL;
