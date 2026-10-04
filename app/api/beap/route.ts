import { NextRequest, NextResponse } from "next/server";
import { getPostgres } from "@/lib/postgres";
import { resolveActionPlan } from "@/lib/plan-workspace";
import { getWorkspaceState } from "@/lib/workspace-state";
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { visibleComponents, visibleSnapshot } from '@/lib/plan-visibility';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { implementedPillars } from '@/lib/beap-pillars';
import { readPillarReviews, mayEditPillar } from '@/lib/pillar-review';
import { summarizeSnapshot } from '@/lib/plan-summary';

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to view your annual plan." }, { status: 401 });
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return NextResponse.json({ error: "Action plan not found." }, { status: 404 });
    const db = getPostgres();
    const visiblePillars = visibleComponents(workspace);
    const snapshot = visibleSnapshot(await readPlanSnapshot(db, plan.id), workspace);
    const { infrastructure, sports, sbmc, tlm, monitoring, gscci, curriculum, quality, teachers, ict, planning, total } = summarizeSnapshot(snapshot);
    const reviews = await readPillarReviews(db, plan.id);
    const editablePillars = implementedPillars.filter(p => mayEditPillar(workspace.role,workspace.departments ?? workspace.department,p,plan.status,reviews));
    return NextResponse.json({ wholeState: canViewWholeStatePlan(workspace), visiblePillars, sbmc, tlm, monitoring, gscci, curriculum, quality, teachers, ict, planning, editablePillars, plan, role: workspace.role, department: workspace.department, departments: workspace.departments, canEdit: editablePillars.length > 0, infrastructure, sports, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Unable to load BEAP overview", cause);
    return NextResponse.json({ error: "Your annual plan could not be loaded. Please try again." }, { status: 503 });
  }
}
