import { NextRequest, NextResponse } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { readStateStageVisibility } from '@/lib/stage-visibility';
import { visibleSnapshot } from '@/lib/plan-visibility';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { mergePlanSchools, planSchools, type PlanSchool } from '@/lib/plan-schools';

// UBEC234: the schools of the viewer's state plans for the SUBEB dashboard's "Targeted schools" list. GET ?plans=1,2,3
// (the plans the dashboard shows; omitted = every plan of the state). Only components that have reached the viewer
// count, as in the dashboard figures (lib/stage-visibility.ts). The plan page builds the same list from its snapshot.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const maxPlans = 200;

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to continue', 401);
    if (workspace.stateCode === 'UBEC') return error('Only SUBEB users read this list', 403);
    const param = request.nextUrl.searchParams.get('plans');
    if (param !== null && !/^[1-9]\d{0,9}(,[1-9]\d{0,9}){0,199}$/.test(param)) return error('Choose valid plans');
    const wanted = param ? [...new Set(param.split(',').map(Number))] : null;
    const db = getPostgres();
    const plans = (await db.query<{ id: number }>(`SELECT id FROM action_plans WHERE state_code=$1 ${wanted ? 'AND id=ANY($2::int[])' : ''} ORDER BY id LIMIT ${maxPlans}`, wanted ? [workspace.stateCode, wanted] : [workspace.stateCode])).rows;
    const visibility = await readStateStageVisibility(db, workspace, workspace.stateCode);
    const lists: PlanSchool[][] = [];
    for (const plan of plans) lists.push(planSchools(visibleSnapshot(await readPlanSnapshot(db, plan.id), visibility.get(plan.id) ?? [])));
    return NextResponse.json({ schools: mergePlanSchools(lists), plans: plans.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error('Plan schools read failed', cause); return error('Unable to load the schools', 503); }
}
