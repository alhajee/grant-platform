import type { QueryResult, QueryResultRow } from 'pg';
import { financeSendProblem, missingFinanceDocuments, type FinanceDocumentKind } from './finance-documents';

type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** UBEC217: the Finance documents still missing on a plan (labels), from its live uploads. */
export async function readMissingFinanceDocuments(db: Db, planId: number): Promise<string[]> {
  const rows = (await db.query<{ kind: FinanceDocumentKind }>('SELECT DISTINCT kind FROM plan_finance_documents WHERE plan_id=$1 AND removed_at IS NULL', [planId])).rows;
  return missingFinanceDocuments(rows);
}

/** UBEC217: why the Executive Chairman cannot send the plan to UBEC yet (Finance documents), or null. */
export async function readFinanceSendProblem(db: Db, planId: number): Promise<string | null> {
  return financeSendProblem(await readMissingFinanceDocuments(db, planId));
}
