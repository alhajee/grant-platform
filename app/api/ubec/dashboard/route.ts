import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { activePillars, isUbec, ubecRoles, type NationalItem, type UbecDashboard, type UbecQueueItem, type UbecRound } from '@/lib/ubec';
import { stateDisplayName } from '@/lib/state-names';
import { coversPlanningYear } from '@/lib/national-analytics';
import type { ImplementedPillar } from '@/lib/beap-pillars';
import { componentAmount, componentItems, componentName, decisionCounts, type ItemDecisionValue, type PipelineComponent } from '@/lib/ubec-flow';
import { seesEverything, ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { planPeriod } from '@/lib/action-plans';

type RoundRow = UbecRound & { state_code: string; start_year: number; end_year: number; funding_quarters: number[] | null };
type ComponentRow = { id: number; round_id: number; pillar: ImplementedPillar; department: string; stage: PipelineComponent['stage'] };
type OfficerRow = { round_component_id: number; officer_id: number; officer_name: string; completed_at: string | null };

// Role-aware UBEC dashboard (docs/ubec-flow.md): the latest round of every plan the viewer can see, each component's
// place in the pipeline, the viewer's own queue, department workload, recent activity and monthly submissions.
export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    if (!isUbec(user.role)) return NextResponse.json({ error: 'UBEC access required.' }, { status: 403 });
    const yearValue = request.nextUrl.searchParams.get('year');
    if (yearValue && !/^\d{4}$/.test(yearValue)) return NextResponse.json({ error: 'Invalid funding year.' }, { status: 400 });
    const year = yearValue ? Number(yearValue) : null;
    const viewer = { id: user.userId, role: user.role, department: user.department };
    const db = getPostgres();
    const all = (await db.query<RoundRow>(`SELECT r.*,p.state_code,p.start_year,p.end_year,p.funding_quarters FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id
      WHERE r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id) AND ${ubecSeesPillarSql('r', 'NULL::text', '$1::text', '$2::int', '$3::text')} ORDER BY r.submitted_at DESC`, [viewer.role, viewer.id, viewer.department])).rows;
    const years = [...new Set(all.flatMap(r => Array.from({ length: r.end_year - r.start_year + 1 }, (_, i) => r.start_year + i)))].sort((a, b) => b - a);
    const rounds = all.filter(r => coversPlanningYear(r.start_year, r.end_year, year));
    const roundIds = rounds.map(r => r.id), planIds = rounds.map(r => r.plan_id);
    const [components, officers, oversight, decisions, legacy] = await Promise.all([
      db.query<ComponentRow>('SELECT id,round_id,pillar,department,stage FROM ubec_round_components WHERE round_id=ANY($1::int[])', [roundIds]),
      db.query<OfficerRow>('SELECT oa.round_component_id,oa.officer_id,oa.officer_name,oa.completed_at FROM ubec_officer_assignments oa JOIN ubec_round_components rc ON rc.id=oa.round_component_id WHERE rc.round_id=ANY($1::int[]) AND oa.removed_at IS NULL', [roundIds]),
      db.query<{ round_component_id: number; department: string }>('SELECT o.round_component_id,o.department FROM ubec_oversight_reviews o JOIN ubec_round_components rc ON rc.id=o.round_component_id WHERE rc.round_id=ANY($1::int[])', [roundIds]),
      db.query<{ round_id: number; pillar: ImplementedPillar; row_ref: string; decision: ItemDecisionValue }>('SELECT round_id,pillar,row_ref,decision FROM ubec_item_decisions WHERE round_id=ANY($1::int[])', [roundIds]),
      db.query<{ round_id: number; pillar: ImplementedPillar; department: string }>('SELECT round_id,pillar,department FROM ubec_assignments WHERE round_id=ANY($1::int[])', [roundIds]),
    ]).then(results => results.map(r => r.rows)) as [ComponentRow[], OfficerRow[], { round_component_id: number; department: string }[], { round_id: number; pillar: ImplementedPillar; row_ref: string; decision: ItemDecisionValue }[], { round_id: number; pillar: ImplementedPillar; department: string }[]];

    // Same rule as ubecSeesPillarSql, applied to the loaded rows.
    const visibleIn = (round: RoundRow) => activePillars(round.snapshot).filter(pillar => {
      if (seesEverything(viewer.role)) return true;
      const c = components.find(x => x.round_id === round.id && x.pillar === pillar);
      if (viewer.role === ubecRoles.director) return c?.department === viewer.department || legacy.some(l => l.round_id === round.id && l.pillar === pillar && l.department === viewer.department);
      if (viewer.role === ubecRoles.oversight) return !!c && c.stage !== 'director';
      if (viewer.role === ubecRoles.officer) return !!c && officers.some(o => o.round_component_id === c.id && o.officer_id === viewer.id);
      return false;
    });
    const queue: UbecQueueItem[] = [];
    const items: NationalItem[] = rounds.map(r => {
      const pillars = visibleIn(r), state = stateDisplayName(r.state_code), period = planPeriod({ startYear: r.start_year, endYear: r.end_year, fundingQuarters: r.funding_quarters });
      const href = `/ubec/review?plan=${r.plan_id}`, open = r.status === 'reviewing';
      const pipeline: PipelineComponent[] = pillars.map(pillar => {
        const c = components.find(x => x.round_id === r.id && x.pillar === pillar);
        const people = c ? officers.filter(o => o.round_component_id === c.id) : [];
        return { pillar, department: c?.department ?? '', stage: c?.stage ?? 'unreleased', amount: componentAmount(r.snapshot, pillar),
          counts: decisionCounts(componentItems(r.snapshot, pillar), decisions.filter(d => d.round_id === r.id && d.pillar === pillar).map(d => ({ rowRef: d.row_ref, decision: d.decision }))),
          officers: people.map(o => ({ name: o.officer_name, completed: !!o.completed_at, mine: o.officer_id === viewer.id })),
          oversightDone: c ? oversight.filter(o => o.round_component_id === c.id).map(o => o.department as PipelineComponent['oversightDone'][number]) : [] };
      });
      const push = (kind: UbecQueueItem['kind'], label: string, detail: string, anchor = '') => queue.push({ planId: r.plan_id, state, label, detail: `${state} · ${period} BEAP${detail ? ` · ${detail}` : ''}`, href: href + anchor, kind });
      if (viewer.role === ubecRoles.chair && r.status === 'received') push('release', 'Review and release to the UBEC departments', '');
      if (viewer.role === ubecRoles.chair && open && pipeline.length && pipeline.every(p => p.stage === 'chair')) push('decide', 'Approve or return the plan', 'every component has arrived');
      for (const p of open ? pipeline : []) {
        const name = componentName(p.pillar), anchor = `#ubec-${p.pillar}`;
        if (viewer.role === ubecRoles.director && p.department === viewer.department && p.stage === 'director') {
          if (!p.officers.length) push('assign', `Assign staff to ${name}`, '', anchor);
          else if (p.officers.every(o => o.completed)) push('consolidate', `Send ${name} for oversight`, 'assessment complete', anchor);
        }
        if (viewer.role === ubecRoles.officer && p.stage === 'director' && p.officers.some(o => o.mine && !o.completed)) push('assess', `Assess ${name}`, `${p.counts.undecided} of ${p.counts.total} items to decide`, anchor);
        if (viewer.role === ubecRoles.oversight && p.stage === 'oversight' && !p.oversightDone.includes(viewer.department as PipelineComponent['oversightDone'][number])) push('observe', `Observations on ${name}`, '', anchor);
      }
      const schoolKey = (s: { name: string; lga: string; level: string }) => JSON.stringify([r.state_code, s.name, s.lga, s.level]);
      const can = (p: ImplementedPillar) => pillars.includes(p);
      const schools = [...(can('tlm') ? r.snapshot.tlmDistribution ?? [] : []), ...(can('curriculum') ? r.snapshot.curriculumDistribution ?? [] : []), ...(can('gscci') ? r.snapshot.gscciDistribution ?? [] : [])].map(schoolKey)
        .concat(can('infrastructure') ? r.snapshot.infrastructure.map(l => schoolKey(l.school)) : [], can('sports') ? r.snapshot.sports.flatMap(l => l.allocations.map(a => schoolKey(a.school))) : []);
      const amounts = Object.fromEntries(pipeline.map(p => [p.pillar, p.amount]));
      const released = pipeline.filter(p => p.stage !== 'unreleased');
      return {
        id: r.id, planId: r.plan_id, state, stateCode: r.state_code, startYear: r.start_year, endYear: r.end_year, fundingQuarters: r.funding_quarters, status: r.status, round: r.number, submittedAt: r.submitted_at, decidedAt: r.decided_at,
        budget: pipeline.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100, infrastructure: amounts.infrastructure ?? 0, sports: amounts.sports ?? 0, schools: [...new Set(schools)],
        pending: open ? released.filter(p => p.stage !== 'chair').length : 0, completed: released.filter(p => p.stage === 'chair').length,
        fundingTotal: r.snapshot.setup?.fundingTotal != null ? Number(r.snapshot.setup.fundingTotal) : null, amounts, components: pipeline,
      };
    });
    const departments = [...new Set(components.filter(c => items.some(i => i.id === c.round_id && i.components?.some(p => p.pillar === c.pillar))).map(c => c.department))];
    const workload = departments.map(department => ({ department,
      pending: components.filter(c => c.department === department && c.stage === 'director' && items.some(i => i.id === c.round_id && i.status === 'reviewing')).length,
      completed: components.filter(c => c.department === department && c.stage !== 'director').length }));
    const events = (await db.query<{ id: number; round_id: number; plan_id: number; action: string; actor: string; created_at: string; state_code: string; pillar: ImplementedPillar | null }>(`SELECT e.id,e.round_id,e.plan_id,e.action,e.actor,e.created_at,e.pillar,p.state_code FROM ubec_events e JOIN action_plans p ON p.id=e.plan_id WHERE e.plan_id=ANY($1::int[]) ORDER BY e.id DESC LIMIT 200`, [planIds])).rows;
    const activity = events.filter(e => { const r = rounds.find(x => x.id === e.round_id); return seesEverything(viewer.role) || (!!r && (e.pillar ? visibleIn(r).includes(e.pillar) : ['submit', 'release', 'return', 'approve'].includes(e.action))); })
      .slice(0, 8).map(e => ({ id: e.id, plan_id: e.plan_id, action: e.action, actor: e.actor, created_at: e.created_at, pillar: e.pillar, stateName: stateDisplayName(e.state_code) }));
    const monthly = (await db.query<{ month: string; submissions: number }>(`SELECT to_char(m.month,'Mon YYYY') AS month,COUNT(r.id)::int AS submissions FROM generate_series(date_trunc('month',NOW())-interval '5 months',date_trunc('month',NOW()),interval '1 month') AS m(month)
      LEFT JOIN ubec_rounds r ON r.submitted_at>=m.month AND r.submitted_at<m.month+interval '1 month' AND r.plan_id=ANY($1::int[]) GROUP BY m.month ORDER BY m.month`, [planIds])).rows;
    const body: UbecDashboard = { user: { name: user.name, role: user.role, department: user.department }, items, queue, workload, activity, monthly, years };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error(cause); return NextResponse.json({ error: 'Unable to load the UBEC dashboard.' }, { status: 503 }); }
}
