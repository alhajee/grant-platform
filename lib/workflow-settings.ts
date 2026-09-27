import type { QueryResult, QueryResultRow } from 'pg';

export type BeapChairSubmissionMode = 'complete_plan' | 'individual_components';

export async function readBeapChairSubmissionMode(
  db: { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> },
  stateCode: string,
): Promise<BeapChairSubmissionMode> {
  const row = (await db.query<{ mode: BeapChairSubmissionMode }>(
    'SELECT beap_chair_submission_mode AS mode FROM state_workflow_settings WHERE state_code=$1',
    [stateCode],
  )).rows[0];
  return row?.mode ?? 'complete_plan';
}
