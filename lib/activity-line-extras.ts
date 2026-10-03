import type { QueryResult, QueryResultRow } from 'pg';
import type { LineDocument, LineSchool } from './activity-extras';

// Server helpers for the per-line schools (activity_line_schools) and documents (activity_line_documents) of
// Quality Assurance and ICT lines (migration 038).
type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** Chosen schools and current documents of every line on a plan, keyed by line id. */
export async function readLineExtras(db: Db, planId: number, workstream?: string) {
  const schoolRows = (await db.query<LineSchool & { lineId: number }>(`SELECT ls.line_id AS "lineId", s.id, s.name, s.lga, s.level FROM activity_line_schools ls
    JOIN activity_plan_lines l ON l.id = ls.line_id JOIN schools s ON s.id = ls.school_id
    WHERE l.plan_id = $1 AND ($2::text IS NULL OR l.workstream = $2) ORDER BY s.name, s.id`, [planId, workstream ?? null])).rows;
  const documentRows = (await db.query<LineDocument & { lineId: number }>(`SELECT d.line_id AS "lineId", d.id, d.name, d.size FROM activity_line_documents d
    WHERE d.plan_id = $1 AND d.line_id IS NOT NULL AND d.removed_at IS NULL AND ($2::text IS NULL OR d.component = $2) ORDER BY d.created_at, d.id`, [planId, workstream ?? null])).rows;
  const group = <T extends { lineId: number }>(rows: T[]) => rows.reduce((map, { lineId, ...rest }) => map.set(lineId, [...(map.get(lineId) ?? []), rest]), new Map<number, Omit<T, 'lineId'>[]>());
  return { schools: group(schoolRows) as Map<number, LineSchool[]>, documents: group(documentRows) as Map<number, LineDocument[]> };
}

/** Replaces a line's schools. Returns false when any school is not in the state's register. */
export async function saveLineSchools(db: Db, lineId: number, schoolIds: readonly number[], stateCode: string) {
  const ids = [...new Set(schoolIds)];
  if (ids.length) {
    const found = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM schools WHERE id = ANY($1::int[]) AND state_code = $2', [ids, stateCode])).rows[0].n;
    if (found !== ids.length) return false;
  }
  await db.query('DELETE FROM activity_line_schools WHERE line_id = $1', [lineId]);
  if (ids.length) await db.query('INSERT INTO activity_line_schools(line_id, school_id) SELECT $1, unnest($2::int[])', [lineId, ids]);
  return true;
}
