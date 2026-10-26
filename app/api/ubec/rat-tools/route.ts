import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { downloadsRatTools, type RatToolPlan } from '@/lib/ubec';
import { stateDisplayName } from '@/lib/state-names';
import { planPeriod } from '@/lib/action-plans';

// UBEC139: every plan submitted to UBEC with its RAT tool files, newest submission first, for UBEC Planning (DPRS)
// Assessment Officers and their Director. Files download through /api/plans/documents?id=.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue' }, 401);
    if (!downloadsRatTools(user.role, user.department)) return json({ error: 'RAT tools are downloaded by UBEC Planning (DPRS)' }, 403);
    const db = getPostgres();
    const plans = (await db.query<{ id: number; state_code: string; start_year: number; end_year: number; funding_quarters: number[] | null; status: string; submitted_at: Date }>(`SELECT p.id,p.state_code,p.start_year,p.end_year,p.funding_quarters,r.status,r.submitted_at
      FROM ubec_rounds r JOIN action_plans p ON p.id=r.plan_id WHERE r.number=(SELECT MAX(number) FROM ubec_rounds WHERE plan_id=r.plan_id) ORDER BY r.submitted_at DESC`)).rows;
    const files = plans.length ? (await db.query<{ id: string; plan_id: number; name: string; size: number }>('SELECT id,plan_id,name,size FROM plan_documents WHERE plan_id=ANY($1::int[]) ORDER BY created_at', [plans.map(p => p.id)])).rows : [];
    const body: RatToolPlan[] = plans.map(p => ({ planId: p.id, state: stateDisplayName(p.state_code), period: `${planPeriod({ startYear: p.start_year, endYear: p.end_year, fundingQuarters: p.funding_quarters })} BEAP`, submittedAt: p.submitted_at.toISOString(), status: p.status,
      documents: files.filter(f => f.plan_id === p.id).map(f => ({ id: f.id, name: f.name, size: f.size })) }));
    return json({ plans: body });
  } catch (cause) { console.error('RAT tool list failed', cause); return json({ error: 'Unable to load the RAT tools' }, 503); }
}
