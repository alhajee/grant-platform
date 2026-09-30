import type { QueryResult, QueryResultRow } from 'pg';
import type { ImplementedPillar } from './beap-pillars';
import type { Snapshot } from './plan-review';
import { activePillars, type UbecRound } from './ubec';
import { commentColumns, commentSheets, sheetRows, ubecAuthorRoles, type CommentScope, type CommentSheet, type PlanCommentReply, type PlanCommentThread } from './plan-comments';

// Server helpers shared by app/api/plans/comments (state) and app/api/ubec/comments (UBEC), migration 029.
//
// Visibility rules:
// - State users see scope 'state' threads, plus UBEC threads the ES shared (shared_at set) with the UBEC
//   replies written up to that share time and every SUBEB reply. Unshared UBEC text never leaves UBEC.
// - UBEC users viewing round R see threads written on R, plus threads shared on an earlier round (they
//   carry forward with the SUBEB replies). Everything is cut off at R's decision time, so SUBEB replies
//   written while the plan is back with the state appear only once it is resubmitted (the next round).

export type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export type CommentRow = {
  id: number; parent_id: number | null; pillar: ImplementedPillar; sheet: CommentSheet; row_ref: string; column_id: string | null; body: string;
  author_id: number | null; author_name: string; author_role: string; created_at: Date | string; resolved_at: Date | string | null; resolved_by_name: string | null;
  submission_number: number; target_label: string; scope: CommentScope; ubec_round_id: number | null; shared_at: Date | string | null; shared_by_name: string | null; round_number?: number | null;
};
export const commentFields = (alias = 'c') => ['id', 'parent_id', 'pillar', 'sheet', 'row_ref', 'column_id', 'body', 'author_id', 'author_name', 'author_role', 'created_at', 'resolved_at', 'resolved_by_name', 'submission_number', 'target_label', 'scope', 'ubec_round_id', 'shared_at', 'shared_by_name'].map(field => `${alias}.${field}`).join(', ');
export const openRoundStatuses = ['received', 'reviewing'];
export const isUbecAuthor = (role: string) => (ubecAuthorRoles as readonly string[]).includes(role);

const reply = (row: CommentRow, userId: number): PlanCommentReply => ({ id: Number(row.id), body: row.body, authorName: row.author_name, authorRole: row.author_role, createdAt: String(toIso(row.created_at)), mine: row.author_id === userId });
const toIso = (value: Date | string | null) => value === null ? null : value instanceof Date ? value.toISOString() : value;

/** Groups rows (ordered by id) into threads and flags threads whose row or column is not in `snapshot`. */
export function toThreads(rows: CommentRow[], userId: number, snapshot: Snapshot, options: { cutoff?: Date | null; withSharing?: boolean } = {}): PlanCommentThread[] {
  const current = Object.fromEntries(commentSheets.map(sheet => [sheet, sheetRows(snapshot, sheet)])) as Record<CommentSheet, Map<string, string>>;
  const threads = new Map<number, PlanCommentThread>();
  const cutoff = options.cutoff ?? null;
  for (const row of rows) {
    if (row.parent_id !== null) { threads.get(Number(row.parent_id))?.replies.push(reply(row, userId)); continue; }
    // A resolution made after the viewed round was decided (by the SUBEB) is not part of that round.
    const resolved = row.resolved_at && (!cutoff || new Date(row.resolved_at) <= cutoff) ? row : null;
    threads.set(Number(row.id), {
      ...reply(row, userId), pillar: row.pillar, sheet: row.sheet, rowRef: row.row_ref, columnId: row.column_id, targetLabel: row.target_label,
      submissionNumber: row.submission_number, resolvedAt: toIso(resolved?.resolved_at ?? null), resolvedByName: resolved?.resolved_by_name ?? null, replies: [],
      orphaned: !current[row.sheet].has(row.row_ref) || (row.column_id !== null && !(row.column_id in commentColumns[row.sheet])),
      scope: row.scope,
      ...(row.scope === 'ubec' ? { roundNumber: row.round_number ?? undefined, ...(options.withSharing ? { sharedAt: toIso(row.shared_at), sharedByName: row.shared_by_name } : {}) } : {}),
    });
  }
  return [...threads.values()];
}

/** State view: state threads plus shared UBEC threads (UBEC replies only up to the share time). */
export async function readStateVisibleRows(db: Db, planId: number, pillars: readonly string[]) {
  return (await db.query<CommentRow>(`SELECT ${commentFields()}, r.number AS round_number FROM plan_comments c
    LEFT JOIN plan_comments p ON p.id = c.parent_id LEFT JOIN ubec_rounds r ON r.id = c.ubec_round_id
    WHERE c.plan_id=$1 AND c.pillar=ANY($2::text[]) AND (c.scope='state'
      OR (c.parent_id IS NULL AND c.shared_at IS NOT NULL)
      OR (p.shared_at IS NOT NULL AND (c.author_role <> ALL($3::text[]) OR c.created_at <= p.shared_at)))
    ORDER BY c.id`, [planId, pillars, ubecAuthorRoles])).rows;
}

