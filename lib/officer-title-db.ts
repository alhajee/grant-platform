import type { QueryResult, QueryResultRow } from 'pg';
import { nextOfficerNumber, officerRoleTitle } from './officer-title';
import { ubecRoles } from './ubec';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/**
 * UBEC237: the role name a new Assessment Officer of `department` gets, "UBEC Assessment Officer N": one more than the
 * highest number in the department, or than its number of officers when earlier role names carry no number. Removed
 * accounts count too, so a number is never given twice. Read under the user-management lock.
 */
export async function nextOfficerRoleTitle(db: Db, department: string, excludeId = 0): Promise<string> {
  const rows = (await db.query<{ title: string | null }>('SELECT role_title AS title FROM users WHERE role=$1 AND department=$2 AND id<>$3', [ubecRoles.officer, department, excludeId])).rows;
  return officerRoleTitle(nextOfficerNumber(rows.map(row => row.title)));
}
