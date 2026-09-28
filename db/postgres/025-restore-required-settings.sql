BEGIN;

-- A broad TRUNCATE ... CASCADE can remove these rows through their optional
-- user references. Restore only missing platform defaults and preserve every
-- administrator-configured value that is still present.
INSERT INTO state_workflow_settings (state_code, beap_chair_submission_mode)
VALUES ('GLOBAL', 'complete_plan')
ON CONFLICT (state_code) DO NOTHING;

COMMIT;
