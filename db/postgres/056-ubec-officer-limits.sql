-- UBEC Assessment Officers: how many each component department may have, and the default officers of each component
-- (lib/ubec-officer-limits.ts, Admin > Workflow settings > UBEC Assessment Officers).
--
-- ubec_officer_limits: the most active Assessment Officers a department may have. Without a row the limit is the
-- department's number of components (one officer per component: Physical Planning 2, Academic Services 4, the others 1).
-- Adding or reactivating an officer beyond it is refused (UBEC Officers page, Admin > Users). No foreign key to users,
-- so TRUNCATE users CASCADE leaves it alone.
--
-- ubec_default_officers: the officers the release assigns to a component automatically ("Assigned by default (Admin)").
-- No row for a component = the Director assigns as before. It references users, so TRUNCATE users CASCADE empties it:
-- it is configuration and must be set again on Admin after such a reset.
BEGIN;

CREATE TABLE IF NOT EXISTS ubec_officer_limits (
  department TEXT PRIMARY KEY CHECK (department IN ('physical', 'planning', 'academic', 'teachers', 'digital', 'quality', 'social')),
  max_officers INTEGER NOT NULL CHECK (max_officers BETWEEN 1 AND 50),
  updated_by_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ubec_default_officers (
  pillar TEXT NOT NULL,
  officer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_by_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pillar, officer_id)
);
CREATE INDEX IF NOT EXISTS ubec_default_officers_officer_idx ON ubec_default_officers (officer_id);

COMMIT;
