BEGIN;

INSERT INTO state_workflow_settings (
  state_code,
  beap_chair_submission_mode,
  updated_by,
  updated_at
)
SELECT
  'GLOBAL',
  beap_chair_submission_mode,
  updated_by,
  updated_at
FROM state_workflow_settings
WHERE state_code <> 'GLOBAL'
ORDER BY updated_at DESC
LIMIT 1
ON CONFLICT (state_code) DO NOTHING;

INSERT INTO state_workflow_settings (state_code, beap_chair_submission_mode)
VALUES ('GLOBAL', 'complete_plan')
ON CONFLICT (state_code) DO NOTHING;

COMMIT;
