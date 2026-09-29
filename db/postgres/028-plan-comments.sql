BEGIN;

-- Google-Sheets-style review comments on the plan workbook. A root comment
-- (parent_id NULL) targets one cell (column_id set) or a whole row (column_id
-- NULL); replies point at their root and copy its target. row_ref is the
-- workbook row id (the durable database id of the line, package or school);
-- target_label snapshots "<column> · <row>" so a thread stays readable after
-- the row is deleted. resolved_* is only set on root comments.
CREATE TABLE IF NOT EXISTS plan_comments (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  pillar TEXT NOT NULL CHECK (pillar IN ('infrastructure','sports','sbmc','tlm')),
  sheet TEXT NOT NULL CHECK (sheet IN ('infrastructure','sports','sbmc','tlm','distribution')),
  row_ref TEXT NOT NULL CHECK (row_ref ~ '^-?[1-9][0-9]{0,17}$'),
  column_id TEXT CHECK (column_id IS NULL OR column_id ~ '^[A-Za-z]{1,40}$'),
  parent_id BIGINT REFERENCES plan_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_name TEXT,
  submission_number INTEGER NOT NULL DEFAULT 0,
  target_label TEXT NOT NULL DEFAULT '',
  CHECK (parent_id IS NULL OR resolved_at IS NULL)
);

CREATE INDEX IF NOT EXISTS plan_comments_plan_pillar_idx ON plan_comments (plan_id, pillar, id);
CREATE INDEX IF NOT EXISTS plan_comments_parent_idx ON plan_comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS plan_comments_open_idx ON plan_comments (plan_id, pillar) WHERE parent_id IS NULL AND resolved_at IS NULL;
-- One open thread per cell or row, like Google Sheets.
CREATE UNIQUE INDEX IF NOT EXISTS plan_comments_one_open_thread_idx ON plan_comments (plan_id, sheet, row_ref, COALESCE(column_id, '')) WHERE parent_id IS NULL AND resolved_at IS NULL;

COMMIT;
