BEGIN;

-- School identity is per state: several LGA names (e.g. Obi, Surulere,
-- Nasarawa) exist in more than one state, so a nationwide directory needs
-- state_code in the uniqueness rule.
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_name_lga_level_key;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_state_name_lga_level_key;
ALTER TABLE schools ADD CONSTRAINT schools_state_name_lga_level_key UNIQUE (state_code, name, lga, level);
CREATE INDEX IF NOT EXISTS schools_state_name_idx ON schools (state_code, name);

COMMIT;
