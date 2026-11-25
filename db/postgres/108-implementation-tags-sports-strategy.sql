-- Client feedback, 25 November 2026.
-- 1. An Oversight Department marks an observation "For implementation": it is followed up during implementation and
--    never holds the UBEC BEAP Chair's approval (the comment stays open and readable).
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS for_implementation_at TIMESTAMPTZ;
ALTER TABLE plan_comments ADD COLUMN IF NOT EXISTS for_implementation_by TEXT;
-- 2. Sports lines name their implementation strategy like the other components ('' on lines saved before).
ALTER TABLE sports_budget_lines ADD COLUMN IF NOT EXISTS strategy TEXT NOT NULL DEFAULT '';
ALTER TABLE sports_budget_lines DROP CONSTRAINT IF EXISTS sports_budget_lines_strategy_check;
ALTER TABLE sports_budget_lines ADD CONSTRAINT sports_budget_lines_strategy_check CHECK (length(strategy) <= 200);
-- 3. A decision carried into a resubmission (item accepted before and unchanged) records the submission it came from;
--    it is locked for the officers (their Director can still change it, which clears the mark).
ALTER TABLE ubec_item_decisions ADD COLUMN IF NOT EXISTS carried_from INTEGER;
