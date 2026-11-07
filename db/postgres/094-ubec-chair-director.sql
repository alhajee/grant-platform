-- UBEC241 (bug sheet 18, November 2026): a UBEC Director may also hold the UBEC BEAP Chair duty (release, approve,
-- return), keeping every Director ability on their department. The Super Admin sets or removes it in Admin > Users.
-- UBEC242: at most two chair holders in total (the dedicated role plus flagged Directors), checked by the admin API.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ubec_beap_chair BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_ubec_beap_chair_director') THEN
    ALTER TABLE users ADD CONSTRAINT users_ubec_beap_chair_director CHECK (NOT is_ubec_beap_chair OR role = 'UBEC Director');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS users_ubec_beap_chair_idx ON users(id) WHERE is_ubec_beap_chair;
