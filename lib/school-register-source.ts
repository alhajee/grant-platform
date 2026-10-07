import type { QueryResult, QueryResultRow } from 'pg';

/** Where the school register comes from (Super Admin, platform-wide; migration 046). */
export const schoolRegisterSources = ['dnemis_only', 'dnemis_and_manual'] as const;
export type SchoolRegisterSource = typeof schoolRegisterSources[number];
/** Also used when the GLOBAL settings row (or the column) is missing, so a reset never reopens manual entry. */
export const defaultSchoolRegisterSource: SchoolRegisterSource = 'dnemis_only';
export const manualSchoolsOffMessage = 'Schools come from DNEMIS. Adding or changing schools by hand is turned off by the administrator.';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function readSchoolRegisterSource(db: Db): Promise<SchoolRegisterSource> {
  try {
    const value = (await db.query<{ source: string }>(`SELECT school_register_source AS source FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.source;
    return (schoolRegisterSources as readonly string[]).includes(value ?? '') ? value as SchoolRegisterSource : defaultSchoolRegisterSource;
  } catch (cause) {
    // Before migration 046 the column does not exist: stay read-only.
    if ((cause as { code?: string }).code === '42703') return defaultSchoolRegisterSource;
    throw cause;
  }
}

export const manualSchoolsAllowed = async (db: Db) => (await readSchoolRegisterSource(db)) === 'dnemis_and_manual';
