// UBEC268: the approval letter's number, given when the UBEC BEAP Chair approves a round (inside that transaction).
import type { PoolClient } from 'pg';

/** Gives the round its reference number (next serial of the Lagos year); a round that already has one keeps it. */
export async function issueApprovalLetter(db: Pick<PoolClient, 'query'>, roundId: number): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('beapms:approval-letter-serial'))");
  await db.query(`INSERT INTO ubec_approval_letters(round_id, year, serial, issued_at)
    SELECT $1, y, COALESCE((SELECT MAX(serial) FROM ubec_approval_letters WHERE year = y), 0) + 1, NOW()
    FROM (SELECT EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Africa/Lagos')::int AS y) t
    ON CONFLICT (round_id) DO NOTHING`, [roundId]);
}
