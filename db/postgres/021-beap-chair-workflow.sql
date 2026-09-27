BEGIN;

ALTER TABLE plan_pillar_reviews DROP CONSTRAINT IF EXISTS plan_pillar_reviews_status_check;
ALTER TABLE plan_pillar_reviews ADD CONSTRAINT plan_pillar_reviews_status_check
  CHECK(status IN ('draft','director_review','changes_requested','beap_review','chairman_ready'));

ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_status_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_status_check
  CHECK(status IN ('draft','awaiting_review','awaiting_beap_chair','awaiting_chairman','changes_requested','approved','submitted_ubec','ubec_review','ubec_approved'));

ALTER TABLE plan_review_events DROP CONSTRAINT IF EXISTS plan_review_events_action_check;
ALTER TABLE plan_review_events ADD CONSTRAINT plan_review_events_action_check
  CHECK(action IN ('submit','request_changes','endorse','forward','approve'));

-- Keep existing installations operable even when their users were created
-- before the BEAP Chair nomination field was introduced. Preserve any
-- existing nomination; otherwise nominate Yobe's Physical Planning Director.
UPDATE users candidate
SET is_beap_chair=TRUE, can_create_plan=TRUE
WHERE candidate.state_code='YO'
  AND candidate.role='Director'
  AND candidate.department='physical'
  AND candidate.active
  AND NOT EXISTS (
    SELECT 1 FROM users nominated
    WHERE nominated.state_code=candidate.state_code
      AND nominated.active
      AND nominated.is_beap_chair
  );

-- Plans that had reached the old generic Chairman stage must now pass through
-- the newly explicit BEAP Chair review before the Executive Chairman.
UPDATE plan_pillar_reviews review
SET status='beap_review', updated_at=NOW()
FROM action_plans plan
WHERE review.plan_id=plan.id
  AND review.status='chairman_ready'
  AND plan.status NOT IN ('submitted_ubec','ubec_review','ubec_approved');

UPDATE action_plans
SET status='awaiting_beap_chair', workflow_updated_at=NOW()
WHERE status IN ('awaiting_chairman','approved');

COMMIT;
