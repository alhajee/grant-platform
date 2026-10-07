import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { infrastructureTlmModes, readInfrastructureTlmMode } from '@/lib/infrastructure-tlm-mode';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.object({ mode: z.enum(infrastructureTlmModes) }).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

/** Super Admin: whether Infrastructure and TLM split their shared pool or draw from it first come, first served, for every state. */
export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required.' }, 403);
    return json({ mode: await readInfrastructureTlmMode(getPostgres()) });
  } catch (cause) {
    console.error('Infrastructure and TLM budget setting could not be loaded', cause);
    return json({ error: 'Unable to load the Infrastructure and TLM budget setting.' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose a valid Infrastructure and TLM budget setting.' }, 400);
    const { mode } = parsed.data;
    await getPostgres().query(`
      INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,infrastructure_tlm_mode,updated_by)
      VALUES('GLOBAL','complete_plan',$1,$2)
      ON CONFLICT(state_code) DO UPDATE SET infrastructure_tlm_mode=EXCLUDED.infrastructure_tlm_mode, updated_by=EXCLUDED.updated_by, updated_at=NOW()
    `, [mode, actor.userId]);
    return json({ mode });
  } catch (cause) {
    console.error('Infrastructure and TLM budget setting could not be saved', cause);
    return json({ error: 'Unable to save the Infrastructure and TLM budget setting.' }, 503);
  }
}
