import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { mutatePlan } from '@/lib/plan-mutations';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';

// The Sports school lists, kept in tlm_distribution with the Sports editors' usual rights (mutatePlan): the PHE officer
// training list (UBEC74, migration 079, workstream 'phe', the default) and the beneficiary schools that get equipment
// (UBEC249, migration 100, list 'sports'). Add several at once (already listed ones are skipped); remove one or several.
// Taking a school off the beneficiary list takes back its equipment items.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const list = z.enum(['phe', 'sports']).default('phe');
const command = z.union([
  z.object({ list, action: z.literal('add'), schoolIds: z.array(z.number().int().positive()).min(1).max(5000) }).strict(),
  z.object({ list, action: z.literal('remove'), schoolId: z.number().int().positive() }).strict(),
  z.object({ list, action: z.literal('remove'), schoolIds: z.array(z.number().int().positive()).min(1).max(5000) }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to update your sports plan', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return error('Action plan not found', 404);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose the schools for the list');
    const input = parsed.data;
    return await mutatePlan(workspace, plan, 'sports', async db => {
      if (input.action === 'remove') {
        const ids = 'schoolIds' in input ? [...new Set(input.schoolIds)] : [input.schoolId];
        if (input.list === 'sports') {
          await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sports:${workspace.stateCode}`]);
          await db.query('DELETE FROM sports_allocations a USING sports_budget_lines b WHERE b.id=a.line_id AND b.plan_id=$1 AND a.school_id=ANY($2::int[])', [plan.id, ids]);
        }
        const removed = (await db.query('DELETE FROM tlm_distribution WHERE plan_id=$1 AND workstream=$2 AND school_id=ANY($3::int[])', [plan.id, input.list, ids])).rowCount ?? 0;
        return NextResponse.json({ ok: true, removed });
      }
      const ids = [...new Set(input.schoolIds)];
      const found = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schools WHERE id=ANY($1::int[]) AND state_code=$2', [ids, workspace.stateCode])).rows[0].n;
      if (found !== ids.length) return error('One or more schools were not found in your state', 404);
      const added = (await db.query('INSERT INTO tlm_distribution(plan_id,workstream,school_id) SELECT $1,$3,unnest($2::int[]) ON CONFLICT DO NOTHING', [plan.id, ids, input.list])).rowCount ?? 0;
      return NextResponse.json({ ok: true, added, skipped: ids.length - added });
    });
  } catch (cause) {
    console.error('Sports school list could not be saved', cause);
    return error('The school list could not be saved. Please try again.', 503);
  }
}
