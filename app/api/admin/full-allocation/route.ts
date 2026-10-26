import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { readFullAllocationRequired } from '@/lib/full-allocation-setting';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.object({ required: z.boolean() }).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

/** Super Admin: whether every component must use its whole allocation before it is sent (UBEC79, migration 076). */
export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required' }, 403);
    return json({ required: await readFullAllocationRequired(getPostgres()) });
  } catch (cause) {
    console.error('Full allocation setting could not be loaded', cause);
    return json({ error: 'Unable to load the full allocation setting' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required' }, 403);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose whether allocations must be used in full' }, 400);
    const { required } = parsed.data;
    await getPostgres().query(`
      INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,full_allocation_required,updated_by)
      VALUES('GLOBAL','complete_plan',$1,$2)
      ON CONFLICT(state_code) DO UPDATE SET full_allocation_required=EXCLUDED.full_allocation_required, updated_by=EXCLUDED.updated_by, updated_at=NOW()
    `, [required, actor.userId]);
    return json({ required });
  } catch (cause) {
    console.error('Full allocation setting could not be saved', cause);
    return json({ error: 'Unable to save the full allocation setting' }, 503);
  }
}
