BEGIN;

-- Platform-wide switch (Super Admin, Admin > Workflow settings) for the supporting documents that
-- non-infrastructure components ask for: the ICT specification / supporting document / Bill of
-- Quantities (activities 0, 3, 4) and the Teacher Development supporting documents on every line.
-- FALSE (default): uploads stay available but are optional; nothing is refused for a missing one.
-- TRUE: every send step needs them, as before. Infrastructure documents and the RAT upload at plan
-- creation are always required and are not affected.
ALTER TABLE state_workflow_settings
  ADD COLUMN IF NOT EXISTS component_documents_required BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO state_workflow_settings (state_code, beap_chair_submission_mode)
VALUES ('GLOBAL', 'complete_plan')
ON CONFLICT (state_code) DO NOTHING;

COMMIT;
