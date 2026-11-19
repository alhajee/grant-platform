// UBEC268: the approval letter's number, given when the UBEC BEAP Chair approves a round (inside that transaction).
import type { PoolClient } from 'pg';

/**
 * Gives the round its reference number (next serial of the Lagos year) and pins the letterhead and signature in force
 * (migration 105; NULL = the built-in ones), so a later signatory never changes it. A round that already has one keeps it.
 */
export async function issueApprovalLetter(db: Pick<PoolClient, 'query'>, roundId: number): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('beapms:approval-letter-serial'))");
  const current = (kind: string) => `(SELECT id FROM letter_assets WHERE kind='${kind}' AND removed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1)`;
  await db.query(`INSERT INTO ubec_approval_letters(round_id, year, serial, issued_at, letterhead_id, signature_id)
    SELECT $1, y, COALESCE((SELECT MAX(serial) FROM ubec_approval_letters WHERE year = y), 0) + 1, NOW(), ${current('letterhead')}, ${current('signature')}
    FROM (SELECT EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Africa/Lagos')::int AS y) t
    ON CONFLICT (round_id) DO NOTHING`, [roundId]);
}
