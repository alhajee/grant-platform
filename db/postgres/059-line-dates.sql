-- Line timelines without gaps, and expected start and due dates (lib/line-quarters.ts, lib/line-dates.ts).
-- 1. A timeline is one unbroken run of quarters (Q1–Q3 yes, Q1 + Q4 no). Lines saved with gaps are filled in
--    (Q1 + Q3 becomes Q1–Q3; plans already use unbroken quarters, so the filled run stays inside the plan), then
--    beapms_valid_quarters (the CHECK on activity_plan_lines, sports_budget_lines and infrastructure_packages)
--    also requires the run to be unbroken.
-- 2. start_date / due_date on the same three tables: days inside the line's quarters in the plan's implementation
--    year (checked by the APIs under the plan lock). NULL only on lines saved before this migration.
-- Additive and idempotent.
BEGIN;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['activity_plan_lines', 'sports_budget_lines', 'infrastructure_packages'] LOOP
    EXECUTE format($q$UPDATE %I SET quarters = ARRAY(SELECT generate_series((SELECT min(q)::int FROM unnest(quarters) q), (SELECT max(q)::int FROM unnest(quarters) q)))::smallint[]
      WHERE (SELECT max(q) - min(q) + 1 FROM unnest(quarters) q) <> cardinality(quarters)$q$, t);
  END LOOP;
END $$;

-- Non-empty, at most four, each 1-4, no repeats, no NULL elements, and no gaps.
CREATE OR REPLACE FUNCTION beapms_valid_quarters(quarters SMALLINT[]) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(quarters) BETWEEN 1 AND 4 AND array_position(quarters, NULL) IS NULL
    AND quarters <@ ARRAY[1,2,3,4]::smallint[] AND (SELECT count(DISTINCT q) FROM unnest(quarters) q) = cardinality(quarters)
    AND (SELECT max(q) - min(q) + 1 FROM unnest(quarters) q) = cardinality(quarters)
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['activity_plan_lines', 'sports_budget_lines', 'infrastructure_packages'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS start_date DATE', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS due_date DATE', t);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_dates_check');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ((start_date IS NULL) = (due_date IS NULL) AND (due_date IS NULL OR due_date >= start_date))', t, t || '_dates_check');
  END LOOP;
END $$;

COMMIT;
