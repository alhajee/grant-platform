BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_beap_chair BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD CONSTRAINT beap_chair_is_department_director
  CHECK (NOT is_beap_chair OR (role='Director' AND department IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS one_beap_chair_per_state ON users(state_code) WHERE is_beap_chair;
COMMIT;
