-- DNEMIS school sync (lib/dnemis-sync.ts): public pre-primary, primary and JSS schools are imported from DNEMIS
-- (DHIS2) into the school register and refreshed on a schedule set by the Super Admin.
-- * schools.dnemis_id: the DHIS2 organisation unit id. Set only on schools that came from DNEMIS; the sync never
--   touches schools without it (schools added by hand). school_code holds the 10-digit DNEMIS school code.
-- * facilities / teachers: small typed summaries of the census form (see SchoolFacilities in lib/school-register.ts).
-- * DNEMIS has schools with the same name in one LGA, so (state, name, LGA, level) stays unique only for schools
--   added by hand.
-- * dnemis_sync_runs: one row per sync (queued, running, ok, failed). At most one queued or running row at a time.
--   triggered_by is a name only (no FK to users, so TRUNCATE users CASCADE cannot clear it).
-- * integration_settings.sync_*: the automatic refresh (off, daily or weekly at a time of day, Africa/Lagos).
BEGIN;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS dnemis_id TEXT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS dnemis_synced_at TIMESTAMPTZ;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS dnemis_year INTEGER;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS ward TEXT NOT NULL DEFAULT '';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS facilities JSONB;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS teachers JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS schools_dnemis_id_key ON schools (dnemis_id);
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_facilities_check;
ALTER TABLE schools ADD CONSTRAINT schools_facilities_check CHECK (facilities IS NULL OR jsonb_typeof(facilities) = 'object');
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_teachers_check;
ALTER TABLE schools ADD CONSTRAINT schools_teachers_check CHECK (teachers IS NULL OR jsonb_typeof(teachers) = 'object');

ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_state_name_lga_level_key;
CREATE UNIQUE INDEX IF NOT EXISTS schools_manual_name_lga_level_key ON schools (state_code, name, lga, level) WHERE dnemis_id IS NULL;

CREATE TABLE IF NOT EXISTS dnemis_sync_runs (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ok', 'failed')),
  scope TEXT NOT NULL DEFAULT 'all',
  triggered_by TEXT NOT NULL DEFAULT '',
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  schools_created INTEGER NOT NULL DEFAULT 0,
  schools_updated INTEGER NOT NULL DEFAULT 0,
  schools_skipped INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS dnemis_sync_runs_one_active ON dnemis_sync_runs ((TRUE)) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS dnemis_sync_runs_recent ON dnemis_sync_runs (id DESC);

ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS sync_schedule TEXT NOT NULL DEFAULT 'off';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS sync_weekday SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS sync_time TEXT NOT NULL DEFAULT '02:00';
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS sync_schedule_updated_at TIMESTAMPTZ;
ALTER TABLE integration_settings ADD COLUMN IF NOT EXISTS sync_last_slot TIMESTAMPTZ;
ALTER TABLE integration_settings DROP CONSTRAINT IF EXISTS integration_settings_sync_schedule_check;
ALTER TABLE integration_settings ADD CONSTRAINT integration_settings_sync_schedule_check CHECK (
  sync_schedule IN ('off', 'daily', 'weekly') AND sync_weekday BETWEEN 0 AND 6 AND sync_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

COMMIT;
