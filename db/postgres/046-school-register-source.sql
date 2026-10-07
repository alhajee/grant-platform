BEGIN;

-- Platform-wide switch for where the school register comes from.
-- dnemis_only (default): every school comes from the DNEMIS sync; nobody can add,
-- edit, delete or bulk-import schools by hand. dnemis_and_manual: the Executive
-- Chairman, the BEAP Chair and authorised staff may also manage schools by hand.
ALTER TABLE state_workflow_settings
  ADD COLUMN IF NOT EXISTS school_register_source TEXT NOT NULL DEFAULT 'dnemis_only';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_workflow_settings_school_register_source_check') THEN
    ALTER TABLE state_workflow_settings ADD CONSTRAINT state_workflow_settings_school_register_source_check
      CHECK (school_register_source IN ('dnemis_only', 'dnemis_and_manual'));
  END IF;
END $$;

INSERT INTO state_workflow_settings (state_code, beap_chair_submission_mode)
VALUES ('GLOBAL', 'complete_plan')
ON CONFLICT (state_code) DO NOTHING;

COMMIT;
