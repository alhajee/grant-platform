-- School register (UBEC07/UBEC03): SUBEB school managers add and edit their state's schools.
-- * school_code: optional EMIS/DNEMIS code, unique per state when present, so a later DNEMIS sync can match schools.
-- * enrolment_by_class: per-class figures {"ECCDE":{"male":n,"female":n},"P1":…,"JSS3":…}; enrolment_male/female stay the totals.
-- * updated_* columns record the last register change by name only. No FK to users, so TRUNCATE users CASCADE cannot clear schools.
-- * users.can_manage_schools: opt-in grant; the Executive Chairman and the BEAP Chair manage schools through their role.
BEGIN;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_code TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS enrolment_by_class JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_school_code_check;
ALTER TABLE schools ADD CONSTRAINT schools_school_code_check CHECK (school_code IS NULL OR (school_code <> '' AND school_code = upper(btrim(school_code))));
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_enrolment_by_class_check;
ALTER TABLE schools ADD CONSTRAINT schools_enrolment_by_class_check CHECK (jsonb_typeof(enrolment_by_class) = 'object');
CREATE UNIQUE INDEX IF NOT EXISTS schools_state_school_code_key ON schools (state_code, school_code) WHERE school_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS schools_state_lga_idx ON schools (state_code, lga);
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_schools BOOLEAN NOT NULL DEFAULT FALSE;
COMMIT;
