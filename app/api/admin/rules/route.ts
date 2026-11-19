import { NextRequest, NextResponse } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { platformRulesPatchSchema } from '@/lib/platform-rules';
import { readPlatformRules, savePlatformRules } from '@/lib/platform-rules-db';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

/** Super Admin: the platform rules (migration 105, lib/platform-rules.ts). GET all; PUT any subset. */
export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required' }, 403);
    return json({ rules: await readPlatformRules(getPostgres()) });
  } catch (cause) {
    console.error('Platform rules could not be loaded', cause);
    return json({ error: 'Unable to load the requirements' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required' }, 403);
    const parsed = platformRulesPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Check the requirements: each is on or off, and the ECCDE share is 1–100% in steps of 0.5' }, 400);
    return json({ rules: await savePlatformRules(getPostgres(), parsed.data, actor.userId) });
  } catch (cause) {
    console.error('Platform rules could not be saved', cause);
    return json({ error: 'Unable to save the requirements' }, 503);
  }
}
