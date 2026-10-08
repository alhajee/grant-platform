import type { QueryResult, QueryResultRow } from 'pg';

// Whether supporting documents must be uploaded before lines are saved or components sent (Super Admin,
// platform-wide; migration 052). Covers every upload on the platform: the ICT documents (activities 0, 3, 4),
// the Teacher Development supporting documents and the Infrastructure BOQs, geophysical survey reports,
// photographic evidence and updated Whole School BOQ (plan drawings are no longer collected at all). Never covered (always required): the RAT at plan
// creation and the Infrastructure New Construction land declaration & agreement documents.
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
