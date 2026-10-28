import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { mutatePlan } from '@/lib/plan-mutations';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';

// The PHE officer training distribution list (UBEC74, migration 079): the schools the Training of PHE Officers lines are
// for, kept in tlm_distribution with workstream 'phe'. Sports editors add schools (several at once; already listed ones
// are skipped) and remove them, with the usual component edit rules (mutatePlan).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.union([
  z.object({ action: z.literal('add'), schoolIds: z.array(z.number().int().positive()).min(1).max(5000) }).strict(),
  z.object({ action: z.literal('remove'), schoolId: z.number().int().positive() }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to update your sports plan', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const plan = await resolveActionPlan(request, workspace.stateCode);
    if (!plan) return error('Action plan not found', 404);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose the schools for the PHE training list');
    const input = parsed.data;
    return await mutatePlan(workspace, plan, 'sports', async db => {
      if (input.action === 'remove') {
        await db.query("DELETE FROM tlm_distribution WHERE plan_id=$1 AND workstream='phe' AND school_id=$2", [plan.id, input.schoolId]);
        return NextResponse.json({ ok: true });
      }
      const ids = [...new Set(input.schoolIds)];
      const found = (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM schools WHERE id=ANY($1::int[]) AND state_code=$2', [ids, workspace.stateCode])).rows[0].n;
      if (found !== ids.length) return error('One or more schools were not found in your state', 404);
      const added = (await db.query("INSERT INTO tlm_distribution(plan_id,workstream,school_id) SELECT $1,'phe',unnest($2::int[]) ON CONFLICT DO NOTHING", [plan.id, ids])).rowCount ?? 0;
      return NextResponse.json({ ok: true, added, skipped: ids.length - added });
    });
  } catch (cause) {
    console.error('PHE training schools could not be saved', cause);
    return error('The PHE training list could not be saved. Please try again.', 503);
  }
}
