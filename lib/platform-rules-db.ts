import type { QueryResult, QueryResultRow } from 'pg';
import { defaultPlatformRules, withRuleDefaults, type PlatformRules } from './platform-rules';

type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

/** The platform rules (lib/platform-rules.ts); the defaults when the GLOBAL row or the column (migration 105) is missing. */
export async function readPlatformRules(db: Db): Promise<PlatformRules> {
  try {
    const stored = (await db.query<{ rules: unknown }>(`SELECT platform_rules AS rules FROM state_workflow_settings WHERE state_code='GLOBAL'`)).rows[0]?.rules;
    return withRuleDefaults(stored);
  } catch (cause) {
    if ((cause as { code?: string }).code === '42703') return { ...defaultPlatformRules };
    throw cause;
  }
}

/** Merges a change into the stored rules and returns the full rules. */
export async function savePlatformRules(db: Db, change: Partial<PlatformRules>, actorId: number): Promise<PlatformRules> {
  const next = { ...await readPlatformRules(db), ...change };
  await db.query(`
    INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,platform_rules,updated_by)
    VALUES('GLOBAL','complete_plan',$1::jsonb,$2)
    ON CONFLICT(state_code) DO UPDATE SET platform_rules=EXCLUDED.platform_rules, updated_by=EXCLUDED.updated_by, updated_at=NOW()
  `, [JSON.stringify(next), actorId]);
  return next;
}
