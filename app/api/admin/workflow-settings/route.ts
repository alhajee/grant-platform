import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { readWorkflowSettings } from '@/lib/workflow-settings';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.object({
  mode: z.enum(['complete_plan', 'individual_components']),
  ubecMode: z.enum(['complete_plan', 'reviewed_components']),
}).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    return json({ setting: await readWorkflowSettings(getPostgres()) });
  } catch (cause) {
    console.error('Workflow settings could not be loaded', cause);
    return json({ error: 'Unable to load workflow settings.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose a valid submission mode.' }, 400);
    const { mode, ubecMode } = parsed.data;
    const db = getPostgres();
    await db.query(`
      INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,ubec_submission_mode,updated_by)
      VALUES('GLOBAL',$1,$2,$3)
      ON CONFLICT(state_code) DO UPDATE SET
        beap_chair_submission_mode=EXCLUDED.beap_chair_submission_mode,
        ubec_submission_mode=EXCLUDED.ubec_submission_mode,
        updated_by=EXCLUDED.updated_by,
        updated_at=NOW()
    `, [mode, ubecMode, actor.userId]);
    return json({ mode, ubecMode });
  } catch (cause) {
    console.error('Workflow setting could not be saved', cause);
    return json({ error: 'Unable to save the workflow setting.' }, 503);
  }
}
