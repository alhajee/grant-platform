-- Sports beneficiary schools list (UBEC249, client 11 November 2026: "like how it is [for Greening] where you select your
-- multiple schools … and the quantities can be shared with Share evenly"). The schools that get Sports equipment are a list
-- like TLM's, kept in tlm_distribution with workstream 'sports'; the Allocate window shares each item across it. Every
-- school that already holds Sports equipment joins the list, so nothing is lost.
ALTER TABLE tlm_distribution DROP CONSTRAINT IF EXISTS tlm_distribution_workstream_check;
ALTER TABLE tlm_distribution ADD CONSTRAINT tlm_distribution_workstream_check CHECK (workstream IN ('tlm', 'curriculum', 'gscci', 'phe', 'sports'));
INSERT INTO tlm_distribution(plan_id, workstream, school_id)
SELECT DISTINCT line.plan_id, 'sports', allocation.school_id
FROM sports_allocations allocation JOIN sports_budget_lines line ON line.id = allocation.line_id
WHERE line.plan_id IS NOT NULL
ON CONFLICT DO NOTHING;
