BEGIN;
-- Delegation is opt-in. Chairmen retain plan creation through their role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_create_plan BOOLEAN NOT NULL DEFAULT FALSE;
COMMIT;
