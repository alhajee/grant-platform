import type { QueryResult, QueryResultRow } from 'pg';
import type { Snapshot } from './plan-review';
import { planSetupFields } from './plan-workspace';
import { readLineExtras } from './activity-line-extras';
export async function readPlanSnapshot(db: { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> }, planId: number): Promise<Snapshot> {
  const infrastructure: {rows:{item:Snapshot['infrastructure'][number]}[]} = {rows:[]};
  const sports = await db.query(`SELECT to_jsonb(b) || jsonb_build_object('allocations', COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('school', to_jsonb(s)) ORDER BY a.id)
    FROM sports_allocations a JOIN schools s ON s.id = a.school_id WHERE a.line_id = b.id), '[]'::jsonb)) AS item
    FROM sports_budget_lines b WHERE b.plan_id = $1 ORDER BY b.id`, [planId]);
  const setup = (await db.query<import('./plan-setup').PlanSetup>(`SELECT ${planSetupFields()} FROM action_plans WHERE id=$1`, [planId])).rows[0];
  const packages = (await db.query<import('./infrastructure-model').InfrastructurePackage>(`SELECT p.*,p.result->'school' AS school FROM infrastructure_packages p WHERE p.plan_id=$1 ORDER BY p.id`,[planId])).rows;
  const infrastructureDocuments = (await db.query('SELECT d.id,d.kind,d.name,d.size,d.school_id AS "schoolId",s.name AS "schoolName" FROM infrastructure_documents d LEFT JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND d.removed_at IS NULL ORDER BY d.created_at',[planId])).rows as Snapshot['infrastructureDocuments'];
  for(const p of packages) infrastructure.rows.push({item:{id:-p.id,code:`INF-${planId}-${p.id}`,quantity:1,unit_cost:p.total_cost,duration:0,rationale:p.input.observations,strategy:p.input.classroomStrategy,longitude:p.school.longitude,latitude:p.school.latitude,school:p.school,construction:{name:p.kind==='new'?'New Construction':p.kind==='whole'?'Whole School Renovation/Expansion':'Furniture/Equipment'},package:p}});
  const activities = (await db.query('SELECT * FROM activity_plan_lines WHERE plan_id=$1 ORDER BY activity,id',[planId])).rows;
  const distribution = (await db.query('SELECT d.workstream,s.id,s.name,s.lga,s.level,s.location,(s.enrolment_male+s.enrolment_female)::int AS enrolment FROM tlm_distribution d JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 ORDER BY s.name',[planId])).rows;
  const listFor = (workstream: string) => distribution.filter(r => r.workstream === workstream).map(r => ({ id: r.id, name: r.name, lga: r.lga, level: r.level, location: r.location, enrolment: r.enrolment })) as NonNullable<Snapshot['tlmDistribution']>;
  const componentDocuments = (await db.query('SELECT id,component,name,size FROM component_documents WHERE plan_id=$1 AND removed_at IS NULL ORDER BY created_at,id',[planId])).rows as Snapshot['componentDocuments'];
  const lines = (workstream: string) => activities.filter(r => r.workstream === workstream) as NonNullable<Snapshot['sbmc']>;
  const extras = await readLineExtras(db, planId);
  const withExtras = (workstream: string) => lines(workstream).map(line => ({ ...line, schools: extras.schools.get(line.id) ?? [], documents: extras.documents.get(line.id) ?? [] }));
  return { setup, infrastructureDocuments, infrastructure: infrastructure.rows.map(r => r.item), sports: sports.rows.map(r => r.item), sbmc: lines('sbmc'), tlm: lines('tlm'), tlmDistribution: listFor('tlm'),
    monitoring: lines('monitoring'), gscci: lines('gscci'), curriculum: lines('curriculum'), curriculumDistribution: listFor('curriculum'), componentDocuments,
    quality: withExtras('quality'), ict: withExtras('ict') };
}
