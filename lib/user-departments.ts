import type { QueryResult, QueryResultRow } from 'pg';

export type DepartmentAccess = string | readonly string[] | null | undefined;

export function normalizeDepartments(value: DepartmentAccess) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

export function hasDepartment(value: DepartmentAccess, department: string) {
  return normalizeDepartments(value).includes(department);
}

export function departmentsContain(container: DepartmentAccess, requested: DepartmentAccess) {
  const allowed = new Set(normalizeDepartments(container));
  const selection = normalizeDepartments(requested);
  return selection.length > 0 && selection.every(department => allowed.has(department));
}

export function userDepartmentsSql(alias = 'users') {
  return `COALESCE(
    (SELECT array_agg(ud.department ORDER BY ud.department) FROM user_departments ud WHERE ud.user_id=${alias}.id),
    CASE WHEN ${alias}.department IS NULL OR ${alias}.department='' THEN ARRAY[]::text[] ELSE ARRAY[${alias}.department]::text[] END
  )`;
}

type Database = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function replaceUserDepartments(db: Database, userId: number, departments: DepartmentAccess) {
  const normalized = normalizeDepartments(departments);
  await db.query('DELETE FROM user_departments WHERE user_id=$1', [userId]);
  if (normalized.length) {
    await db.query('INSERT INTO user_departments(user_id,department) SELECT $1,unnest($2::text[])', [userId, normalized]);
  }
  return normalized;
}
