-- Every budget line gets a reference code, like Sports lines already do (UBEC/SUBEB/SPORT/066/2026 · Q1–Q4):
--   UBEC/SUBEB/<COMPONENT>/<line id, at least 3 digits>/<plan period>
-- Components: SBMC, TLM, MON (Supervision & Monitoring), GSCCI, CURR (Curriculum), QA, ICT, TD (Teacher Development),
-- PRS (Planning, Research & Statistics) on activity_plan_lines; INFRA on infrastructure_packages. The plan period is
-- the same text as planPeriod() in lib/action-plans.ts ("2026 · Q1–Q4"). A trigger sets the code on insert (so no
-- save route has to), and it never changes afterwards, even if the plan's quarters are edited. Idempotent.
BEGIN;

CREATE OR REPLACE FUNCTION beapms_plan_period(plan_id INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
  WITH p AS (SELECT start_year, end_year, COALESCE(funding_quarters, '{}') AS quarters FROM action_plans WHERE id = plan_id),
  q AS (SELECT DISTINCT unnest(quarters) AS n FROM p),
  runs AS (SELECT n, n - ROW_NUMBER() OVER (ORDER BY n) AS grp FROM q WHERE n BETWEEN 1 AND 4),
  ranges AS (SELECT MIN(n) AS lo, MAX(n) AS hi FROM runs GROUP BY grp)
  SELECT CASE WHEN p.start_year = p.end_year
    THEN p.start_year::text || COALESCE(' · ' || (SELECT string_agg(CASE WHEN lo = hi THEN 'Q' || lo ELSE 'Q' || lo || '–Q' || hi END, ', ' ORDER BY lo) FROM ranges), '')
    ELSE p.start_year::text || '–' || p.end_year::text END
  FROM p
$$;

CREATE OR REPLACE FUNCTION beapms_line_code(component TEXT, line_id INTEGER, plan_id INTEGER) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT 'UBEC/SUBEB/' || component || '/' || LPAD(line_id::text, GREATEST(3, LENGTH(line_id::text)), '0') || '/' || COALESCE(beapms_plan_period(plan_id), '')
$$;

CREATE OR REPLACE FUNCTION beapms_activity_component_code(workstream TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE workstream WHEN 'sbmc' THEN 'SBMC' WHEN 'tlm' THEN 'TLM' WHEN 'monitoring' THEN 'MON' WHEN 'gscci' THEN 'GSCCI'
    WHEN 'curriculum' THEN 'CURR' WHEN 'quality' THEN 'QA' WHEN 'ict' THEN 'ICT' WHEN 'teachers' THEN 'TD' WHEN 'planning' THEN 'PRS'
    ELSE upper(workstream) END
$$;

ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE infrastructure_packages ADD COLUMN IF NOT EXISTS code TEXT;

CREATE OR REPLACE FUNCTION beapms_set_activity_line_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN NEW.code := beapms_line_code(beapms_activity_component_code(NEW.workstream), NEW.id, NEW.plan_id); END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION beapms_set_package_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN NEW.code := beapms_line_code('INFRA', NEW.id, NEW.plan_id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS activity_plan_lines_code ON activity_plan_lines;
CREATE TRIGGER activity_plan_lines_code BEFORE INSERT ON activity_plan_lines FOR EACH ROW EXECUTE FUNCTION beapms_set_activity_line_code();
DROP TRIGGER IF EXISTS infrastructure_packages_code ON infrastructure_packages;
CREATE TRIGGER infrastructure_packages_code BEFORE INSERT ON infrastructure_packages FOR EACH ROW EXECUTE FUNCTION beapms_set_package_code();

UPDATE activity_plan_lines SET code = beapms_line_code(beapms_activity_component_code(workstream), id, plan_id) WHERE code IS NULL;
UPDATE infrastructure_packages SET code = beapms_line_code('INFRA', id, plan_id) WHERE code IS NULL;
ALTER TABLE activity_plan_lines ALTER COLUMN code SET NOT NULL;
ALTER TABLE infrastructure_packages ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activity_plan_lines_code_key ON activity_plan_lines (code);
CREATE UNIQUE INDEX IF NOT EXISTS infrastructure_packages_code_key ON infrastructure_packages (code);

COMMIT;
