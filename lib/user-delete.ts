import type { QueryResult, QueryResultRow } from 'pg';

// UBEC236 (migration 092): deleting a user. The Super Admin (Admin > Users), the SUBEB Executive Chairman and BEAP Chair
// (/users, the accounts they manage) and the UBEC BEAP Chair and Directors (/ubec/team, their Assessment Officers) delete
// accounts. An account no record refers to is deleted outright. One the records still refer to (review history, item
// decisions, assignments, comments, plans it created…) is removed instead, so that history keeps its author: deactivated,
// signed out everywhere, taken off open assignments and default officers, marked users.deleted_at (hidden from every user
// list and picker) and its email freed ("deleted+<id>+<email>") so a new account can use it. Every delete is recorded in
// user_management_events with who it was; a hard delete leaves that event's target NULL (migration 092).

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export type DeleteTarget = { id: number; name: string; email: string; role: string; stateCode: string; department?: string | null };
export type DeleteOutcome = { mode: 'deleted' | 'removed'; references: string[] };

/** The SQL for "not deleted", for user lists and pickers. */
export const notDeletedSql = (alias = 'users') => `${alias}.deleted_at IS NULL`;
/** The email a removed account keeps, freeing its own (users.email is unique). */
export const deletedEmail = (id: number, email: string) => `deleted+${id}+${email}`.slice(0, 254);

/**
 * Tables whose rows still refer to the user through a foreign key that would not simply go with it: every FK to users
 * except ON DELETE CASCADE ones (sessions, departments, notifications, reset links, default officers) and the
 * user-management log's target (kept, set to NULL).
 */
export async function userReferences(db: Db, userId: number): Promise<string[]> {
  const keys = (await db.query<{ table: string; column: string }>(`SELECT c.conrelid::regclass::text AS table, a.attname AS column
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass AND c.confdeltype <> 'c' AND array_length(c.conkey, 1) = 1
      AND NOT (c.conrelid = 'user_management_events'::regclass AND a.attname = 'target_id')
    ORDER BY 1, 2`)).rows;
  const found: string[] = [];
  for (const key of keys) {
    // Identifiers come from the catalogue, quoted.
    const table = key.table.split('.').map(part => `"${part.replace(/"/g, '')}"`).join('.');
    if ((await db.query(`SELECT 1 FROM ${table} WHERE "${key.column.replace(/"/g, '')}" = $1 LIMIT 1`, [userId])).rowCount) found.push(key.table);
  }
  return [...new Set(found)];
}

/** Deletes or removes the account (see above), in the caller's transaction, under the user-management lock. */
export async function deleteUserAccount(db: Db, target: DeleteTarget, actorId: number): Promise<DeleteOutcome> {
  const references = await userReferences(db, target.id);
  const details = { name: target.name, email: target.email, role: target.role, department: target.department ?? null, mode: references.length ? 'removed' : 'deleted', references };
  await db.query("INSERT INTO user_management_events(actor_id,target_id,state_code,action,details) VALUES($1,$2,$3,'delete',$4::jsonb)", [actorId, target.id, target.stateCode, JSON.stringify(details)]);
  if (!references.length) {
    await db.query('DELETE FROM users WHERE id=$1', [target.id]);
    return { mode: 'deleted', references };
  }
  // Removed: kept for the records, out of every list, signed out, off open work, email freed.
  await db.query(`UPDATE users SET active=FALSE, deleted_at=NOW(), session_version=session_version+1, current_session_id=NULL,
    is_beap_chair=FALSE, is_ubec_beap_chair=FALSE, can_create_plan=FALSE, can_manage_schools=FALSE, email=$2 WHERE id=$1`, [target.id, deletedEmail(target.id, target.email)]);
  await db.query('DELETE FROM sessions WHERE user_id=$1', [target.id]);
  await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [target.id]);
  await db.query('DELETE FROM ubec_default_officers WHERE officer_id=$1', [target.id]);
  await db.query('UPDATE ubec_officer_assignments SET removed_at=NOW() WHERE officer_id=$1 AND removed_at IS NULL AND completed_at IS NULL', [target.id]);
  await db.query('UPDATE ubec_oversight_assignments SET removed_at=NOW() WHERE officer_id=$1 AND removed_at IS NULL', [target.id]);
  return { mode: 'removed', references };
}

export const deletedMessage = (outcome: DeleteOutcome, name: string) => outcome.mode === 'deleted' ? `${name} was deleted` : `${name} was removed. Their recorded work stays in the history`;
