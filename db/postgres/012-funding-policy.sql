BEGIN;
CREATE TABLE funding_policies (
  id SERIAL PRIMARY KEY,
  allocation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL
);
INSERT INTO funding_policies(allocation,actor_name) VALUES
('{"shares":{"infrastructure":7500,"quality":500,"teachers":500,"sbmc":500,"sports":200,"monitoring":200,"curriculum":200,"planning":200,"gscci":200},"tlmWithinInfrastructure":2000}', 'Initial allocation');
ALTER TABLE action_plans ADD COLUMN funding_policy_id INTEGER REFERENCES funding_policies(id);
-- Existing plans retain the baseline; their saved costs and submissions are untouched.
UPDATE action_plans SET funding_policy_id=(SELECT MIN(id) FROM funding_policies);
ALTER TABLE action_plans ALTER COLUMN funding_policy_id SET NOT NULL;
ALTER TABLE action_plans ALTER COLUMN funding_policy_id SET DEFAULT 1;
COMMIT;
