BEGIN;

CREATE TABLE state_workflow_settings (
  state_code TEXT PRIMARY KEY,
  beap_chair_submission_mode TEXT NOT NULL DEFAULT 'complete_plan'
    CHECK (beap_chair_submission_mode IN ('complete_plan', 'individual_components')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
