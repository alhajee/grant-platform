import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { planPeriod } from '@/lib/action-plans';
import { stateDisplayName } from '@/lib/state-names';
import { statePlanOpen } from '@/lib/pillar-review';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { withDistributionCoordinates } from '@/lib/distribution-coordinates';
import { mayObserve, observationDepartmentName, observationViewer, waitingDepartments, type ObservationPlan, type ObservationViewer } from '@/lib/observation-requests';
import { readObservationRequests } from '@/lib/observation-requests-db';
import { oversightList } from '@/lib/ubec';

// Observations before sending to UBEC, UBEC side (bug sheet row 156, migration 075). GET: the plans whose Executive Chairman
// asked the viewer's department (the UBEC BEAP Chair: every plan) for observations, latest request first. GET ?plan=: the
// whole working plan (no UBEC round yet), its requests and what the viewer may do. POST ?plan= { action: 'done', note }:
// the department's Oversight Director sends its observations back to the Executive Chairman. Only while the plan is still
// with the SUBEB: once it is sent to UBEC these observations are not part of the UBEC review.
type Db = Parameters<Parameters<ReturnType<typeof getPostgres>['transaction']>[0]>[0];
type PlanRow = { id: number; state_code: string; start_year: number; end_year: number; funding_quarters: number[] | null; status: string; version: number; submission_number: number };
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const noStore = { 'Cache-Control': 'no-store' };
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? Number(plan) : null; };
const done = z.object({ action: z.literal('done'), note: z.string().trim().max(2000, 'Keep the note to 2,000 characters or fewer').default('') }).strict();
const period = (p: PlanRow) => `${planPeriod({ startYear: p.start_year, endYear: p.end_year, fundingQuarters: p.funding_quarters })} BEAP`;
const planFields = 'p.id,p.state_code,p.start_year,p.end_year,p.funding_quarters,p.status,p.version,p.submission_number';
/** SQL: plan `p` has a request that the viewer follows ($1 = department, NULL for the UBEC BEAP Chair). */
const followed = `EXISTS (SELECT 1 FROM plan_observation_requests r JOIN plan_observation_departments d ON d.request_id=r.id WHERE r.plan_id=p.id AND ($1::text IS NULL OR d.department=$1))`;

/** The plan if `viewer` follows its observations and it is still with the SUBEB, else why not. */
async function readPlan(db: Db, viewer: ObservationViewer, planId: number, lock = false): Promise<PlanRow | NextResponse> {
  const plan = (await db.query<PlanRow>(`SELECT ${planFields} FROM action_plans p WHERE p.id=$2 AND ${followed}${lock ? ' FOR UPDATE OF p' : ''}`, [viewer.department, planId])).rows[0];
  if (!plan) return error('Plan not found', 404);
  if (!statePlanOpen(plan.status)) return error('This plan has been sent to UBEC. Its observations are not part of the UBEC review.', 409);
  return plan;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const viewer = observationViewer(user.role, user.department);
    if (!viewer) return error(`Observation requests go to UBEC ${oversightList()}`, 403);
    const planId = planParam(request);
    return await getPostgres().transaction(async db => {
      if (!planId) {
        const plans = (await db.query<PlanRow>(`SELECT ${planFields} FROM action_plans p WHERE ${followed} AND p.status NOT IN ('submitted_ubec','ubec_review','ubec_approved')`, [viewer.department])).rows;
        const items: ObservationPlan[] = [];
        for (const plan of plans) {
          const latest = (await readObservationRequests(db, plan.id)).find(r => !viewer.department || r.departments.some(d => d.department === viewer.department));
          if (latest) items.push({ planId: plan.id, state: stateDisplayName(plan.state_code), period: period(plan), requestedAt: latest.createdAt, requestedByName: latest.requestedByName, departments: latest.departments });
        }
        items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
        return NextResponse.json({ plans: items, department: viewer.department, user: { name: user.name, role: user.role, department: user.department } }, { headers: noStore });
      }
      const plan = await readPlan(db, viewer, planId);
      if (plan instanceof NextResponse) return plan;
      const requests = await readObservationRequests(db, plan.id);
      const snapshot = await withDistributionCoordinates(db, await readPlanSnapshot(db, plan.id));
      const comment = mayObserve(viewer, requests);
      return NextResponse.json({
        plan: { id: plan.id, state: stateDisplayName(plan.state_code), period: period(plan), version: plan.version }, user: { name: user.name, role: user.role, department: user.department },
        snapshot, requests, department: viewer.department, abilities: { comment, sendBack: comment && viewer.director },
      }, { headers: noStore });
    });
  } catch (cause) { console.error('UBEC observations read failed', cause); return error('Unable to load the observation requests', 503); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const parsed = done.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'Invalid request');
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    return await getPostgres().transaction(async db => {
      const actor = (await db.query<{ id: number; full_name: string; email: string; role: string; department: string | null }>('SELECT id,display_name AS full_name,email,role,department FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [session.userId, session.sessionVersion])).rows[0];
      if (!actor) return error('Session expired', 401);
      const viewer = observationViewer(actor.role, actor.department);
      if (!viewer?.director) return error('Only the department’s Oversight Director sends its observations back', 403);
      const plan = await readPlan(db, viewer, planId, true);
      if (plan instanceof NextResponse) return plan;
      const requests = await readObservationRequests(db, plan.id);
      if (!waitingDepartments(requests).includes(viewer.department!)) return error('Your department has already sent its observations back', 409);
      const note = parsed.data.note;
      await db.query('UPDATE plan_observation_departments SET completed_at=NOW(),completed_by=$1,completed_by_name=$2,note=$3 WHERE request_id=$4 AND department=$5', [actor.id, actor.full_name, note, requests[0].id, viewer.department]);
      const count = (await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM plan_comments WHERE plan_id=$1 AND scope='observation' AND observation_department=$2 AND parent_id IS NULL AND resolved_at IS NULL", [plan.id, viewer.department])).rows[0].n;
      const summary = `${observationDepartmentName(viewer.department!)} sent back ${count === 0 ? 'no open observations' : count === 1 ? '1 observation' : `${count} observations`}${note ? `: ${note}` : ''}`;
      const event = (await db.query<{ id: number }>(`INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,'observation_return',$3,$4,$5,$6,'general') RETURNING id`,
        [plan.id, plan.submission_number, actor.full_name, actor.email, actor.role, summary.slice(0, 5000)])).rows[0];
      // The Executive Chairman, who asked, and the state's BEAP Chair hear about it.
      await db.query(`INSERT INTO plan_notifications(plan_id,user_id,event_id) SELECT $1,id,$2 FROM users WHERE active AND state_code=$3 AND (role='Executive Chairman' OR is_beap_chair)`, [plan.id, event.id, plan.state_code]);
      await db.query('UPDATE action_plans SET version=version+1,workflow_updated_at=NOW() WHERE id=$1', [plan.id]);
      return NextResponse.json({ ok: true });
    });
  } catch (cause) { console.error('Observations could not be sent back', cause); return error('The observations could not be sent back. Please try again.', 503); }
}
