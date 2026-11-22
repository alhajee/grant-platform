-- Bug sheet 24 (client, 21 November 2026): "for Finance the observation should be on the 3 documents for UBEC". UBEC
-- Finance (the Finance Oversight Director and Finance Assessment Officers) adds observations on each of the plan's
-- Finance documents while a submission is under review. The SUBEB (Finance, BEAP Chair, Executive Chairman) reads them
-- once that submission has been decided, beside the documents, and replies by uploading a new file.
CREATE TABLE IF NOT EXISTS ubec_finance_observations (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES ubec_rounds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bank_statement', 'lodgement_notification', 'utilisation_report')),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ubec_finance_observations_plan ON ubec_finance_observations(plan_id, round_id);
