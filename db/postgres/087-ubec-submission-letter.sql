-- The Executive Chairman's signature and cover letter for each submission to UBEC (UBEC132, client 3 November 2026:
-- "use e-signature or upload signature and then submit a cover letter on their letterhead and upload"). Both are
-- required to send the plan to UBEC. The signature is drawn on screen (saved as a PNG) or uploaded as an image; the cover
-- letter is uploaded (PDF, Word or an image). Until the plan is sent they are pending (ubec_round_id NULL, one live file
-- per kind, a new upload replaces it); sending attaches them to the new UBEC round, so each resubmission takes new ones.
BEGIN;
CREATE TABLE IF NOT EXISTS plan_submission_letters (
  id UUID PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  ubec_round_id INTEGER REFERENCES ubec_rounds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('signature', 'cover_letter')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  media_type TEXT NOT NULL,
  content BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  drawn BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_submission_letters_pending ON plan_submission_letters(plan_id, kind) WHERE ubec_round_id IS NULL AND removed_at IS NULL;
CREATE INDEX IF NOT EXISTS plan_submission_letters_round ON plan_submission_letters(ubec_round_id) WHERE ubec_round_id IS NOT NULL;
COMMIT;
