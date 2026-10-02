import { NextRequest, NextResponse } from "next/server";
import { getPostgres } from "@/lib/postgres";
import { resolveActionPlan } from "@/lib/plan-workspace";
import { getWorkspaceState } from "@/lib/workspace-state";
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { visibleComponents, visibleSnapshot } from '@/lib/plan-visibility';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { implementedPillars } from '@/lib/beap-pillars';
import { readPillarReviews, mayEditPillar } from '@/lib/pillar-review';

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to view your annual plan." }, { status: 401 });
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return NextResponse.json({ error: "Action plan not found." }, { status: 404 });
    const db = getPostgres();
    const visiblePillars = visibleComponents(workspace);
    const snapshot = visibleSnapshot(await readPlanSnapshot(db, plan.id), workspace);
    const summarize = (lines: {quantity:number;unit_cost:string}[], schoolCount=0) => ({
      lineCount: lines.length, schoolCount, budget: lines.reduce((sum,line)=>sum+Math.round(Number(line.unit_cost)*100)*line.quantity,0)/100,
    });
    const schoolKey = (school:{name:string;lga:string;level:string}) => JSON.stringify([school.name,school.lga,school.level]);
    const infraSchools = snapshot.infrastructure.map(line=>schoolKey(line.school));
    const sportsSchools = snapshot.sports.flatMap(line=>line.allocations.map(a=>schoolKey(a.school)));
    const tlmSchools = (snapshot.tlmDistribution??[]).map(schoolKey);
    const curriculumSchools = (snapshot.curriculumDistribution??[]).map(schoolKey);
    const infrastructure = summarize(snapshot.infrastructure,new Set(infraSchools).size);
    const sports = summarize(snapshot.sports,new Set(sportsSchools).size);
    const sbmc = summarize(snapshot.sbmc??[]);
    const tlm = summarize(snapshot.tlm??[],new Set(tlmSchools).size);
    const monitoring = summarize(snapshot.monitoring??[]), gscci = summarize(snapshot.gscci??[]);
    const curriculum = summarize(snapshot.curriculum??[],new Set(curriculumSchools).size);
    const parts = [infrastructure,sports,sbmc,tlm,monitoring,gscci,curriculum];
    const total = {
      lineCount: parts.reduce((sum,p)=>sum+p.lineCount,0),
      schoolCount: new Set([...infraSchools,...sportsSchools,...tlmSchools,...curriculumSchools]).size,
      budget: parts.reduce((sum,p)=>sum+p.budget,0),
    };
    const reviews = await readPillarReviews(db, plan.id);
    const editablePillars = implementedPillars.filter(p => mayEditPillar(workspace.role,workspace.departments ?? workspace.department,p,plan.status,reviews));
    return NextResponse.json({ wholeState: canViewWholeStatePlan(workspace), visiblePillars, sbmc, tlm, monitoring, gscci, curriculum, editablePillars, plan, role: workspace.role, department: workspace.department, departments: workspace.departments, canEdit: editablePillars.length > 0, infrastructure, sports, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Unable to load BEAP overview", cause);
    return NextResponse.json({ error: "Your annual plan could not be loaded. Please try again." }, { status: 503 });
  }
}
