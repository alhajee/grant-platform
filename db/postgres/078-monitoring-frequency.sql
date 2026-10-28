-- Frequency (number of visits) on "Allowances for monitoring officers" (UBEC164, Supervision & Monitoring activity 2).
-- The line's amount is officers × visits × unit cost. `quantity` keeps the line's whole multiplier (officers × visits),
-- so every total, cap and snapshot stays quantity × unit cost; `frequency` records the visits, and the officers are
-- quantity ÷ frequency. NULL on every other line and on allowance lines saved before this (one visit).
ALTER TABLE activity_plan_lines ADD COLUMN IF NOT EXISTS frequency INTEGER;
DO $$ BEGIN
  ALTER TABLE activity_plan_lines ADD CONSTRAINT activity_plan_lines_frequency_check CHECK (
    frequency IS NULL OR (workstream = 'monitoring' AND activity = 2 AND frequency BETWEEN 1 AND 10000 AND quantity % frequency = 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
