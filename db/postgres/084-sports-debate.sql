-- Debate inside Sports, Quiz & Debate (UBEC167, client 30 October 2026): before entering Sports items the SUBEB sets how
-- much of the Sports allocation goes to Debate (₦0 allowed; Quiz gets none). Debate becomes a budget section whose lines
-- may use exactly that amount; the other sections' shares then apply to the rest of the Sports allocation.
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS debate_allocation NUMERIC(15, 2);
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_debate_allocation_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_debate_allocation_check CHECK (debate_allocation IS NULL OR debate_allocation >= 0);
ALTER TABLE sports_budget_lines DROP CONSTRAINT IF EXISTS sports_budget_lines_section_check;
ALTER TABLE sports_budget_lines ADD CONSTRAINT sports_budget_lines_section_check CHECK (section IN ('equipment', 'competitions', 'publicity', 'supervision', 'debate'));
