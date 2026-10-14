-- Greening (GSCCI) lines name their item (client's "New Improvement", October 2026): one of the activity's listed
-- procurement items or a typed one (lib/activity-extras.ts gscciItemsByActivity). Required by the line schema on
-- save; the database checks only shape, and that no other component uses it. Existing lines keep '' until edited.
-- Additive and idempotent.
BEGIN;

ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS item TEXT NOT NULL DEFAULT '';
ALTER TABLE activity_plan_lines DROP CONSTRAINT IF EXISTS activity_plan_lines_item_check;
ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_item_check
  CHECK (item = btrim(item) AND char_length(item) <= 100 AND (workstream = 'gscci' OR item = ''));

COMMIT;
