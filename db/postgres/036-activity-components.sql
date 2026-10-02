-- Supervision & Monitoring, Greening Schools/Climate Change/Safeguards and Curriculum become activity-line
-- components (UBEC26-32). They reuse activity_plan_lines (new workstreams), the TLM distribution table
-- (now keyed by workstream; Curriculum has its own list) and a small table for component documents
-- (the Supervision & Monitoring proforma invoices).
BEGIN;
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_workstream_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_workstream_check CHECK (workstream IN ('sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 8 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 5 WHEN 'curriculum' THEN 4 ELSE 0 END
);

ALTER TABLE plan_pillar_reviews DROP CONSTRAINT IF EXISTS plan_pillar_reviews_pillar_check;
ALTER TABLE plan_pillar_reviews ADD CONSTRAINT plan_pillar_reviews_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum'));

ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_pillar_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_sheet_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_sheet_check CHECK (sheet IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'curriculum', 'curriculumDistribution'));

-- One distribution table per plan and workstream; existing rows are the TLM list.
ALTER TABLE tlm_distribution ADD COLUMN IF NOT EXISTS workstream TEXT NOT NULL DEFAULT 'tlm';
ALTER TABLE tlm_distribution DROP CONSTRAINT IF EXISTS tlm_distribution_workstream_check;
ALTER TABLE tlm_distribution ADD CONSTRAINT tlm_distribution_workstream_check CHECK (workstream IN ('tlm', 'curriculum'));
ALTER TABLE tlm_distribution DROP CONSTRAINT IF EXISTS tlm_distribution_pkey;
ALTER TABLE tlm_distribution ADD CONSTRAINT tlm_distribution_pkey PRIMARY KEY (plan_id, workstream, school_id);

CREATE TABLE IF NOT EXISTS component_documents (
  id UUID PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('monitoring')),
  kind TEXT NOT NULL DEFAULT 'proforma' CHECK (kind IN ('proforma')),
  name TEXT NOT NULL, media_type TEXT NOT NULL, content BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), removed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS component_documents_plan ON component_documents(plan_id, component) WHERE removed_at IS NULL;
COMMIT;
