import type { QueryResult, QueryResultRow } from 'pg';
import type { SubmissionLetter, SubmissionLetterKind } from './submission-letter';

type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
type Row = { id: string; kind: SubmissionLetterKind; name: string; size: number; drawn: boolean; uploaded_by_name: string; created_at: Date | string };
const toLetter = (r: Row): SubmissionLetter => ({ id: r.id, kind: r.kind, name: r.name, size: r.size, drawn: r.drawn, uploadedByName: r.uploaded_by_name, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at });
const columns = 'id,kind,name,size,drawn,uploaded_by_name,created_at';

/** UBEC132: the signature and cover letter waiting for the next submission to UBEC. */
export async function readPendingLetters(db: Db, planId: number): Promise<SubmissionLetter[]> {
  return (await db.query<Row>(`SELECT ${columns} FROM plan_submission_letters WHERE plan_id=$1 AND ubec_round_id IS NULL AND removed_at IS NULL ORDER BY kind`, [planId])).rows.map(toLetter);
}

/** The signature and cover letter sent with a UBEC round. */
export async function readRoundLetters(db: Db, roundId: number): Promise<SubmissionLetter[]> {
  return (await db.query<Row>(`SELECT ${columns} FROM plan_submission_letters WHERE ubec_round_id=$1 AND removed_at IS NULL ORDER BY kind`, [roundId])).rows.map(toLetter);
}

/** Sending to UBEC attaches the pending letters to the new round. */
export async function attachLetters(db: Db, planId: number, roundId: number): Promise<void> {
  await db.query('UPDATE plan_submission_letters SET ubec_round_id=$2 WHERE plan_id=$1 AND ubec_round_id IS NULL AND removed_at IS NULL', [planId, roundId]);
}
