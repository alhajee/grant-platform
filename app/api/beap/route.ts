import { NextRequest, NextResponse } from "next/server";
import { getPostgres } from "@/lib/postgres";
import { resolveActionPlan } from "@/lib/plan-workspace";
import { getWorkspaceState, sqlText } from "@/lib/workspace-state";
import { implementedPillars } from '@/lib/beap-pillars';
import { readPillarReviews, mayEditPillar } from '@/lib/pillar-review';

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to view your annual plan." }, { status: 401 });
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return NextResponse.json({ error: "Action plan not found." }, { status: 404 });
    const state = sqlText(workspace.stateCode);
    const db = getPostgres();
    const [infrastructure, sports, schools] = await Promise.all([db.query(`SELECT COUNT(*)::int AS "lineCount",
      COUNT(DISTINCT line.school_id)::int AS "schoolCount",
      COALESCE(SUM(line.unit_cost * line.quantity), 0)::float8 AS "budget"
      FROM infrastructure_lines line JOIN schools school ON school.id = line.school_id
      WHERE school.state_code = ${state} AND line.plan_id = ${plan.id}`),
      db.query(`SELECT COUNT(*)::int AS "lineCount", COALESCE(SUM(unit_cost * quantity), 0)::float8 AS budget,
        (SELECT COUNT(DISTINCT a.school_id)::int FROM sports_allocations a JOIN sports_budget_lines b ON b.id = a.line_id
          JOIN schools s ON s.id = a.school_id WHERE b.state_code = ${state} AND b.plan_id = ${plan.id} AND s.state_code = ${state}) AS "schoolCount"
        FROM sports_budget_lines WHERE state_code = ${state} AND plan_id = ${plan.id}`),
      db.query(`SELECT COUNT(DISTINCT school_id)::int AS count FROM (
        SELECT l.school_id FROM infrastructure_lines l JOIN schools s ON s.id = l.school_id WHERE s.state_code = ${state} AND l.plan_id = ${plan.id}
        UNION SELECT a.school_id FROM sports_allocations a JOIN sports_budget_lines b ON b.id = a.line_id
          JOIN schools s ON s.id = a.school_id WHERE b.state_code = ${state} AND b.plan_id = ${plan.id} AND s.state_code = ${state}
      ) beneficiaries`),
    ]);
    const total = { lineCount: infrastructure.rows[0].lineCount + sports.rows[0].lineCount, schoolCount: schools.rows[0].count,
      budget: (Math.round(infrastructure.rows[0].budget * 100) + Math.round(sports.rows[0].budget * 100)) / 100 };
    const reviews = await readPillarReviews(db, plan.id);
    const editablePillars = implementedPillars.filter(p => mayEditPillar(workspace.role,workspace.department,p,plan.status,reviews));
    return NextResponse.json({ editablePillars, plan, role: workspace.role, department: workspace.department, canEdit: editablePillars.length > 0, infrastructure: infrastructure.rows[0], sports: sports.rows[0], total }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Unable to load BEAP overview", cause);
    return NextResponse.json({ error: "Your annual plan could not be loaded. Please try again." }, { status: 503 });
  }
}
