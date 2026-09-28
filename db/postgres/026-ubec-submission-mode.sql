BEGIN;

-- Platform-wide switch for the Executive Chairman's handoff to UBEC.
-- complete_plan keeps the original rule: every implemented component must be
-- complete and reviewed. reviewed_components lets the Executive Chairman send
-- only the components that have reached them, which makes user testing easier.
ALTER TABLE state_workflow_settings
  ADD COLUMN IF NOT EXISTS ubec_submission_mode TEXT NOT NULL DEFAULT 'complete_plan'
    CHECK (ubec_submission_mode IN ('complete_plan', 'reviewed_components'));

COMMIT;
