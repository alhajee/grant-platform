-- How many people may hold the UBEC BEAP Chair at once (client, 11 November 2026: "so they can increase the BEAP Chair
-- to whatever number they want"): the UBEC BEAP Chair accounts plus UBEC Directors given the duty (migration 094).
-- Set by the Super Admin on Admin > Settings > UBEC Assessment Officers. NULL = the default of 2.
ALTER TABLE state_workflow_settings ADD COLUMN IF NOT EXISTS ubec_chair_limit SMALLINT;
DO $$ BEGIN
  ALTER TABLE state_workflow_settings ADD CONSTRAINT state_workflow_settings_ubec_chair_limit_check CHECK (ubec_chair_limit BETWEEN 1 AND 50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
