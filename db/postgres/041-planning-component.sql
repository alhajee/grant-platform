-- Planning, Research & Statistics (component and pillar 'planning', department 'planning') becomes an
-- activity-line component, and other funding can be shared by every component ('all' funding sources,
-- split by the funding policy shares like the state contribution). Additive and idempotent: existing lines,
-- reviews, comments and funding sources are untouched.
BEGIN;

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_workstream_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_workstream_check CHECK (workstream IN ('sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'));
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 9 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 11 WHEN 'ict' THEN 9 WHEN 'teachers' THEN 19 WHEN 'planning' THEN 6 ELSE 0 END
);

ALTER TABLE plan_pillar_reviews DROP CONSTRAINT IF EXISTS plan_pillar_reviews_pillar_check;
ALTER TABLE plan_pillar_reviews ADD CONSTRAINT plan_pillar_reviews_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'));

ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_pillar_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_pillar_check CHECK (pillar IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'));
ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_sheet_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_sheet_check CHECK (sheet IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'gscciDistribution', 'curriculum', 'curriculumDistribution', 'quality', 'ict', 'teachers', 'planning'));

-- Plan-wide other funding: component 'all' is shared across every component by the policy shares.
ALTER TABLE plan_funding_sources DROP CONSTRAINT IF EXISTS plan_funding_sources_component_check;
ALTER TABLE plan_funding_sources ADD CONSTRAINT plan_funding_sources_component_check CHECK (component IN ('all', 'infrastructure', 'tlm', 'quality', 'teachers', 'sbmc', 'sports', 'monitoring', 'curriculum', 'planning', 'gscci'));

COMMIT;
