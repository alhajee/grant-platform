BEGIN;

-- Existing local data belongs to the Yobe workspace. New types belong to the
-- signed-in user's state, never to a client-supplied state identifier.
ALTER TABLE users ADD COLUMN IF NOT EXISTS state_code TEXT NOT NULL DEFAULT 'YO';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS state_code TEXT NOT NULL DEFAULT 'YO';

CREATE TABLE IF NOT EXISTS construction_types (
  id TEXT PRIMARY KEY,
  state_code TEXT NOT NULL,
  name TEXT NOT NULL,
  classrooms INTEGER CHECK (classrooms BETWEEN 0 AND 1000),
  playrooms_labs INTEGER CHECK (playrooms_labs BETWEEN 0 AND 1000),
  libraries INTEGER CHECK (libraries BETWEEN 0 AND 1000),
  toilets INTEGER CHECK (toilets BETWEEN 0 AND 1000),
  offices_stores INTEGER CHECK (offices_stores BETWEEN 0 AND 1000),
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 520),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost > 0),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (classrooms IS NULL AND playrooms_labs IS NULL AND libraries IS NULL AND toilets IS NULL AND offices_stores IS NULL)
    OR (classrooms IS NOT NULL AND playrooms_labs IS NOT NULL AND libraries IS NOT NULL AND toilets IS NOT NULL AND offices_stores IS NOT NULL
      AND classrooms + playrooms_labs + libraries + toilets + offices_stores > 0)
  ),
  UNIQUE (state_code, classrooms, playrooms_labs, libraries, toilets, offices_stores)
);

-- Preserve only templates already used by saved lines. Unknown room counts
-- remain NULL: these older descriptions do not specify all five counts.
INSERT INTO construction_types (id, state_code, name, duration, unit_cost)
SELECT legacy.id, 'YO', legacy.name, 20, legacy.unit_cost
FROM (VALUES
  ('six-classrooms', 'A block of six (6) classrooms storey building', 95503308.31),
  ('two-classrooms', 'A block of two (2) classrooms, office and store', 30350753.56),
  ('staff-rooms', 'Two (2) rooms, toilet, kitchen and store', 22583110.30),
  ('vip-toilet', 'Four (4) holes VIP toilet', 9567503.30),
  ('learning-shade', 'Learning shade for Non-Formal Education Centres', 6524600.50)
) AS legacy(id, name, unit_cost)
WHERE EXISTS (SELECT 1 FROM infrastructure_lines WHERE project_type = legacy.id)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'infrastructure_lines_construction_type_fk') THEN
    ALTER TABLE infrastructure_lines ADD CONSTRAINT infrastructure_lines_construction_type_fk
      FOREIGN KEY (project_type) REFERENCES construction_types(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Snapshot defaults so a school-specific exception cannot change other lines.
ALTER TABLE infrastructure_lines ADD COLUMN IF NOT EXISTS duration INTEGER CHECK (duration BETWEEN 1 AND 520);
ALTER TABLE infrastructure_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2) CHECK (unit_cost > 0);
UPDATE infrastructure_lines line SET duration = type.duration, unit_cost = type.unit_cost
FROM construction_types type WHERE type.id = line.project_type AND (line.duration IS NULL OR line.unit_cost IS NULL);
ALTER TABLE infrastructure_lines ALTER COLUMN duration SET NOT NULL;
ALTER TABLE infrastructure_lines ALTER COLUMN unit_cost SET NOT NULL;

COMMIT;
