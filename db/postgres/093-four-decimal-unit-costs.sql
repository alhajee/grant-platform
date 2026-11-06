-- UBEC238 (client, 6 November 2026): unit costs are entered and kept to four decimals (₦1,250.0202), and
-- quantity × unit cost is exact. Widens the scale of every unit cost and stored package total from 2 to 4 decimals,
-- with two more digits of precision so the largest whole-naira value each column took before still fits.
-- Widening only: every stored value keeps its amount exactly (12.50 becomes 12.5000). Idempotent: a column already at
-- the new type is left alone. Funding figures (state contribution, funding sources, budget splits, Debate) stay
-- NUMERIC(…, 2): they are typed to the kobo.

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('activity_plan_lines', 'unit_cost', 16),
      ('sports_budget_lines', 'unit_cost', 16),
      ('infrastructure_lines', 'unit_cost', 16),
      ('construction_types', 'unit_cost', 16),
      ('procurement_items', 'unit_price', 17),
      ('infrastructure_packages', 'total_cost', 20),
      ('retired_sbmc_lines', 'unit_cost', 16),
      ('retired_gscci_lines', 'unit_cost', 16)
    ) AS t(table_name, column_name, precision)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = target.table_name AND c.column_name = target.column_name
        AND (c.numeric_scale IS DISTINCT FROM 4 OR c.numeric_precision IS DISTINCT FROM target.precision)
        AND COALESCE(c.numeric_scale, 0) <= 4 AND COALESCE(c.numeric_precision - c.numeric_scale, 0) <= target.precision - 4
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE NUMERIC(%s, 4)', target.table_name, target.column_name, target.precision);
    END IF;
  END LOOP;
END $$;
