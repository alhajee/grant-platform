import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { readSchoolRegisterSource, schoolRegisterSources } from '@/lib/school-register-source';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.object({ source: z.enum(schoolRegisterSources) }).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

/** Super Admin: where the school register comes from (DNEMIS only, or DNEMIS plus hand changes), for every state. */
export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required.' }, 403);
    return json({ source: await readSchoolRegisterSource(getPostgres()) });
  } catch (cause) {
    console.error('School register source could not be loaded', cause);
    return json({ error: 'Unable to load the school register setting.' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal.' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose a valid school register source.' }, 400);
    const { source } = parsed.data;
    await getPostgres().query(`
      INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,school_register_source,updated_by)
      VALUES('GLOBAL','complete_plan',$1,$2)
      ON CONFLICT(state_code) DO UPDATE SET school_register_source=EXCLUDED.school_register_source, updated_by=EXCLUDED.updated_by, updated_at=NOW()
    `, [source, actor.userId]);
    return json({ source });
  } catch (cause) {
    console.error('School register source could not be saved', cause);
    return json({ error: 'Unable to save the school register setting.' }, 503);
  }
}
