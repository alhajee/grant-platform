import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { subebRoles } from '@/lib/subeb-access';
import { visibleComponents } from '@/lib/plan-visibility';
import { normalizeDepartments } from '@/lib/user-departments';
import type { UbecRound } from '@/lib/ubec';
import { componentItems, type UbecResults } from '@/lib/ubec-flow';
import { readDecisions, readRoundComponents } from '@/lib/ubec-flow-db';

// The SUBEB's view of UBEC's results once the UBEC BEAP Chair has decided (returned or approved): per component the
// accepted and rejected items with the officers' notes, the Director's comment and the oversight notes. Only the
// components the state user's role and departments cover are returned; nothing is shown while UBEC is still reviewing.

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    if (!(subebRoles as readonly string[]).includes(user.role)) return NextResponse.json({ error: 'UBEC results are shown to the SUBEB on its plan page.' }, { status: 403 });
    const id = request.nextUrl.searchParams.get('plan');
    if (!id || !/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({ error: 'Choose a valid plan.' }, { status: 400 });
    const db = getPostgres();
    const plan = (await db.query('SELECT id FROM action_plans WHERE id=$1 AND state_code=$2', [id, user.stateCode])).rows[0];
    if (!plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
    const round = (await db.query<UbecRound>("SELECT * FROM ubec_rounds WHERE plan_id=$1 AND status IN ('returned','approved') ORDER BY number DESC LIMIT 1", [id])).rows[0];
    const empty: UbecResults = { round: null, components: [] };
    if (!round) return NextResponse.json(empty, { headers: { 'Cache-Control': 'no-store' } });
    const visible = visibleComponents({ role: user.role, departments: normalizeDepartments(user.departments), isBeapChair: user.isBeapChair });
    const decisions = await readDecisions(db, round.id);
    const components = (await readRoundComponents(db, round, decisions)).filter(c => visible.includes(c.pillar));
    const result: UbecResults = {
      round: { number: round.number, status: round.status, decision: round.decision, decidedAt: round.decided_at },
      components: components.map(c => ({
        pillar: c.pillar, counts: c.counts, directorComment: c.directorComment, directorName: c.directorName,
        oversight: c.oversight.map(o => ({ department: o.department, reviewerName: o.reviewerName, note: o.note })),
        officers: c.officers.map(o => ({ name: o.officerName, note: o.completionNote })),
        items: componentItems(round.snapshot, c.pillar).map(item => { const d = decisions.find(x => x.pillar === c.pillar && x.rowRef === item.rowRef); return { rowRef: item.rowRef, title: item.title, detail: item.detail, amount: item.amount, decision: d?.decision ?? null, note: d?.note ?? '' }; }),
      })),
    };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error(cause); return NextResponse.json({ error: 'Unable to load the UBEC results.' }, { status: 503 }); }
}
