-- Quality Assurance (component 'quality', department 'me') and ICT (pillar 'ict', department 'ict', inside the
-- shared Teacher Development and ICT component) become activity-line components. Additive and idempotent:
-- existing lines, reviews, comments and documents are untouched.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_workstream_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_workstream_check CHECK (workstream IN ('sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 5 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 11 WHEN 'ict' THEN 9 ELSE 0 END
);

-- Line extras: QA equipment type (activity 0), ICT internet subscription types (activity 5) and website type (activity 6).
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS equipment_type TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS subscription_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS website_type TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_equipment_type_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_equipment_type_check CHECK (equipment_type IN ('', 'Motorcycles', 'Vehicles', 'Office equipment (printers, photocopiers, projectors etc.)'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_subscription_types_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_subscription_types_check CHECK (subscription_types <@ ARRAY['Starlink', 'MTN', 'Airtel', 'Glo', 'T2', 'Fibre']::TEXT[]);
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_website_type_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_website_type_check CHECK (website_type IN ('', 'Maintenance – renewal', 'Maintenance – redesign', 'Development (new)'));

-- Schools chosen on a line (ICT Model Smart Schools, DLC/Smart Classrooms, Monitoring and verification).
CREATE TABLE IF NOT EXISTS activity_line_schools (
  line_id INTEGER NOT NULL REFERENCES activity_plan_lines(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (line_id, school_id)
);
CREATE INDEX IF NOT EXISTS activity_line_schools_school ON activity_line_schools(school_id);

-- Documents attached to one budget line (PDF or Excel). Removal is soft so earlier submissions keep their links;
-- a deleted line keeps its removed documents with line_id cleared.
CREATE TABLE IF NOT EXISTS activity_line_documents (
  id UUID PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  line_id INTEGER REFERENCES activity_plan_lines(id) ON DELETE SET NULL,
  component TEXT NOT NULL CHECK (component IN ('quality', 'ict')),
  name TEXT NOT NULL, media_type TEXT NOT NULL, content BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 5242880),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), removed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS activity_line_documents_line ON activity_line_documents(line_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS activity_line_documents_plan ON activity_line_documents(plan_id, component) WHERE removed_at IS NULL;

-- ICT's share of the shared Teacher Development and ICT envelope; Teacher Development keeps the rest.
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS ict_allocation NUMERIC(14,2);
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_ict_allocation_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_ict_allocation_check CHECK (ict_allocation IS NULL OR ict_allocation > 0);

ALTER TABLE plan_pillar_reviews DROP CONSTRAINT IF EXISTS plan_pillar_reviews_pillar_check;
ALTER TABLE plan_pillar_reviews ADD CONSTRAINT plan_pillar_reviews_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict'));

ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_pillar_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_sheet_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_sheet_check CHECK (sheet IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'curriculum', 'curriculumDistribution', 'quality', 'ict'));

COMMIT;
