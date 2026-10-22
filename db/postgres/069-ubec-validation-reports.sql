-- UBEC Assessment Officers upload a Validation Report for Infrastructure before completing their assessment
-- (client, October 2026). One or more files per officer and round component; removal is soft. Cascades with the round.
CREATE TABLE IF NOT EXISTS ubec_validation_reports (
  id UUID PRIMARY KEY,
  round_component_id INTEGER NOT NULL REFERENCES ubec_round_components(id) ON DELETE CASCADE,
  officer_id INTEGER NOT NULL REFERENCES users(id),
  officer_name TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
  media_type TEXT NOT NULL,
  content BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ubec_validation_reports_component ON ubec_validation_reports(round_component_id) WHERE removed_at IS NULL;
