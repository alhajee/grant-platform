import { NextRequest, NextResponse } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { readUiPreferences, uiPreferencesSchema } from '@/lib/ui-preferences';

// UBEC261: the signed-in person's display choices. GET reads them; PATCH merges the given keys (same origin).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const row = (await getPostgres().query<{ ui_preferences: unknown }>('SELECT ui_preferences FROM users WHERE id=$1', [user.userId])).rows[0];
    return NextResponse.json({ preferences: readUiPreferences(row?.ui_preferences) }, { headers: noStore });
  } catch (cause) { console.error('Preferences could not be read', cause); return error('Your display settings could not be loaded', 503); }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This request must come from the portal', 403);
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const parsed = uiPreferencesSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose a listed display setting');
    const row = (await getPostgres().query<{ ui_preferences: unknown }>('UPDATE users SET ui_preferences = ui_preferences || $2::jsonb WHERE id=$1 RETURNING ui_preferences', [user.userId, JSON.stringify(parsed.data)])).rows[0];
    return NextResponse.json({ preferences: readUiPreferences(row?.ui_preferences) }, { headers: noStore });
  } catch (cause) { console.error('Preferences could not be saved', cause); return error('Your display settings could not be saved', 503); }
}
