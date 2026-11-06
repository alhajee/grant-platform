import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { deletePlan } from '@/lib/plan-delete';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const remove = z.object({ id: z.number().int().positive(), confirm: z.string().trim().max(32) }).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

/** Every state's plans for the Super Admin's Plans page (Admin > Plans), newest first. */
export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required' }, 403);
    const plans = (await getPostgres().query(`
      SELECT p.id, p.state_code AS "stateCode", p.start_year AS "startYear", p.implementation_year AS "implementationYear", p.status,
        p.created_at AS "createdAt", u.full_name AS "createdBy",
        COALESCE((SELECT array_agg(q.quarter ORDER BY q.quarter) FROM plan_quarters q WHERE q.plan_id=p.id), '{}') AS quarters,
        (SELECT count(*)::int FROM activity_plan_lines l WHERE l.plan_id=p.id) + (SELECT count(*)::int FROM sports_budget_lines l WHERE l.plan_id=p.id)
          + (SELECT count(*)::int FROM infrastructure_packages l WHERE l.plan_id=p.id) AS lines,
        (SELECT count(*)::int FROM ubec_rounds r WHERE r.plan_id=p.id) AS "ubecRounds"
      FROM action_plans p LEFT JOIN users u ON u.id=p.created_by
      ORDER BY p.created_at DESC, p.id DESC`)).rows;
    return json({ plans });
  } catch (cause) {
    console.error('Administrator plan list failed', cause);
    return json({ error: 'Unable to load the plans. Please try again.' }, 503);
  }
}

/**
 * Deletes any plan with everything recorded against it, including its UBEC rounds, reviews and decisions (lib/plan-delete.ts).
 * Super Admin only, same origin; `confirm` must be the plan's state code, typed in the dialog.
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required' }, 403);
    const parsed = remove.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose a plan to delete' }, 400);
    return await getPostgres().transaction(async db => {
      const admin = (await db.query<{ full_name: string; email: string }>("SELECT full_name, email FROM users WHERE id=$1 AND active AND role='Super Admin' AND session_version=$2 FOR SHARE", [actor.userId, actor.sessionVersion])).rows[0];
      if (!admin) return json({ error: 'Your administrator access has changed. Sign in again.' }, 403);
      const plan = (await db.query<{ id: number; state_code: string; start_year: number }>('SELECT id, state_code, start_year FROM action_plans WHERE id=$1 FOR UPDATE', [parsed.data.id])).rows[0];
      if (!plan) return json({ error: 'This plan no longer exists' }, 404);
      if (parsed.data.confirm.toUpperCase() !== plan.state_code) return json({ error: `Type ${plan.state_code} to confirm` }, 400);
      const rounds = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM ubec_rounds WHERE plan_id=$1', [plan.id])).rows[0].count;
      await deletePlan(db, plan.id);
      console.info(`Plan ${plan.id} (${plan.state_code}, ${plan.start_year}, ${rounds} UBEC rounds) deleted by Super Admin ${admin.full_name} <${admin.email}>`);
      return json({ deleted: plan.id });
    });
  } catch (cause) {
    console.error('Administrator plan delete failed', cause);
    return json({ error: 'The plan could not be deleted. Please try again.' }, 503);
  }
}
