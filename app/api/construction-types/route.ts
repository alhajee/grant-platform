import { NextRequest, NextResponse } from "next/server";
import { constructionTypeName, constructionTypeSchema } from "@/lib/construction-types";
import { getPostgres } from "@/lib/postgres";
import { constructionTypeFields, getWorkspaceState, sqlText } from "@/lib/workspace-state";
import { canEditPillar } from '@/lib/subeb-access';

export async function POST(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return NextResponse.json({ error: "Sign in to create a construction type." }, { status: 401 });
    if (!canEditPillar(workspace.role, workspace.department, 'infrastructure')) return NextResponse.json({ error: 'Only Physical Planning staff can create construction types.' }, { status: 403 });
    const input = await request.json().catch(() => null);
    const parsed = constructionTypeSchema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const type = parsed.data;
    return await getPostgres().transaction(async db => {
    const actor = (await db.query('SELECT role,department FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [workspace.userId,workspace.sessionVersion])).rows[0];
    if (!actor || !canEditPillar(actor.role,actor.department,'infrastructure')) return NextResponse.json({ error:'Your department access has changed. Sign in again.' },{status:403});
    const { rows } = await db.query(`
      INSERT INTO construction_types (id, state_code, name, classrooms, playrooms_labs, libraries, toilets, offices_stores, duration, unit_cost, created_by)
      VALUES (${sqlText(crypto.randomUUID())}, ${sqlText(workspace.stateCode)}, ${sqlText(constructionTypeName(type))},
        ${type.classrooms}, ${type.playroomsLabs}, ${type.libraries}, ${type.toilets}, ${type.officesStores}, ${type.duration}, ${type.unitCost.toFixed(2)}, ${sqlText(workspace.email)})
      ON CONFLICT (state_code, classrooms, playrooms_labs, libraries, toilets, offices_stores) DO NOTHING
      RETURNING ${constructionTypeFields}`);
    if (rows[0]) return NextResponse.json({ constructionType: rows[0] }, { status: 201 });
    const existing = await db.query(`SELECT ${constructionTypeFields} FROM construction_types WHERE state_code = ${sqlText(workspace.stateCode)}
      AND classrooms = ${type.classrooms} AND playrooms_labs = ${type.playroomsLabs} AND libraries = ${type.libraries}
      AND toilets = ${type.toilets} AND offices_stores = ${type.officesStores}`);
    return NextResponse.json({ error: "This construction type already exists. Use the saved type.", constructionType: existing.rows[0] }, { status: 409 });
    });
  } catch (cause) {
    console.error("Unable to save construction type", cause);
    return NextResponse.json({ error: "Could not save the construction type. Please try again." }, { status: 503 });
  }
}
