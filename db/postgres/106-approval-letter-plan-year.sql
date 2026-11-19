-- UBEC268 (client note, 19 November 2026): the approval letter's reference carries the action plan's state and year
-- (UBEC/DPP/BEAP/<state>/<plan year>/<serial>), not the year it was approved. Letters already issued are numbered
-- again from 1 per plan year, in the order they were approved (production had none on 19 November 2026).
BEGIN;
CREATE TEMP TABLE approval_letter_renumber ON COMMIT DROP AS
SELECT l.round_id, p.start_year AS year, ROW_NUMBER() OVER (PARTITION BY p.start_year ORDER BY l.issued_at, l.round_id)::int AS serial
FROM ubec_approval_letters l JOIN ubec_rounds r ON r.id = l.round_id JOIN action_plans p ON p.id = r.plan_id;
-- Out of the way first, so UNIQUE (year, serial) holds after every row.
UPDATE ubec_approval_letters SET serial = serial + 1000000;
UPDATE ubec_approval_letters l SET year = n.year, serial = n.serial FROM approval_letter_renumber n WHERE n.round_id = l.round_id;
COMMIT;
