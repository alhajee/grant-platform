import { canViewComponent } from '@/lib/subeb-access';
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveActionPlan } from "@/lib/plan-workspace";
import { mutatePlan } from "@/lib/plan-mutations";
import { readPillarReviews, mayEditPillar } from '@/lib/pillar-review';
import { planPeriod } from "@/lib/action-plans";
import { getPostgres } from "@/lib/postgres";
import { getWorkspaceState, sqlText } from "@/lib/workspace-state";
import { sportsAllocationSchema, sportsLineSchema } from "@/lib/sports";

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const commandSchema = z.object({ entity: z.enum(["budget", "allocation"]), action: z.enum(["create", "update", "delete"]), id: z.number().int().positive().optional() });

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error("Sign in to view your sports plan.", 401);
    if (!canViewComponent(workspace, 'sports')) return error("This component belongs to another department.", 403);
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return error("Action plan not found.", 404);
    const state = sqlText(workspace.stateCode);
    const db = getPostgres();
    const [lines, allocations, schools] = await Promise.all([
      db.query(`SELECT id, code, section, activity_type AS "activityType", description, quantity, unit_cost::float8 AS "unitCost"
        FROM sports_budget_lines WHERE state_code = ${state} AND plan_id = ${plan.id} ORDER BY id`),
      db.query(`SELECT a.id, a.line_id AS "lineId", a.school_id AS "schoolId", a.quantity, a.longitude, a.latitude,
        s.name, s.lga, s.level, s.location FROM sports_allocations a
        JOIN sports_budget_lines b ON b.id = a.line_id JOIN schools s ON s.id = a.school_id
        WHERE b.state_code = ${state} AND b.plan_id = ${plan.id} AND s.state_code = ${state} ORDER BY s.name, a.id`),
      db.query(`SELECT id, name, lga, level, location FROM schools WHERE state_code = ${state} ORDER BY name`),
    ]);
    return NextResponse.json({ plan, canEdit: mayEditPillar(workspace.role,workspace.departments ?? workspace.department,'sports',plan.status,await readPillarReviews(db,plan.id)), lines: lines.rows, allocations: allocations.rows, schools: schools.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("Unable to load sports plan", cause);
    return error("Your sports plan could not be loaded. Please try again.", 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error("Sign in to update your sports plan.", 401);
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return error("Action plan not found.", 404);
    const body = await request.json().catch(() => null);
    const command = commandSchema.safeParse(body);
    if (!command.success) return error("Choose a valid sports plan action.");
    const { entity, action, id } = command.data;
    if (action === "create" && id !== undefined) return error("A new line cannot specify an existing ID.");
    if (action !== "create" && !id) return error("Choose the line to update.");
    const state = sqlText(workspace.stateCode);

    return await mutatePlan(workspace, plan, "sports", async (db) => {
      // All quantity checks and writes share a state-level lock. Concurrent
      // allocation requests cannot exceed the equipment procurement quantity.
      await db.query(`SELECT pg_advisory_xact_lock(hashtext(${sqlText(`sports:${workspace.stateCode}`)}))`);
      if (entity === "budget") {
        const existing = id ? (await db.query(`SELECT section, activity_type FROM sports_budget_lines WHERE id = ${id} AND state_code = ${state} AND plan_id = ${plan.id} FOR UPDATE`)).rows[0] : null;
        if (action !== "create" && !existing) return error("Budget line not found.", 404);
        const allocated = id ? Number((await db.query(`SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM sports_allocations WHERE line_id = ${id}`)).rows[0].quantity) : 0;
        if (action === "delete") {
          if (allocated) return error("Remove this item's school allocations before deleting it.", 409);
          await db.query(`DELETE FROM sports_budget_lines WHERE id = ${id} AND state_code = ${state}`);
          return NextResponse.json({ ok: true });
        }
        const parsed = sportsLineSchema.safeParse(body);
        if (!parsed.success) return error(parsed.error.issues[0].message);
        const line = parsed.data;
        if (allocated && (line.section !== existing?.section || line.activityType !== existing?.activity_type)) return error("Remove this item's school allocations before changing its sport or section.", 409);
        if (line.quantity < allocated) return error(`${allocated} items are already allocated to schools. Reduce those allocations first.`, 409);
        const values = `${sqlText(line.section)}, ${sqlText(line.activityType)}, ${sqlText(line.description)}, ${line.quantity}, ${line.unitCost.toFixed(2)}`;
        const result = action === "create"
          ? await db.query(`WITH next_line AS (SELECT nextval(pg_get_serial_sequence('sports_budget_lines', 'id')) AS id)
              INSERT INTO sports_budget_lines (id, plan_id, state_code, code, section, activity_type, description, quantity, unit_cost)
              SELECT id, ${plan.id}, ${state}, 'UBEC/SUBEB/SPORT/' || LPAD(id::text, GREATEST(3, LENGTH(id::text)), '0') || ${sqlText('/' + planPeriod(plan))}, ${values} FROM next_line RETURNING id, code`)
          : await db.query(`UPDATE sports_budget_lines SET section = ${sqlText(line.section)}, activity_type = ${sqlText(line.activityType)},
              description = ${sqlText(line.description)}, quantity = ${line.quantity}, unit_cost = ${line.unitCost.toFixed(2)}, updated_at = NOW()
              WHERE id = ${id} AND state_code = ${state} RETURNING id, code`);
        return NextResponse.json(result.rows[0], { status: action === "create" ? 201 : 200 });
      }

      if (action !== "create") {
        const existing = await db.query(`SELECT a.id FROM sports_allocations a JOIN sports_budget_lines b ON b.id = a.line_id
          JOIN schools s ON s.id = a.school_id WHERE a.id = ${id} AND b.state_code = ${state} AND b.plan_id = ${plan.id} AND s.state_code = ${state}`);
        if (!existing.rowCount) return error("School allocation not found.", 404);
      }
      if (action === "delete") {
        await db.query(`DELETE FROM sports_allocations WHERE id = ${id}`);
        return NextResponse.json({ ok: true });
      }
      const parsed = sportsAllocationSchema.safeParse(body);
      if (!parsed.success) return error(parsed.error.issues[0].message);
      const allocation = parsed.data;
      const equipment = (await db.query(`SELECT b.quantity FROM sports_budget_lines b JOIN schools s ON s.state_code = b.state_code
        WHERE b.id = ${allocation.lineId} AND b.plan_id = ${plan.id} AND b.section = 'equipment' AND b.state_code = ${state} AND s.id = ${allocation.schoolId}`)).rows[0];
      if (!equipment) return error("Choose a school and an equipment item from your state plan.");
      const duplicate = await db.query(`SELECT id FROM sports_allocations WHERE school_id = ${allocation.schoolId} AND line_id = ${allocation.lineId}${action === "update" ? ` AND id <> ${id}` : ""}`);
      if (duplicate.rowCount) return error("This school already has an allocation for this item. Edit that allocation instead.", 409);
      const allocated = Number((await db.query(`SELECT COALESCE(SUM(quantity), 0)::int AS quantity FROM sports_allocations WHERE line_id = ${allocation.lineId}${action === "update" ? ` AND id <> ${id}` : ""}`)).rows[0].quantity);
      if (allocation.quantity + allocated > equipment.quantity) return error(`Only ${equipment.quantity - allocated} items remain available to allocate.`, 409);
      const result = action === "create"
        ? await db.query(`INSERT INTO sports_allocations (line_id, school_id, quantity, longitude, latitude)
            VALUES (${allocation.lineId}, ${allocation.schoolId}, ${allocation.quantity}, ${sqlText(allocation.longitude)}, ${sqlText(allocation.latitude)}) RETURNING id`)
        : await db.query(`UPDATE sports_allocations SET line_id = ${allocation.lineId}, school_id = ${allocation.schoolId}, quantity = ${allocation.quantity},
            longitude = ${sqlText(allocation.longitude)}, latitude = ${sqlText(allocation.latitude)}, updated_at = NOW() WHERE id = ${id} RETURNING id`);
      return NextResponse.json(result.rows[0], { status: action === "create" ? 201 : 200 });
    });
  } catch (cause) {
    console.error("Unable to update sports plan", cause);
    return error("Could not save that change. Please try again.", 503);
  }
}
