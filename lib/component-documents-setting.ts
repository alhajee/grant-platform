import type { QueryResult, QueryResultRow } from 'pg';

// Whether non-infrastructure components must have their supporting documents before they are sent
// (Super Admin, platform-wide; migration 052). Covers the ICT documents (activities 0, 3, 4) and the
// Teacher Development supporting documents. Infrastructure documents and the RAT are always required.
/** Also used when the GLOBAL settings row (or the column) is missing: uploads are optional. */
export const defaultComponentDocumentsRequired = false;

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function readComponentDocumentsRequired(db: Db): Promise<boolean> {
  try {
    const value = (await db.query<{ required: boolean | null }>(`SELECT component_documents_required AS required FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.required;
    return typeof value === 'boolean' ? value : defaultComponentDocumentsRequired;
  } catch (cause) {
    // Before migration 052 the column does not exist: documents are optional.
    if ((cause as { code?: string }).code === '42703') return defaultComponentDocumentsRequired;
    throw cause;
  }
}
