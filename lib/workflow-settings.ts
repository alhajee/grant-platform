import type { QueryResult, QueryResultRow } from 'pg';

export type BeapChairSubmissionMode = 'complete_plan' | 'individual_components';
export type UbecSubmissionMode = 'complete_plan' | 'reviewed_components';
export type WorkflowSettings = { mode: BeapChairSubmissionMode; ubecMode: UbecSubmissionMode };
export const defaultWorkflowSettings: WorkflowSettings = { mode: 'complete_plan', ubecMode: 'complete_plan' };

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function readWorkflowSettings(db: Db): Promise<WorkflowSettings> {
  const row = (await db.query<WorkflowSettings>(
    `SELECT beap_chair_submission_mode AS mode, ubec_submission_mode AS "ubecMode" FROM state_workflow_settings WHERE state_code='GLOBAL'`,
  )).rows[0];
  return row ?? defaultWorkflowSettings;
}

export async function readBeapChairSubmissionMode(db: Db): Promise<BeapChairSubmissionMode> {
  return (await readWorkflowSettings(db)).mode;
}

export async function readUbecSubmissionMode(db: Db): Promise<UbecSubmissionMode> {
  return (await readWorkflowSettings(db)).ubecMode;
}
