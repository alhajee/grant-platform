-- UBEC231 / V2 UBEC05 (client, November 2026): ECCDE must be at least 15% of the plan's proposed budget before the BEAP
-- Chair sends anything to the Executive Chairman (lib/eccde-share.ts). Super Admin, platform-wide (Admin > Settings >
-- ECCDE share); on by default.
ALTER TABLE state_workflow_settings ADD COLUMN IF NOT EXISTS eccde_share_required BOOLEAN NOT NULL DEFAULT TRUE;

-- UBEC236: deleted users. An account nothing refers to is deleted outright; one that the records still refer to (review
-- history, decisions, comments…) is removed instead: deactivated, signed out, its email freed and hidden from every list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users(deleted_at) WHERE deleted_at IS NOT NULL;
-- A hard delete keeps the user-management record of it: the event's target becomes NULL and its details keep who it was.
ALTER TABLE user_management_events ALTER COLUMN target_id DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_management_events_target_id_fkey' AND confdeltype <> 'n') THEN
    ALTER TABLE user_management_events DROP CONSTRAINT user_management_events_target_id_fkey;
    ALTER TABLE user_management_events ADD CONSTRAINT user_management_events_target_id_fkey FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
