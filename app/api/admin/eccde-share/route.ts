import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { readEccdeShareRequired } from '@/lib/eccde-share-setting';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.object({ required: z.boolean() }).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

/** Super Admin: whether ECCDE must be at least 15% of the plan before the BEAP Chair sends to the Executive Chairman (UBEC231, migration 092). */
export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required' }, 403);
    return json({ required: await readEccdeShareRequired(getPostgres()) });
  } catch (cause) {
    console.error('ECCDE share setting could not be loaded', cause);
    return json({ error: 'Unable to load the ECCDE share setting' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required' }, 403);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose whether ECCDE must be at least 15% of the plan' }, 400);
    const { required } = parsed.data;
    await getPostgres().query(`
      INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,eccde_share_required,updated_by)
      VALUES('GLOBAL','complete_plan',$1,$2)
      ON CONFLICT(state_code) DO UPDATE SET eccde_share_required=EXCLUDED.eccde_share_required, updated_by=EXCLUDED.updated_by, updated_at=NOW()
    `, [required, actor.userId]);
    return json({ required });
  } catch (cause) {
    console.error('ECCDE share setting could not be saved', cause);
    return json({ error: 'Unable to save the ECCDE share setting' }, 503);
  }
}
