-- UBEC245 (client, 7 November 2026): "GSCCI Pillar 4: Greening communities" (Greening activity 3) is not shared out to
-- the distribution list's schools any more. Its earlier allocations (activity_line_schools rows of those lines) are
-- removed so they never count towards the schools, the spending by school level or the send checks. Greening lines have
-- no other line schools, so only allocations go. Saved submissions and UBEC rounds keep their snapshots.
-- Idempotent: a second run finds nothing to delete.
DELETE FROM activity_line_schools s
USING activity_plan_lines l
WHERE s.line_id = l.id AND l.workstream = 'gscci' AND l.activity = 3;
