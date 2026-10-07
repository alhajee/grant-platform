import type { QueryResult, QueryResultRow } from 'pg';
import { infrastructureTlmModes, type InfrastructureTlmMode } from './funding-policy';

/**
 * How Infrastructure and TLM use their shared 75% pool (Super Admin, platform-wide; migration 051):
 * 'split' (default) gives each side its own part (action_plans.tlm_allocation); 'shared_pool' is the earlier
 * first-come pool. Plans read the mode with planSetupFields (infrastructureTlmMode), so every check follows it.
 */
export { infrastructureTlmModes, type InfrastructureTlmMode };
/** Also used when the GLOBAL settings row is missing (planSetupFields falls back the same way). */
export const defaultInfrastructureTlmMode: InfrastructureTlmMode = 'split';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

export async function readInfrastructureTlmMode(db: Db): Promise<InfrastructureTlmMode> {
  const value = (await db.query<{ mode: string }>(`SELECT infrastructure_tlm_mode AS mode FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.mode;
  return (infrastructureTlmModes as readonly string[]).includes(value ?? '') ? value as InfrastructureTlmMode : defaultInfrastructureTlmMode;
}
