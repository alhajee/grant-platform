import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isUbec, type UbecRound, type UbecAssignment, type NationalItem } from '@/lib/ubec';
import { stateDisplayName } from '@/lib/state-names';
import { coversPlanningYear } from '@/lib/national-analytics';

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    if (!isUbec(user.role)) return NextResponse.json({ error: 'UBEC access required.' }, { status: 403 });
    const reviewer = user.role === 'UBEC Department Reviewer';
    const yearValue = request.nextUrl.searchParams.get('year');
    if (yearValue && !/^\d{4}$/.test(yearValue)) return NextResponse.json({ error: 'Invalid planning year.' }, { status: 400 });
    const year = yearValue ? Number(yearValue) : null;
    const db = getPostgres();
    const result = await db.query<UbecRound & { state_code: string; start_year: number; end_year: number; funding_quarters: number[] | null }>(`SELECT r.*,p.state_code,p.start_year,p.end_year,p.funding_quarters FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id WHERE r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id) ${reviewer ? 'AND EXISTS(SELECT 1 FROM ubec_assignments a WHERE a.round_id=r.id AND a.department=$1)' : ''} ORDER BY r.submitted_at DESC`, reviewer ? [user.department] : []);
    const years = [...new Set(result.rows.flatMap(r => Array.from({ length: r.end_year - r.start_year + 1 }, (_, i) => r.start_year + i)))].sort((a,b) => b-a);
    result.rows = result.rows.filter(r => coversPlanningYear(r.start_year, r.end_year, year));
    const planIds = result.rows.map(r => r.plan_id);
    const assignments = (await db.query<UbecAssignment & { round_id: number }>(`SELECT a.* FROM ubec_assignments a JOIN ubec_rounds r ON r.id=a.round_id WHERE r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id) ${reviewer ? 'AND a.department=$1' : ''}`, reviewer ? [user.department] : [])).rows.filter(a => result.rows.some(r => r.id === a.round_id));
    const items: NationalItem[] = result.rows.map(r => {
      const assigned = assignments.filter(a => a.round_id === r.id);
      const infra = !reviewer || assigned.some(a => a.pillar === 'infrastructure') ? r.snapshot.infrastructure : [];
      const sports = !reviewer || assigned.some(a => a.pillar === 'sports') ? r.snapshot.sports : [];
      const sbmc = !reviewer || assigned.some(a=>a.pillar==='sbmc') ? r.snapshot.sbmc ?? [] : [];
      const tlm = !reviewer || assigned.some(a=>a.pillar==='tlm') ? r.snapshot.tlm ?? [] : [];
      const distribution = !reviewer || assigned.some(a=>a.pillar==='tlm') ? r.snapshot.tlmDistribution ?? [] : [];
      const budget = (lines: {unit_cost:string;quantity:number}[]) => lines.reduce((sum,l) => sum + Math.round(Number(l.unit_cost)*100)*l.quantity/100,0);
      const schoolKey = (s: { name: string; lga: string; level: string }) => JSON.stringify([r.state_code,s.name,s.lga,s.level]);
      return { id:r.id,planId:r.plan_id,state:stateDisplayName(r.state_code),stateCode:r.state_code,startYear:r.start_year,endYear:r.end_year,fundingQuarters:r.funding_quarters,status:r.status,round:r.number,submittedAt:r.submitted_at,decidedAt:r.decided_at,budget:budget(infra)+budget(sports)+budget(sbmc)+budget(tlm),infrastructure:budget(infra),sports:budget(sports),schools:[...new Set([...distribution.map(schoolKey),...infra.map(l=>schoolKey(l.school)),...sports.flatMap(l=>l.allocations.map(a=>schoolKey(a.school)))])],pending:['received','reviewing'].includes(r.status)?assigned.filter(a=>!a.completed_at).length:0,completed:assigned.filter(a=>a.completed_at).length };
    });
    const workload = [...new Set(assignments.map(a=>a.department))].map(department=>({ department, pending:assignments.filter(a=>a.department===department && !a.completed_at && items.some(i=>i.id===a.round_id && ['received','reviewing'].includes(i.status))).length, completed:assignments.filter(a=>a.department===department && a.completed_at).length }));
    const activity = (await db.query(`SELECT e.id,e.plan_id,e.action,e.actor,e.created_at,p.state_code FROM ubec_events e JOIN action_plans p ON p.id=e.plan_id WHERE e.plan_id=ANY($1::int[]) ${reviewer ? 'AND (e.actor_id=$2 OR (e.action=\'assign\' AND EXISTS(SELECT 1 FROM ubec_assignments a WHERE a.round_id=e.round_id AND a.department=$3)))' : ''} ORDER BY e.id DESC LIMIT 8`, reviewer?[planIds,user.userId,user.department]:[planIds])).rows.map(r=>({...r,stateName:stateDisplayName(r.state_code)}));
    const monthly = (await db.query(`SELECT to_char(m.month,'Mon YYYY') AS month,COUNT(r.id)::int AS submissions FROM generate_series(date_trunc('month',NOW())-interval '5 months',date_trunc('month',NOW()),interval '1 month') AS m(month) LEFT JOIN ubec_rounds r ON r.submitted_at>=m.month AND r.submitted_at<m.month+interval '1 month' AND r.plan_id=ANY($1::int[]) ${reviewer ? 'AND EXISTS(SELECT 1 FROM ubec_assignments a WHERE a.round_id=r.id AND a.department=$2)' : ''} GROUP BY m.month ORDER BY m.month`,reviewer?[planIds,user.department]:[planIds])).rows;
    return NextResponse.json({ user:{name:user.name,role:user.role,department:user.department},items,workload,activity,monthly,years },{headers:{'Cache-Control':'no-store'}});
  } catch (cause) { console.error(cause); return NextResponse.json({error:'Unable to load the UBEC dashboard.'},{status:503}); }
}
