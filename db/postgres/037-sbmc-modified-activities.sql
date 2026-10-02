-- SBMC moves to UBEC's modified allowable social mobilisation activities (16 activities, indexes 0-15).
-- The client confirmed the earlier SBMC lines are safe to clear. They are copied to retired_sbmc_lines
-- first, then deleted, and SBMC reviews at the state go back to draft so the component is redone.
-- UBEC round snapshots are stored JSON and are not affected.
BEGIN;

CREATE TABLE IF NOT EXISTS retired_sbmc_lines AS SELECT l.*, NOW() AS retired_at FROM activity_plan_lines l WHERE FALSE;
INSERT INTO retired_sbmc_lines SELECT l.*, NOW() FROM activity_plan_lines l
  WHERE l.workstream = 'sbmc' AND NOT EXISTS (SELECT 1 FROM retired_sbmc_lines r WHERE r.id = l.id);
DELETE FROM activity_plan_lines WHERE workstream = 'sbmc';

UPDATE plan_pillar_reviews r SET status = 'draft', updated_at = NOW()
  FROM action_plans p
  WHERE p.id = r.plan_id AND r.pillar = 'sbmc' AND r.status <> 'draft'
    AND p.status NOT IN ('submitted_ubec', 'ubec_review', 'ubec_approved');

ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_activity_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_activity_check CHECK (
  activity >= 0 AND activity < CASE workstream WHEN 'sbmc' THEN 16 WHEN 'tlm' THEN 23 WHEN 'monitoring' THEN 4 WHEN 'gscci' THEN 5 WHEN 'curriculum' THEN 4 ELSE 0 END
);

COMMIT;
