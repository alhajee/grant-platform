import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import type { BeapChairSubmissionMode } from '@/lib/workflow-settings';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const inputSchema = z.object({
  stateCode: z.string().trim().min(1).max(20),
  mode: z.enum(['complete_plan', 'individual_components']),
}).strict();

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required.' }, 403);
    const settings = (await getPostgres().query<{ stateCode: string; mode: BeapChairSubmissionMode }>(`
      SELECT states.state_code AS "stateCode",
        COALESCE(settings.beap_chair_submission_mode, 'complete_plan') AS mode
      FROM (SELECT DISTINCT state_code FROM users WHERE role NOT LIKE 'UBEC %' AND role <> 'Super Admin') states
      LEFT JOIN state_workflow_settings settings ON settings.state_code=states.state_code
      ORDER BY states.state_code
    `)).rows;
    return json({ settings });
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
    if (!parsed.success) return json({ error: 'Choose a state and a valid submission mode.' }, 400);
    const { stateCode, mode } = parsed.data;
    const db = getPostgres();
    const stateExists = (await db.query("SELECT 1 FROM users WHERE state_code=$1 AND role NOT LIKE 'UBEC %' AND role<>'Super Admin' LIMIT 1", [stateCode])).rowCount;
    if (!stateExists) return json({ error: 'This SUBEB workspace is unavailable.' }, 404);
    await db.query(`
      INSERT INTO state_workflow_settings(state_code,beap_chair_submission_mode,updated_by)
      VALUES($1,$2,$3)
      ON CONFLICT(state_code) DO UPDATE SET
        beap_chair_submission_mode=EXCLUDED.beap_chair_submission_mode,
        updated_by=EXCLUDED.updated_by,
        updated_at=NOW()
    `, [stateCode, mode, actor.userId]);
    return json({ stateCode, mode });
  } catch (cause) {
    console.error('Workflow setting could not be saved', cause);
    return json({ error: 'Unable to save the workflow setting.' }, 503);
  }
}
