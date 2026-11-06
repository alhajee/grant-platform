import type { QueryResult, QueryResultRow } from 'pg';

// UBEC231: whether ECCDE must be at least 15% of the plan before the BEAP Chair sends to the Executive Chairman (migration 092; lib/eccde-share.ts).
/** Also used when the GLOBAL settings row (or the column) is missing. */
export const defaultEccdeShareRequired = true;
type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function readEccdeShareRequired(db: Db): Promise<boolean> {
  try {
    const value = (await db.query<{ required: boolean | null }>(`SELECT eccde_share_required AS required FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.required;
    return typeof value === 'boolean' ? value : defaultEccdeShareRequired;
  } catch (cause) {
    if ((cause as { code?: string }).code === '42703') return defaultEccdeShareRequired;
    throw cause;
  }
}
