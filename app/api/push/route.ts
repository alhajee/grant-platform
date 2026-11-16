import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { readPushKeys } from '@/lib/push-keys';

// UBEC260: devices that turn alerts on register a web push subscription here; lib/notification-delivery.ts sends to them.
// GET: the public key to subscribe with. POST: save this device's subscription. DELETE: forget it (alerts turned off).

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const noStore = { 'Cache-Control': 'no-store' };
const endpoint = z.string().url().max(1000).refine(value => value.startsWith('https://'), 'Use a secure push address');
const subscribeSchema = z.object({ endpoint, keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict() }).strict();
const unsubscribeSchema = z.object({ endpoint }).strict();

export async function GET(request: NextRequest) {
  try {
    if (!await getWorkspaceState(request)) return error('Sign in to continue', 401);
    const { publicKey } = await readPushKeys(getPostgres());
    return NextResponse.json({ publicKey }, { headers: noStore });
  } catch (cause) { console.error('Push key could not be read', cause); return error('Alerts are unavailable right now', 503); }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This request must come from the portal', 403);
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('This browser sent an alert subscription we could not read');
    const agent = (request.headers.get('user-agent') ?? '').slice(0, 300);
    // A device belongs to whoever signed in on it last.
    await getPostgres().query(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,last_used_at=NOW()`,
      [user.userId, parsed.data.endpoint, parsed.data.keys.p256dh, parsed.data.keys.auth, agent]);
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error('Push subscription could not be saved', cause); return error('Alerts could not be turned on. Please try again.', 503); }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This request must come from the portal', 403);
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose the device to turn alerts off for');
    await getPostgres().query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [parsed.data.endpoint, user.userId]);
    return NextResponse.json({ ok: true });
  } catch (cause) { console.error('Push subscription could not be removed', cause); return error('Alerts could not be turned off. Please try again.', 503); }
}
