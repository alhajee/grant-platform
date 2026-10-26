import type { QueryResult, QueryResultRow } from 'pg';
import { readComponentDocumentsRequired } from './component-documents-setting';
import type { ReadinessOptions } from './component-readiness';

// Whether every component must use its whole allocation before it is sent (UBEC79, migration 076; lib/allocation-use.ts).
/** Also used when the GLOBAL settings row (or the column) is missing. */
export const defaultFullAllocationRequired = true;
type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function readFullAllocationRequired(db: Db): Promise<boolean> {
  try {
    const value = (await db.query<{ required: boolean | null }>(`SELECT full_allocation_required AS required FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.required;
    return typeof value === 'boolean' ? value : defaultFullAllocationRequired;
  } catch (cause) {
    if ((cause as { code?: string }).code === '42703') return defaultFullAllocationRequired;
    throw cause;
  }
}
/** The platform settings every send check reads: supporting documents and full use of allocations. */
export async function readReadinessOptions(db: Db): Promise<ReadinessOptions> {
  return { documentsRequired: await readComponentDocumentsRequired(db), fullAllocation: await readFullAllocationRequired(db) };
}
