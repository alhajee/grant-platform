import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveActionPlan } from "@/lib/plan-workspace";
import { mutatePlan } from "@/lib/plan-mutations";
import { readPillarReviews, mayEditPillar } from '@/lib/pillar-review';
import { planPeriod } from "@/lib/action-plans";
import { constructionTypeSchema } from "@/lib/construction-types";
import { getPostgres } from "@/lib/postgres";
import { constructionTypeFields, getWorkspaceState, sqlText } from "@/lib/workspace-state";

const lineSchema = z.object({
  action: z.enum(["create", "update"]).default("create"),
  id: z.number().int().positive().nullable().optional(),
  schoolId: z.number().int().positive(),
  projectType: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(10000),
  duration: constructionTypeSchema.innerType().shape.duration.optional(),
  unitCost: constructionTypeSchema.innerType().shape.unitCost.optional(),
  rationale: z.string().max(5000).default(""),
  strategy: z.enum(["NCB", "National Shopping", "Direct Labour"]),
  longitude: z.string().max(30).default(""),
  latitude: z.string().max(30).default(""),
});

const lineFields = `line.id, line.code, line.project_type AS "projectType", line.quantity, line.rationale,
  line.duration, line.unit_cost::float8 AS "unitCost", line.strategy, line.longitude, line.latitude,
  school.id AS "schoolId", school.name, school.lga, school.level, school.location`;
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error("Sign in to view your infrastructure plan.", 401);
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return error("Action plan not found.", 404);
    const db = getPostgres();
    const state = sqlText(workspace.stateCode);
    const [schools, lines, constructionTypes] = await Promise.all([
      db.query(`SELECT id, name, lga, level, location FROM schools WHERE state_code = ${state} ORDER BY name`),
      db.query(`SELECT ${lineFields} FROM infrastructure_lines line JOIN schools school ON school.id = line.school_id WHERE school.state_code = ${state} AND line.plan_id = ${plan.id} ORDER BY line.id`),
      db.query(`SELECT ${constructionTypeFields} FROM construction_types WHERE state_code = ${state} ORDER BY created_at DESC, name`),
    ]);
    return NextResponse.json({ plan, canEdit: mayEditPillar(workspace.role,workspace.department,'infrastructure',plan.status,await readPillarReviews(db,plan.id)), schools: schools.rows, lines: lines.rows, constructionTypes: constructionTypes.rows });
  } catch (cause) {
    console.error("Unable to load infrastructure data", cause);
    return error("The database is unavailable. Please try again.", 503);
  }
}

async function deleteLine(request: NextRequest, id: unknown) {
  const workspace = await getWorkspaceState(request);
  if (!workspace) return error("Sign in to update your infrastructure plan.", 401);
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return error("A project line is required.");
  const plan = await resolveActionPlan(request, workspace.stateCode);
  if (!plan) return error("Action plan not found.", 404);
  return mutatePlan(workspace, plan, "infrastructure", async db => {
  const { rowCount } = await db.query(`DELETE FROM infrastructure_lines line USING schools school
    WHERE line.id = ${id} AND line.plan_id = ${plan.id} AND school.id = line.school_id AND school.state_code = ${sqlText(workspace.stateCode)}`);
  return rowCount ? NextResponse.json({ ok: true }) : error("Project line not found.", 404);
  });
}

async function saveLine(request: NextRequest, body: unknown, update = false) {
  const workspace = await getWorkspaceState(request);
  if (!workspace) return error("Sign in to update your infrastructure plan.", 401);
  const parsed = lineSchema.safeParse(body);
  if (!parsed.success) return error("Choose a school and construction type, and enter a valid quantity, duration, and unit cost.");
  const input = parsed.data;
  const plan = await resolveActionPlan(request, workspace.stateCode);
  if (!plan) return error("Action plan not found.", 404);
  return mutatePlan(workspace, plan, "infrastructure", async db => {
  const state = sqlText(workspace.stateCode);
  const { rows } = await db.query<{ duration: number; unitCost: number }>(`SELECT type.duration, type.unit_cost::float8 AS "unitCost"
    FROM construction_types type JOIN schools school ON school.state_code = type.state_code
    WHERE type.id = ${sqlText(input.projectType)} AND school.id = ${input.schoolId} AND type.state_code = ${state}`);
  if (!rows[0]) return error("Choose a school and construction type from your state workspace.");
  const duration = input.duration ?? rows[0].duration;
  const unitCost = (input.unitCost ?? rows[0].unitCost).toFixed(2);
  if (update || input.action === "update") {
    if (!input.id) return error("A project line is required.");
    const { rowCount } = await db.query(`UPDATE infrastructure_lines line SET school_id = ${input.schoolId}, project_type = ${sqlText(input.projectType)},
      quantity = ${input.quantity}, duration = ${duration}, unit_cost = ${unitCost}, rationale = ${sqlText(input.rationale)}, strategy = ${sqlText(input.strategy)},
      longitude = ${sqlText(input.longitude)}, latitude = ${sqlText(input.latitude)}, updated_at = NOW()
      WHERE line.id = ${input.id} AND line.plan_id = ${plan.id} AND EXISTS (SELECT 1 FROM schools WHERE id = line.school_id AND state_code = ${state})`);
    return rowCount ? NextResponse.json({ ok: true }) : error("Project line not found.", 404);
  }
  const result = await db.query(`WITH next_line AS (SELECT nextval(pg_get_serial_sequence('infrastructure_lines', 'id')) AS id)
    INSERT INTO infrastructure_lines (id, plan_id, school_id, code, project_type, quantity, duration, unit_cost, rationale, strategy, longitude, latitude)
    SELECT next_line.id, ${plan.id}, ${input.schoolId}, 'UBC/SUBEB/NC/' || LPAD(next_line.id::text, GREATEST(3, LENGTH(next_line.id::text)), '0') || ${sqlText('/' + planPeriod(plan))},
      ${sqlText(input.projectType)}, ${input.quantity}, ${duration}, ${unitCost}, ${sqlText(input.rationale)}, ${sqlText(input.strategy)}, ${sqlText(input.longitude)}, ${sqlText(input.latitude)}
    FROM next_line RETURNING id, code`);
  return NextResponse.json(result.rows[0], { status: 201 });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    return body && typeof body === "object" && "action" in body && body.action === "delete"
      ? await deleteLine(request, "id" in body ? body.id : undefined) : await saveLine(request, body);
  } catch (cause) {
    console.error("Unable to save infrastructure line", cause);
    return error("Could not save that project line. Please try again.", 503);
  }
}

export async function PATCH(request: NextRequest) {
  try { return await saveLine(request, await request.json().catch(() => null), true); }
  catch (cause) { console.error("Unable to update infrastructure line", cause); return error("Could not update that project line.", 503); }
}

export async function DELETE(request: NextRequest) {
  try { return await deleteLine(request, Number(new URL(request.url).searchParams.get("id"))); }
  catch (cause) { console.error("Unable to remove infrastructure line", cause); return error("Could not remove that project line.", 503); }
}
