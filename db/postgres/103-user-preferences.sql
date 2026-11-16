-- UBEC261: display choices that follow the person to every device (e.g. the items screen's List/Grid and Larger text).
-- Only known keys are written (app/api/account/preferences); the CHECK keeps the value a small object.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_ui_preferences_check CHECK (jsonb_typeof(ui_preferences) = 'object' AND length(ui_preferences::text) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
