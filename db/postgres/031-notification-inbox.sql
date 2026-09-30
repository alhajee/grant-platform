BEGIN;

-- The notification bell also carries UBEC workflow events (submission to UBEC,
-- department assignment, department feedback). Each notification points at
-- exactly one state review event or one UBEC event.
ALTER TABLE plan_notifications ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE plan_notifications ADD COLUMN IF NOT EXISTS ubec_event_id INTEGER REFERENCES ubec_events(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_notifications_one_source') THEN
    ALTER TABLE plan_notifications ADD CONSTRAINT plan_notifications_one_source CHECK (num_nonnulls(event_id, ubec_event_id) = 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS plan_notifications_user_ubec_event_idx ON plan_notifications (user_id, ubec_event_id) WHERE ubec_event_id IS NOT NULL;
-- The bell lists a user's newest notifications and counts the unread ones.
CREATE INDEX IF NOT EXISTS plan_notifications_user_recent_idx ON plan_notifications (user_id, id DESC);

COMMIT;
