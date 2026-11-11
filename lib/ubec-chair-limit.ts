import type { QueryResult, QueryResultRow } from 'pg';
import { ubecChairSql } from './ubec.ts';

// How many people may hold the UBEC BEAP Chair at once (migration 101): the UBEC BEAP Chair accounts plus UBEC Directors
// given the duty (UBEC241/242). Set by the Super Admin on Admin > Settings > UBEC Assessment Officers; 2 by default.
export const defaultUbecChairLimit = 2;
export const minUbecChairLimit = 1, maxUbecChairLimit = 50;
type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** The limit and whether the Super Admin set it (falls back to the default when the row or column is missing). */
export async function readUbecChairLimit(db: Db): Promise<{ limit: number; custom: boolean }> {
  const value = (await db.query<{ limit: number | null }>(`SELECT ubec_chair_limit AS "limit" FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.limit;
  return value ? { limit: Number(value), custom: true } : { limit: defaultUbecChairLimit, custom: false };
}
/** Active holders of the BEAP Chair, leaving out one account (the one being edited). */
export async function activeUbecChairs(db: Db, except = 0): Promise<{ id: number; name: string; email: string; role: string }[]> {
  return (await db.query<{ id: number; name: string; email: string; role: string }>(`SELECT id, display_name AS name, email, role FROM users WHERE active AND deleted_at IS NULL AND id<>$1 AND ${ubecChairSql()} ORDER BY display_name, id`, [except])).rows;
}
export const tooManyChairsMessage = (limit: number) => `UBEC already has ${limit} BEAP Chair${limit === 1 ? '' : 's'}, the limit set on Admin > Settings > UBEC Assessment Officers. Raise the limit or remove the duty from one of them first`;
export const overChairLimitWarning = (active: number, limit: number) => active > limit ? `${active} active, limit ${limit}: no new BEAP Chairs until one is removed` : null;
