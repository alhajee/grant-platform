BEGIN;
DROP INDEX IF EXISTS one_active_subeb_director;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_subeb_department_director
  ON users(state_code, department) WHERE role='Director' AND active AND department IS NOT NULL;
CREATE TABLE IF NOT EXISTS plan_pillar_reviews (
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE RESTRICT,
  pillar TEXT NOT NULL CHECK(pillar IN ('infrastructure','sports')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','director_review','changes_requested','chairman_ready')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(plan_id,pillar)
);
-- Preserve history, but require department-specific review for legacy state submissions.
INSERT INTO plan_pillar_reviews(plan_id,pillar,status)
SELECT p.id, v.pillar,
  CASE WHEN p.status IN ('awaiting_review','awaiting_chairman','approved') THEN 'director_review'
       WHEN p.status='changes_requested' THEN 'changes_requested'
       WHEN p.status IN ('submitted_ubec','ubec_review','ubec_approved') THEN 'chairman_ready'
       ELSE 'draft' END
FROM action_plans p CROSS JOIN (VALUES ('infrastructure'),('sports')) v(pillar)
ON CONFLICT DO NOTHING;
UPDATE action_plans SET status='awaiting_review', version=version+1
WHERE status IN ('awaiting_chairman','approved')
  AND EXISTS(SELECT 1 FROM plan_pillar_reviews r WHERE r.plan_id=action_plans.id AND r.status='director_review');
COMMIT;
