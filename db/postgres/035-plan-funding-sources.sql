-- Component-specific other funding (UBEC04/05/06) and plan detail edits (UBEC33).
-- A funding source belongs to one BEAP component and is available only to that
-- component; it is never spread by the funding policy shares.
-- Existing plans keep action_plans.other_funding as legacy funding that is still
-- spread by the policy, so their component ceilings do not change. New plans
-- store 0 there and record every other amount here instead.
-- Plan envelope = state_lodgment * 2 + other_funding (funding_total) + SUM(amount).
BEGIN;
CREATE TABLE IF NOT EXISTS plan_funding_sources (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('infrastructure','tlm','quality','teachers','sbmc','sports','monitoring','curriculum','planning','gscci')),
  funder TEXT NOT NULL CHECK (length(btrim(funder)) BETWEEN 1 AND 120),
  amount NUMERIC(16,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_funding_sources_plan ON plan_funding_sources(plan_id, id);

-- Plan detail edits are recorded in the review history.
ALTER TABLE plan_review_events DROP CONSTRAINT IF EXISTS plan_review_events_action_check;
ALTER TABLE plan_review_events ADD CONSTRAINT plan_review_events_action_check
  CHECK (action IN ('submit','request_changes','endorse','forward','approve','edit'));
COMMIT;
