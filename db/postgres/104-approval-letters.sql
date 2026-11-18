-- UBEC268: UBEC's approval letter for each approved round. The reference number (UBEC/DPP/BEAP/<state>/<year>/<serial>)
-- is given once, at approval, numbered per year from 1; the letter itself is drawn from the round's snapshot on request.
BEGIN;
CREATE TABLE IF NOT EXISTS ubec_approval_letters (
  round_id INTEGER PRIMARY KEY REFERENCES ubec_rounds(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 2004 AND 2100),
  serial INTEGER NOT NULL CHECK (serial > 0),
  issued_at TIMESTAMPTZ NOT NULL,
  UNIQUE (year, serial)
);
-- Rounds approved before this migration, in the order they were approved.
INSERT INTO ubec_approval_letters(round_id, year, serial, issued_at)
SELECT id, y, ROW_NUMBER() OVER (PARTITION BY y ORDER BY decided_at, id), decided_at
FROM (SELECT id, decided_at, EXTRACT(YEAR FROM decided_at AT TIME ZONE 'Africa/Lagos')::int AS y FROM ubec_rounds WHERE status = 'approved' AND decided_at IS NOT NULL) r
WHERE NOT EXISTS (SELECT 1 FROM ubec_approval_letters l WHERE l.round_id = r.id)
ON CONFLICT DO NOTHING;
COMMIT;
