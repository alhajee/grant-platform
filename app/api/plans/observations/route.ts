import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { readPillarReviews, statePlanOpen } from '@/lib/pillar-review';
import { ubecRoles } from '@/lib/ubec';
import { listDepartments, observationDepartmentIds, waitingDepartments } from '@/lib/observation-requests';
import { readObservationRequests, readObservationStatus } from '@/lib/observation-requests-db';

// Observations before sending to UBEC (bug sheet row 156, migration 075). GET ?plan=: the plan's requests and why it cannot
// be sent to UBEC yet, for the Executive Chairman and the BEAP Chair. POST ?plan= { action: 'request', departments, comment,
// version }: the Executive Chairman asks some or all of UBEC Audit, Procurement and Finance for observations on the whole
// plan while it is with them; their Oversight Directors and Assessment Officers and the UBEC BEAP Chair are notified.
// Optional; a new request waits until the last one is answered. The departments reply on /ubec/observations.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? Number(plan) : null; };
const command = z.object({
  action: z.literal('request'), version: z.number().int().nonnegative(),
  departments: z.array(z.enum(observationDepartmentIds as [string, ...string[]])).min(1, 'Choose at least one department').max(3).refine(d => new Set(d).size === d.length, 'Choose each department once'),
  comment: z.string().trim().max(2000, 'Keep the comment to 2,000 characters or fewer').default(''),
}).strict();

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
    const reviews = await readPillarReviews(db, planId);
    const canRequest = user.role === 'Executive Chairman' && statePlanOpen(plan.status) && reviews.some(r => r.status === 'chairman_ready') && !waitingDepartments(status.requests).length;
    return NextResponse.json({ ...status, canRequest }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error('Observation requests read failed', cause); return error('Unable to load the observation requests', 503); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues[0]?.message ?? 'Choose the departments to ask');
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    const input = parsed.data;
    return await getPostgres().transaction(async db => {
      const actor = (await db.query<{ id: number; full_name: string; email: string; role: string; state_code: string }>('SELECT id,full_name,email,role,state_code FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [session.userId, session.sessionVersion])).rows[0];
      if (!actor) return error('Session expired', 401);
      if (actor.role !== 'Executive Chairman') return error('Only the Executive Chairman asks UBEC for observations', 403);
      const plan = (await db.query<{ id: number; status: string; version: number; submission_number: number }>('SELECT id,status,version,submission_number FROM action_plans WHERE id=$1 AND state_code=$2 FOR UPDATE', [planId, actor.state_code])).rows[0];
      if (!plan) return error('Plan not found', 404);
      if (plan.version !== input.version) return error('This plan has changed. Refresh before continuing.', 409);
      if (!statePlanOpen(plan.status)) return error('This plan is already with UBEC', 409);
      if (!(await readPillarReviews(db, plan.id)).some(r => r.status === 'chairman_ready')) return error('Ask for observations once the BEAP Chair has sent the plan to you', 409);
      const waiting = waitingDepartments(await readObservationRequests(db, plan.id));
      if (waiting.length) return error(`UBEC ${listDepartments(waiting)} ${waiting.length === 1 ? 'has' : 'have'} not sent back the last observations yet`, 409);
      // Each department asked needs an Oversight Director to send its observations back, or the plan could never be sent.
      const staffed = new Set((await db.query<{ department: string }>('SELECT DISTINCT department FROM users WHERE role=$1 AND active AND department=ANY($2::text[])', [ubecRoles.oversight, input.departments])).rows.map(r => r.department));
      const missing = input.departments.filter(d => !staffed.has(d));
      if (missing.length) return error(`UBEC ${listDepartments(missing)} ${missing.length === 1 ? 'has' : 'have'} no active Oversight Director to reply. Choose other departments or ask UBEC to set one up.`, 409);
      const departments = observationDepartmentIds.filter(d => input.departments.includes(d));
      const id = (await db.query<{ id: number }>('INSERT INTO plan_observation_requests(plan_id,submission_number,requested_by,requested_by_name,comment) VALUES($1,$2,$3,$4,$5) RETURNING id', [plan.id, plan.submission_number, actor.id, actor.full_name, input.comment])).rows[0].id;
      await db.query('INSERT INTO plan_observation_departments(request_id,department) SELECT $1, unnest($2::text[])', [id, departments]);
      const comment = `Asked UBEC ${listDepartments(departments)} for observations${input.comment ? `: ${input.comment}` : ''}`;
      const event = (await db.query<{ id: number }>(`INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,'observation_request',$3,$4,$5,$6,'general') RETURNING id`,
        [plan.id, plan.submission_number, actor.full_name, actor.email, actor.role, comment.slice(0, 5000)])).rows[0];
      await db.query(`INSERT INTO plan_notifications(plan_id,user_id,event_id) SELECT $1,id,$2 FROM users WHERE active AND ((role=ANY($3::text[]) AND department=ANY($4::text[])) OR role=$5)`,
        [plan.id, event.id, [ubecRoles.oversight, ubecRoles.officer], departments, ubecRoles.chair]);
      await db.query('UPDATE action_plans SET version=version+1,workflow_updated_at=NOW() WHERE id=$1', [plan.id]);
      return NextResponse.json({ id }, { status: 201 });
    });
  } catch (cause) { console.error('Observation request failed', cause); return error('The request could not be sent. Please try again.', 503); }
}
