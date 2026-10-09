-- Idempotent creates for budget items (weak connections: a save that reached the server but whose response was lost
-- must not be stored twice when the user tries again). The editor sends a client key (a UUID made when a draft is
-- started) with every create; the API returns the row already saved with that key instead of inserting another
-- (or re-checking the caps against a total that already includes it). Old clients send no key: unchanged behaviour.
-- Additive and idempotent.
BEGIN;

ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS client_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS activity_plan_lines_client_key_idx ON activity_plan_lines(plan_id, client_key) WHERE client_key IS NOT NULL;

ALTER TABLE sports_budget_lines ADD COLUMN IF NOT EXISTS client_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS sports_budget_lines_client_key_idx ON sports_budget_lines(plan_id, client_key) WHERE client_key IS NOT NULL;

-- Allocations hang off a sports line (no plan_id); the API looks a key up through the line's plan.
ALTER TABLE sports_allocations ADD COLUMN IF NOT EXISTS client_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS sports_allocations_client_key_idx ON sports_allocations(line_id, client_key) WHERE client_key IS NOT NULL;

ALTER TABLE infrastructure_packages ADD COLUMN IF NOT EXISTS client_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS infrastructure_packages_client_key_idx ON infrastructure_packages(plan_id, client_key) WHERE client_key IS NOT NULL;

COMMIT;
