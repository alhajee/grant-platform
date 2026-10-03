-- Teacher Development (pillar 'teachers', department 'teachers') becomes an activity-line component: the first
-- section of the shared Teacher Development and ICT component, reviewed on its own like ICT. Additive and
-- idempotent: existing lines, reviews, comments and documents are untouched.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_workstream_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_workstream_check CHECK (workstream IN ('sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 9 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 11 WHEN 'ict' THEN 9 WHEN 'teachers' THEN 19 ELSE 0 END
);

-- Training details of a Teacher Development line. Description, strategy and target group stay '' on these lines.
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS training_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS target_participants TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS school_levels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS training_days INTEGER;
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS venue_type TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_training_provider_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_training_provider_check CHECK (training_provider IN ('', 'Government-accredited Teacher Training Institutions', 'Special training provider approved by UBEC', 'International Development Partners'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_target_participants_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_target_participants_check CHECK (target_participants IN ('', 'Headteachers/Principals', 'Teachers', 'Education managers'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_school_levels_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_school_levels_check CHECK (school_levels <@ ARRAY['ECCDE', 'Primary', 'JSS']::TEXT[]);
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_training_days_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_training_days_check CHECK (training_days IS NULL OR training_days BETWEEN 3 AND 365);
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_venue_type_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_venue_type_check CHECK (venue_type IN ('', 'Hall', 'Classroom'));
-- Every Teacher Development line has its training details; no other line has them.
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_training_details_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_training_details_check CHECK (
  CASE WHEN workstream = 'teachers'
    THEN training_provider <> '' AND target_participants <> '' AND cardinality(school_levels) > 0 AND training_days IS NOT NULL AND venue_type <> ''
    ELSE training_provider = '' AND target_participants = '' AND cardinality(school_levels) = 0 AND training_days IS NULL AND venue_type = ''
  END
);

ALTER TABLE activity_line_documents DROP CONSTRAINT IF EXISTS activity_line_documents_component_check;
ALTER TABLE activity_line_documents ADD CONSTRAINT activity_line_documents_component_check CHECK (component IN ('quality', 'ict', 'teachers'));

-- Either side can set the split now. Teacher Development may take the whole shared budget, leaving ICT 0
-- (the API allows that only while ICT has no lines).
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_ict_allocation_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_ict_allocation_check CHECK (ict_allocation IS NULL OR ict_allocation >= 0);

ALTER TABLE plan_pillar_reviews DROP CONSTRAINT IF EXISTS plan_pillar_reviews_pillar_check;
ALTER TABLE plan_pillar_reviews ADD CONSTRAINT plan_pillar_reviews_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers'));

ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_pillar_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_sheet_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_sheet_check CHECK (sheet IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'gscciDistribution', 'curriculum', 'curriculumDistribution', 'quality', 'ict', 'teachers'));

COMMIT;
