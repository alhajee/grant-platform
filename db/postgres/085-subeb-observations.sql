-- Observations before sending to UBEC go to the state's own staff (UBEC168/194/179, client 30 October 2026): the SUBEB
-- Executive Chairman asks the SUBEB's Audit, Procurement, Finance and Special Programmes (their Director and Data Entry
-- Officer), not UBEC's. Requests made before keep going to UBEC (audience 'ubec'); new ones are 'subeb'. The department
-- CHECKs on plan_observation_departments and plan_comments already allow the four departments (migration 081).
ALTER TABLE plan_observation_requests ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'ubec';
ALTER TABLE plan_observation_requests DROP CONSTRAINT IF EXISTS plan_observation_requests_audience_check;
ALTER TABLE plan_observation_requests ADD CONSTRAINT plan_observation_requests_audience_check CHECK (audience IN ('ubec', 'subeb'));
