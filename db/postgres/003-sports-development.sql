BEGIN;

CREATE TABLE IF NOT EXISTS sports_budget_lines (
  id SERIAL PRIMARY KEY,
  state_code TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL CHECK (section IN ('equipment', 'competitions', 'publicity', 'supervision')),
  activity_type TEXT NOT NULL CHECK (length(trim(activity_type)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1000),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (unit_cost * quantity * 100 <= 9007199254740991)
);
CREATE INDEX IF NOT EXISTS idx_sports_budget_state ON sports_budget_lines(state_code);

-- Each school can receive several equipment items; quantities are not costs
-- and must never be counted a second time in the pillar's budget.
CREATE TABLE IF NOT EXISTS sports_allocations (
  id SERIAL PRIMARY KEY,
  line_id INTEGER NOT NULL REFERENCES sports_budget_lines(id) ON DELETE RESTRICT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  longitude TEXT NOT NULL DEFAULT '',
  latitude TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, line_id)
);
CREATE INDEX IF NOT EXISTS idx_sports_allocations_line ON sports_allocations(line_id);

-- Intentionally no seeded sports, activities, budget lines or beneficiaries.
COMMIT;
