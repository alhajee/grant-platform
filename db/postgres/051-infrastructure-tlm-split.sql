BEGIN;

-- Infrastructure and TLM: an explicit split of their shared 75% pool, like Teacher Development and ICT.
--
-- action_plans.tlm_allocation is the one stored figure: TLM's amount of the pool (the infrastructure policy
-- share of the shared envelope plus every 'infrastructure' and 'tlm' funding source). Infrastructure keeps
-- pool − tlm_allocation. NULL means the split has not been set yet; either editor asks for it first.
--
-- state_workflow_settings.infrastructure_tlm_mode (GLOBAL row, Super Admin) chooses the behaviour for every state:
--   split (default)  the explicit split above;
--   shared_pool      the earlier first-come pool (migration 035): both sides draw from the whole pool and
--                    together may not exceed it; tlm_allocation is ignored.
-- Switching never changes data: a plan without tlm_allocation behaves as "split not set yet" in split mode.
--
-- Backfill (once, when the column is first added) so existing plans stay valid and editable:
--   * a plan with TLM lines gets tlm_allocation = its TLM lines total, so Infrastructure keeps the rest;
--   * a plan with Infrastructure packages but no TLM lines gets 0 (allowed because TLM has no lines);
--   * a plan with neither stays NULL, so the split is asked on first open.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'action_plans' AND column_name = 'tlm_allocation') THEN
    ALTER TABLE action_plans ADD COLUMN tlm_allocation NUMERIC(14,2);
    UPDATE action_plans p SET tlm_allocation = COALESCE(t.total, 0)
    FROM (
      SELECT p2.id,
        (SELECT SUM(l.quantity * l.unit_cost) FROM activity_plan_lines l WHERE l.plan_id = p2.id AND l.workstream = 'tlm') AS total,
        EXISTS (SELECT 1 FROM infrastructure_packages i WHERE i.plan_id = p2.id) AS has_packages
      FROM action_plans p2
    ) t
    WHERE t.id = p.id AND (t.total IS NOT NULL OR t.has_packages);
  END IF;
END $$;

ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_tlm_allocation_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_tlm_allocation_check CHECK (tlm_allocation IS NULL OR tlm_allocation >= 0);

ALTER TABLE state_workflow_settings
  ADD COLUMN IF NOT EXISTS infrastructure_tlm_mode TEXT NOT NULL DEFAULT 'split';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_workflow_settings_infrastructure_tlm_mode_check') THEN
    ALTER TABLE state_workflow_settings ADD CONSTRAINT state_workflow_settings_infrastructure_tlm_mode_check
      CHECK (infrastructure_tlm_mode IN ('split', 'shared_pool'));
  END IF;
END $$;

INSERT INTO state_workflow_settings (state_code, beap_chair_submission_mode)
VALUES ('GLOBAL', 'complete_plan')
ON CONFLICT (state_code) DO NOTHING;

COMMIT;
