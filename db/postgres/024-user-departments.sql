BEGIN;

CREATE TABLE IF NOT EXISTS user_departments (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, department)
);

CREATE INDEX IF NOT EXISTS user_departments_department_idx
  ON user_departments (department, user_id);

-- A nominated BEAP Chair is a Director but performs a separate consolidation
-- role, so one ordinary department Director may overlap with that assignment.
DROP INDEX IF EXISTS one_active_subeb_department_director;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_subeb_department_director
  ON users(state_code, department)
  WHERE role='Director' AND active AND department IS NOT NULL AND NOT is_beap_chair;

-- Preserve every existing assignment when this migration is introduced.
INSERT INTO user_departments (user_id, department)
SELECT id, department
FROM users
WHERE department IS NOT NULL AND department <> ''
ON CONFLICT DO NOTHING;

COMMIT;
