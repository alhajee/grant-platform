-- Greening Schools, Climate Change & Safeguards (gscci) moves to UBEC's new allowable activities (9 activities,
-- indexes 0-8) and gets a required school distribution list, like Curriculum. The client confirmed the earlier
-- GSCCI lines are safe to clear. They are copied to retired_gscci_lines first, then deleted, and GSCCI reviews at
-- the state go back to draft so the component is redone. UBEC round snapshots are stored JSON and are not affected.
BEGIN;

CREATE TABLE IF NOT EXISTS retired_gscci_lines AS SELECT l.*, NOW() AS retired_at FROM activity_plan_lines l WHERE FALSE;
INSERT INTO retired_gscci_lines SELECT l.*, NOW() FROM activity_plan_lines l
  WHERE l.workstream = 'gscci' AND NOT EXISTS (SELECT 1 FROM retired_gscci_lines r WHERE r.id = l.id);
DELETE FROM activity_plan_lines WHERE workstream = 'gscci';

UPDATE plan_pillar_reviews r SET status = 'draft', updated_at = NOW()
  FROM action_plans p
  WHERE p.id = r.plan_id AND r.pillar = 'gscci' AND r.status <> 'draft'
    AND p.status NOT IN ('submitted_ubec', 'ubec_review', 'ubec_approved');

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 9 WHEN 'curriculum' THEN 4 WHEN 'quality' THEN 11 WHEN 'ict' THEN 9 ELSE 0 END
);

-- GSCCI distribution list (the schools that get the interventions), stored in tlm_distribution like Curriculum's.
ALTER TABLE tlm_distribution DROP CONSTRAINT IF EXISTS tlm_distribution_workstream_check;
ALTER TABLE tlm_distribution ADD CONSTRAINT tlm_distribution_workstream_check CHECK (workstream IN ('tlm', 'curriculum', 'gscci'));

ALTER TABLE plan_comments DROP CONSTRAINT IF EXISTS plan_comments_sheet_check;
ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_sheet_check CHECK (sheet IN ('infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'gscciDistribution', 'curriculum', 'curriculumDistribution', 'quality', 'ict'));

COMMIT;
