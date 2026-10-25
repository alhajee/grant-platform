-- Finance documents of a plan (UBEC130, client 25 October 2026): the SUBEB Finance department (Data Entry Staff or
-- Director with department 'finance') uploads the bank statement, the notification of lodgement and the 50%
-- utilisation report, then submits them to the BEAP Chair. They do not block sending the plan to UBEC (the Executive
-- Chairman is warned when any is missing) and are not uploaded again on resubmission. At UBEC only the Finance
-- Oversight Director and Finance Assessment Officers see them. One live file per kind; replacing or removing is soft.
BEGIN;
CREATE TABLE IF NOT EXISTS plan_finance_documents (
  id UUID PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bank_statement', 'lodgement_notification', 'utilisation_report')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  media_type TEXT NOT NULL,
  content BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_finance_documents_live ON plan_finance_documents(plan_id, kind) WHERE removed_at IS NULL;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS finance_submitted_at TIMESTAMPTZ;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS finance_submitted_by_name TEXT;
-- The submission to the BEAP Chair is recorded in the review history (and notifies the BEAP Chair).
ALTER TABLE plan_review_events DROP CONSTRAINT IF EXISTS plan_review_events_action_check;
ALTER TABLE plan_review_events ADD CONSTRAINT plan_review_events_action_check
  CHECK (action IN ('submit','request_changes','endorse','forward','approve','edit','finance_submit'));
COMMIT;
