-- RAT tools (bug round 10, 30 October 2026).
-- UBEC204: the SUBEB replaces the RAT tool from Edit plan while the plan is at the state (also when UBEC returned it).
-- Replaced files are kept, marked removed, so the UBEC submissions that carried them can still be opened.
ALTER TABLE plan_documents ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_plan_documents_live ON plan_documents(plan_id) WHERE removed_at IS NULL;

-- UBEC205: UBEC Planning (DPRS) accepts or rejects the RAT tool of each submission, with a comment (required to reject).
-- A rejection holds approval; the SUBEB sees it once the plan is returned and must upload a new RAT before resubmitting.
CREATE TABLE IF NOT EXISTS ubec_rat_reviews (
  round_id INTEGER PRIMARY KEY REFERENCES ubec_rounds(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject')),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (decision = 'accept' OR btrim(comment) <> '')
);
