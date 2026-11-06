-- Bug sheet 16 (6 November 2026). Additive and idempotent.
--
-- UBEC219: Sports budget lines name one or more target groups, like the activity lines (stored joined, "Schools, Teachers").
-- Lines saved before keep '' until edited; the save API requires it on new saves and edits.
--
-- UBEC233: line reference codes count from 001 in every plan and component, and carry the plan's year without its
-- quarters (UBEC/SUBEB/SPORT/001/2026, then 002 …), replacing the global line id and the " · Q1–Q4" period of migration 053.
-- A BEFORE INSERT trigger numbers each new line, Sports lines included (the Sports API no longer builds the code): the
-- next number is the highest in that plan and component + 1, taken under a per-plan advisory transaction lock, so two
-- saves at once never get the same number (the save routes already hold the plan row lock; the lock also covers any
-- other insert path). Codes are unique per plan now, not across plans. Existing lines are renumbered by creation order
-- (id). Snapshots of earlier submissions keep the codes they were taken with.
BEGIN;

ALTER TABLE sports_budget_lines ADD COLUMN IF NOT EXISTS target_group TEXT NOT NULL DEFAULT '';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sports_budget_lines_target_group_check') THEN
    ALTER TABLE sports_budget_lines ADD CONSTRAINT sports_budget_lines_target_group_check CHECK (length(target_group) <= 1000);
  END IF;
END $$;

-- The plan's year(s) only: "2026", or "2026–2027" for a plan spanning years.
CREATE OR REPLACE FUNCTION beapms_plan_year(plan_id INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN start_year = end_year THEN start_year::text ELSE start_year::text || '–' || end_year::text END FROM action_plans WHERE id = plan_id
$$;

-- The number inside a code (UBEC/SUBEB/<component>/<number>/<year>), 0 when it has none.
CREATE OR REPLACE FUNCTION beapms_code_number(code TEXT) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN split_part(code, '/', 4) ~ '^[0-9]{1,9}$' THEN split_part(code, '/', 4)::integer ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION beapms_format_line_code(component TEXT, number INTEGER, plan_id INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT 'UBEC/SUBEB/' || component || '/' || LPAD(number::text, GREATEST(3, LENGTH(number::text)), '0') || '/' || COALESCE(beapms_plan_year(plan_id), '')
$$;

-- The next code for a component of a plan, across the three line tables (each component lives in one of them).
CREATE OR REPLACE FUNCTION beapms_next_line_code(component TEXT, plan INTEGER) RETURNS TEXT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  pattern TEXT := 'UBEC/SUBEB/' || component || '/%';
  highest INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('beapms:line-code:' || plan));
  SELECT GREATEST(
    COALESCE((SELECT MAX(beapms_code_number(code)) FROM activity_plan_lines WHERE plan_id = plan AND code LIKE pattern), 0),
    COALESCE((SELECT MAX(beapms_code_number(code)) FROM sports_budget_lines WHERE plan_id = plan AND code LIKE pattern), 0),
    COALESCE((SELECT MAX(beapms_code_number(code)) FROM infrastructure_packages WHERE plan_id = plan AND code LIKE pattern), 0)
  ) INTO highest;
  RETURN beapms_format_line_code(component, highest + 1, plan);
END $$;

CREATE OR REPLACE FUNCTION beapms_set_activity_line_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN NEW.code := beapms_next_line_code(beapms_activity_component_code(NEW.workstream), NEW.plan_id); END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION beapms_set_package_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN NEW.code := beapms_next_line_code('INFRA', NEW.plan_id); END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION beapms_set_sports_line_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN NEW.code := beapms_next_line_code('SPORT', NEW.plan_id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sports_budget_lines_code ON sports_budget_lines;
CREATE TRIGGER sports_budget_lines_code BEFORE INSERT ON sports_budget_lines FOR EACH ROW EXECUTE FUNCTION beapms_set_sports_line_code();

-- Codes repeat across plans now: unique within a plan only.
ALTER TABLE sports_budget_lines DROP CONSTRAINT IF EXISTS sports_budget_lines_code_key;
DROP INDEX IF EXISTS sports_budget_lines_code_key;
DROP INDEX IF EXISTS activity_plan_lines_code_key;
DROP INDEX IF EXISTS infrastructure_packages_code_key;
DROP INDEX IF EXISTS sports_budget_lines_plan_code_key;
DROP INDEX IF EXISTS activity_plan_lines_plan_code_key;
DROP INDEX IF EXISTS infrastructure_packages_plan_code_key;

-- Renumber every line by creation order within its plan and component.
UPDATE activity_plan_lines l SET code = beapms_format_line_code(n.component, n.number, l.plan_id)
  FROM (SELECT id, beapms_activity_component_code(workstream) AS component, ROW_NUMBER() OVER (PARTITION BY plan_id, beapms_activity_component_code(workstream) ORDER BY id)::integer AS number FROM activity_plan_lines) n
  WHERE n.id = l.id AND l.code IS DISTINCT FROM beapms_format_line_code(n.component, n.number, l.plan_id);
UPDATE sports_budget_lines l SET code = beapms_format_line_code('SPORT', n.number, l.plan_id)
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY id)::integer AS number FROM sports_budget_lines) n
  WHERE n.id = l.id AND l.code IS DISTINCT FROM beapms_format_line_code('SPORT', n.number, l.plan_id);
UPDATE infrastructure_packages l SET code = beapms_format_line_code('INFRA', n.number, l.plan_id)
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY id)::integer AS number FROM infrastructure_packages) n
  WHERE n.id = l.id AND l.code IS DISTINCT FROM beapms_format_line_code('INFRA', n.number, l.plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS activity_plan_lines_plan_code_key ON activity_plan_lines (plan_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS sports_budget_lines_plan_code_key ON sports_budget_lines (plan_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS infrastructure_packages_plan_code_key ON infrastructure_packages (plan_id, code);

COMMIT;
