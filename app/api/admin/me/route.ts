import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser } from '@/lib/workspace-state';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** The signed-in Super Admin for the admin pages' header, and whether they have switched into another account. */
export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) return json({ error: 'Sign in to continue.' }, 401);
    if (actor.role !== 'Super Admin') return json({ error: 'Super-admin access required.' }, 403);
    return json({ user: { name: actor.name, role: actor.role, email: actor.email }, impersonating: Boolean(request.cookies.get('ubec_impersonation')?.value) });
  } catch (cause) {
    console.error('Admin session lookup failed', cause);
    return json({ error: 'Unable to load the admin workspace.' }, 503);
  }
}
