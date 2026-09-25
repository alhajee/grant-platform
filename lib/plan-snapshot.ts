import type { Client } from 'pg';
import type { Snapshot } from './plan-review';
import { planSetupFields } from './plan-workspace';
export async function readPlanSnapshot(db: Client, planId: number): Promise<Snapshot> {
  const infrastructure = await db.query(`SELECT to_jsonb(l) || jsonb_build_object('school', to_jsonb(s), 'construction', to_jsonb(t)) AS item
    FROM infrastructure_lines l JOIN schools s ON s.id = l.school_id JOIN construction_types t ON t.id = l.project_type WHERE l.plan_id = $1 ORDER BY l.id`, [planId]);
  const sports = await db.query(`SELECT to_jsonb(b) || jsonb_build_object('allocations', COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('school', to_jsonb(s)) ORDER BY a.id)
    FROM sports_allocations a JOIN schools s ON s.id = a.school_id WHERE a.line_id = b.id), '[]'::jsonb)) AS item
    FROM sports_budget_lines b WHERE b.plan_id = $1 ORDER BY b.id`, [planId]);
  const setup = (await db.query(`SELECT ${planSetupFields()} FROM action_plans WHERE id=$1`, [planId])).rows[0];
  return { setup, infrastructure: infrastructure.rows.map(r => r.item), sports: sports.rows.map(r => r.item) };
}
