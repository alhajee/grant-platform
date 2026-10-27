-- Assessment Officer role names (UBEC150, client 27 October 2026): an officer has a role name such as
-- "UBEC Assessment Officer 1 - Infrastructure" besides their full name, and is shown as
-- "UBEC Assessment Officer 1 - Infrastructure (Full Name)" wherever UBEC lists or records them (display_name).
-- Accounts without a role name show their full name as before.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_title TEXT NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_title_check CHECK (char_length(role_title) <= 120 AND role_title = btrim(role_title));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT GENERATED ALWAYS AS (
  CASE WHEN role_title = '' THEN full_name ELSE role_title || ' (' || full_name || ')' END
) STORED;
