import type { QueryResult, QueryResultRow } from 'pg';
import type { Snapshot } from './plan-review';
import { planSetupFields } from './plan-workspace';
export async function readPlanSnapshot(db: { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> }, planId: number): Promise<Snapshot> {
  const infrastructure = await db.query(`SELECT to_jsonb(l) || jsonb_build_object('school', to_jsonb(s), 'construction', to_jsonb(t)) AS item
    FROM infrastructure_lines l JOIN schools s ON s.id = l.school_id JOIN construction_types t ON t.id = l.project_type WHERE l.plan_id = $1 ORDER BY l.id`, [planId]);
  const sports = await db.query(`SELECT to_jsonb(b) || jsonb_build_object('allocations', COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('school', to_jsonb(s)) ORDER BY a.id)
    FROM sports_allocations a JOIN schools s ON s.id = a.school_id WHERE a.line_id = b.id), '[]'::jsonb)) AS item
    FROM sports_budget_lines b WHERE b.plan_id = $1 ORDER BY b.id`, [planId]);
  const setup = (await db.query<import('./plan-setup').PlanSetup>(`SELECT ${planSetupFields()} FROM action_plans WHERE id=$1`, [planId])).rows[0];
  const packages = (await db.query(`SELECT p.*,p.result->'school' AS school FROM infrastructure_packages p WHERE p.plan_id=$1 ORDER BY p.id`,[planId])).rows;
  const infrastructureDocuments = (await db.query('SELECT d.id,d.kind,d.name,d.size,d.school_id AS "schoolId",s.name AS "schoolName" FROM infrastructure_documents d LEFT JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 ORDER BY d.created_at',[planId])).rows as Snapshot['infrastructureDocuments'];
  for(const p of packages) infrastructure.rows.push({item:{id:-p.id,code:`INF-${planId}-${p.id}`,quantity:1,unit_cost:p.total_cost,duration:0,rationale:p.input.observations,strategy:p.input.classroomStrategy,longitude:p.school.longitude,latitude:p.school.latitude,school:p.school,construction:{name:p.kind==='new'?'New Construction':p.kind==='whole'?'Whole School Approach':'Furniture Procurement'},package:p}});
  const activities = (await db.query('SELECT * FROM activity_plan_lines WHERE plan_id=$1 ORDER BY activity,id',[planId])).rows;
  const tlmDistribution = (await db.query('SELECT s.id,s.name,s.lga,s.level,s.location FROM tlm_distribution d JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 ORDER BY s.name',[planId])).rows;
  return { setup, infrastructureDocuments, infrastructure: infrastructure.rows.map(r => r.item), sports: sports.rows.map(r => r.item), sbmc: activities.filter(r=>r.workstream==='sbmc') as Snapshot['sbmc'], tlm: activities.filter(r=>r.workstream==='tlm') as Snapshot['tlm'], tlmDistribution: tlmDistribution as Snapshot['tlmDistribution'] };
}
