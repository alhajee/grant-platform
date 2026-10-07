-- Timeline: the implementation quarters of every component line (lib/line-quarters.ts, components/quarter-timeline.tsx).
-- Activity lines (SBMC, TLM, Monitoring, GSCCI, Curriculum, QA, ICT, Teacher Development, Planning), sports budget
-- lines and infrastructure packages each carry a non-empty set of quarters drawn from their plan's quarters
-- (action_plans.funding_quarters; a legacy plan without quarters covers Q1-Q4). The APIs check the subset rule under
-- the plan row lock; the database checks the shape. Existing rows are backfilled with their plan's quarters, and a
-- trigger fills a missing value the same way, so older clients and scripts that do not send quarters keep working.
-- Additive and idempotent.
BEGIN;

CREATE OR REPLACE FUNCTION beapms_plan_quarters(plan INTEGER) RETURNS SMALLINT[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT array_agg(DISTINCT q ORDER BY q)::smallint[] FROM unnest(p.funding_quarters) q WHERE q BETWEEN 1 AND 4), ARRAY[1,2,3,4]::smallint[])
  FROM action_plans p WHERE p.id = plan
$$;

-- Non-empty, at most four, each 1-4, no repeats and no NULL elements (a function: CHECK cannot hold a subquery).
CREATE OR REPLACE FUNCTION beapms_valid_quarters(quarters SMALLINT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(quarters) BETWEEN 1 AND 4 AND array_position(quarters, NULL) IS NULL
    AND quarters <@ ARRAY[1,2,3,4]::smallint[] AND (SELECT count(DISTINCT q) FROM unnest(quarters) q) = cardinality(quarters)
$$;

CREATE OR REPLACE FUNCTION beapms_default_line_quarters() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quarters IS NULL THEN NEW.quarters := beapms_plan_quarters(NEW.plan_id); END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['activity_plan_lines', 'sports_budget_lines', 'infrastructure_packages'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS quarters SMALLINT[]', t);
    EXECUTE format('UPDATE %I l SET quarters = beapms_plan_quarters(l.plan_id) WHERE l.quarters IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN quarters SET NOT NULL', t);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_quarters_check');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (beapms_valid_quarters(quarters))', t, t || '_quarters_check');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_default_quarters', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF quarters ON %I FOR EACH ROW EXECUTE FUNCTION beapms_default_line_quarters()', t || '_default_quarters', t);
  END LOOP;
END $$;

COMMIT;
