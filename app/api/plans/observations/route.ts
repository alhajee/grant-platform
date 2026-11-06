import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { readObservationStatus } from '@/lib/observation-requests-db';

// Observations before sending to UBEC (bug sheet row 156, migration 075; SUBEB audience since migration 085). GET ?plan=:
// the plan's earlier requests, for the Executive Chairman and the BEAP Chair. Since UBEC217 no new requests are made
// (POST answers 410) and none holds the send to UBEC.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? Number(plan) : null; };
export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    if (!canViewWholeStatePlan(user)) return error('Only the Executive Chairman and the BEAP Chair follow observation requests', 403);
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    const db = getPostgres();
    const plan = (await db.query<{ status: string }>('SELECT status FROM action_plans WHERE id=$1 AND state_code=$2', [planId, user.stateCode])).rows[0];
    if (!plan) return error('Plan not found', 404);
    const status = await readObservationStatus(db, planId);
    // UBEC217: no new requests.
    return NextResponse.json({ ...status, canRequest: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error('Observation requests read failed', cause); return error('Unable to load the observation requests', 503); }
}

/**
 * UBEC217 (6 November 2026): the Executive Chairman no longer asks for observations. The SUBEB's Audit, Procurement,
 * Finance and Special Programmes follow every component in real time instead. Earlier requests stay readable (GET above,
 * /beap/observations and /ubec/observations) and no longer hold the send to UBEC.
 */
const observationRequestsRetiredMessage = 'Observation requests have been retired. Audit, Procurement, Finance and Special Programmes now see every component as it is entered';
export async function POST(request: NextRequest) {
  const session = await getWorkspaceState(request);
  if (!session) return error('Sign in to continue', 401);
  return error(observationRequestsRetiredMessage, 410);
}