export type UbecViewer = { role: string; department: string | null };
/** Rounds the viewer can open (a reviewer only sees rounds with an assignment to their department), newest first. */
export async function readViewerRounds(db: Db, planId: number, viewer: UbecViewer) {
  const reviewer = viewer.role === 'UBEC Department Reviewer';
  return (await db.query<UbecRound>(`SELECT r.* FROM ubec_rounds r WHERE plan_id=$1 ${reviewer ? 'AND EXISTS (SELECT 1 FROM ubec_assignments a WHERE a.round_id=r.id AND a.department=$2)' : ''} ORDER BY number DESC`, reviewer ? [planId, viewer.department] : [planId])).rows;
}
/** Components the viewer works on in `round`: every populated one for the ES, the assigned ones for a reviewer. */
export async function viewerPillars(db: Db, round: UbecRound, viewer: UbecViewer): Promise<ImplementedPillar[]> {
  if (viewer.role === 'UBEC Executive Secretary') return activePillars(round.snapshot);
  if (viewer.role !== 'UBEC Department Reviewer' || !viewer.department) return [];
  const rows = (await db.query<{ pillar: ImplementedPillar }>('SELECT DISTINCT pillar FROM ubec_assignments WHERE round_id=$1 AND department=$2', [round.id, viewer.department])).rows;
  return rows.map(row => row.pillar);
}
/** A round accepts UBEC comments only while it is the latest one and still with UBEC. */
export const roundOpen = (round: UbecRound, latest: UbecRound | undefined) => latest?.id === round.id && openRoundStatuses.includes(round.status);
/** Everything written after a closed round's decision belongs to the next round's view. */
export const roundCutoff = (round: UbecRound, latest: UbecRound | undefined) => roundOpen(round, latest) ? null : round.decided_at ? new Date(round.decided_at) : null;

/** SQL condition: comment `c` belongs to a thread visible on round $round (number $number). */
const visibleInRound = (round: string, number: string) => `c.scope='ubec' AND (root.ubec_round_id=${round} OR (root.shared_at IS NOT NULL AND rr.number < ${number}))`;
export async function readRoundRows(db: Db, planId: number, round: UbecRound, pillars: readonly string[], cutoff: Date | null) {
  return (await db.query<CommentRow>(`SELECT ${commentFields()}, rr.number AS round_number FROM plan_comments c
    JOIN plan_comments root ON root.id = COALESCE(c.parent_id, c.id) JOIN ubec_rounds rr ON rr.id = root.ubec_round_id
    WHERE c.plan_id=$1 AND c.pillar=ANY($2::text[]) AND ${visibleInRound('$3', '$4')} AND ($5::timestamptz IS NULL OR c.created_at <= $5)
    ORDER BY c.id`, [planId, pillars, round.id, round.number, cutoff])).rows;
}
/** The root comment `id` if it is visible on `round` to someone working on `pillars`, locked for update. */
export async function readRoundRoot(db: Db, planId: number, round: UbecRound, pillars: readonly string[], id: number) {
  return (await db.query<CommentRow>(`SELECT ${commentFields()} FROM plan_comments c JOIN plan_comments root ON root.id = c.id JOIN ubec_rounds rr ON rr.id = root.ubec_round_id
    WHERE c.id=$5 AND c.plan_id=$1 AND c.parent_id IS NULL AND c.pillar=ANY($2::text[]) AND ${visibleInRound('$3', '$4')} FOR UPDATE OF c`, [planId, pillars, round.id, round.number, id])).rows[0];
}
/** Is there already an open UBEC thread visible on `round` for this cell or row? */
export async function roundCellTaken(db: Db, planId: number, round: UbecRound, target: { sheet: string; row_ref: string; column_id: string | null }) {
  return !!(await db.query(`SELECT 1 FROM plan_comments c JOIN plan_comments root ON root.id = c.id JOIN ubec_rounds rr ON rr.id = root.ubec_round_id
    WHERE c.plan_id=$1 AND ${visibleInRound('$2', '$3')} AND c.parent_id IS NULL AND c.resolved_at IS NULL AND c.sheet=$4 AND c.row_ref=$5 AND c.column_id IS NOT DISTINCT FROM $6`,
  [planId, round.id, round.number, target.sheet, target.row_ref, target.column_id])).rowCount;
}
/** Open UBEC threads the ES may share when returning `round` (written on it, or carried forward). */
export async function shareableThreadIds(db: Db, planId: number, round: UbecRound) {
  const rows = (await db.query<{ id: number }>(`SELECT c.id FROM plan_comments c JOIN plan_comments root ON root.id = c.id JOIN ubec_rounds rr ON rr.id = root.ubec_round_id
    WHERE c.plan_id=$1 AND ${visibleInRound('$2', '$3')} AND c.parent_id IS NULL AND c.resolved_at IS NULL FOR UPDATE OF c`, [planId, round.id, round.number])).rows;
  return new Set(rows.map(row => Number(row.id)));
}
