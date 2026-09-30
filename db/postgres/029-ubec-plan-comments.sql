BEGIN;

-- UBEC review comments share plan_comments with the state review chain (migration 028).
-- scope 'state' threads belong to the SUBEB review chain; scope 'ubec' threads are written by the
-- UBEC Executive Secretary and Department Reviewers on a submitted round's snapshot (ubec_round_id).
-- UBEC threads are internal until the ES ticks them when returning the plan: shared_at and
-- shared_by_name are then set on the root comment and the SUBEB sees the thread (see CLAUDE.md).
-- The NOT NULL DEFAULT fills every existing (state) row with 'state'.
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'state';
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS ubec_round_id INTEGER REFERENCES ubec_rounds(id) ON DELETE CASCADE;
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS shared_by_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_comments_scope_check') THEN
    ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_scope_check CHECK (scope IN ('state', 'ubec'));
  END IF;
  -- A UBEC thread always belongs to the round it was written on; state threads never do.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_comments_ubec_round_check') THEN
    ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_ubec_round_check CHECK ((scope = 'ubec') = (ubec_round_id IS NOT NULL));
  END IF;
  -- Only UBEC root comments can be shared, and sharing records both the time and the ES name.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_comments_shared_check') THEN
    ALTER TABLE plan_comments ADD CONSTRAINT plan_comments_shared_check CHECK (
      (shared_at IS NULL AND shared_by_name IS NULL) OR
      (scope = 'ubec' AND parent_id IS NULL AND shared_at IS NOT NULL AND shared_by_name IS NOT NULL)
    );
  END IF;
END $$;

-- One open thread per cell or row, per scope (and per UBEC round), like Google Sheets.
DROP INDEX IF EXISTS plan_comments_one_open_thread_idx;
CREATE UNIQUE INDEX IF NOT EXISTS plan_comments_one_open_thread_scope_idx ON plan_comments (plan_id, scope, COALESCE(ubec_round_id, 0), sheet, row_ref, COALESCE(column_id, '')) WHERE parent_id IS NULL AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS plan_comments_ubec_round_idx ON plan_comments (ubec_round_id, pillar) WHERE ubec_round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_comments_ubec_shared_idx ON plan_comments (plan_id) WHERE scope = 'ubec' AND shared_at IS NOT NULL;

COMMIT;
