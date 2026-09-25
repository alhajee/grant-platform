import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan, planFields } from '@/lib/plan-workspace';
import { type ActionPlan } from '@/lib/action-plans';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { implementedPillars } from '@/lib/beap-pillars';
import { subebComponentDepartments as pillarDepartments } from '@/lib/beap-pillars';
import { aggregateReviewStatus, readPillarReviews, readyForUbec, statePlanOpen, type PillarReviewStatus } from '@/lib/pillar-review';

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.object({ action: z.enum(['submit', 'request_changes', 'endorse']), version: z.number().int().nonnegative(), comment: z.string().trim().max(5000).default(''), pillar: z.enum(implementedPillars) }).strict();
export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to view this review.', 401);
    const found = await resolveActionPlan(request, workspace.stateCode);
    if (!found) return error('Action plan not found.', 404);
    return await getPostgres().transaction(async db => {
      const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id = $1 FOR SHARE`, [found.id])).rows[0];
      const requested = request.nextUrl.searchParams.get('submission');
      if (requested && !/^[1-9]\d*$/.test(requested)) return error('Invalid submission.');
      const selectedSubmission = requested ? Number(requested) : !statePlanOpen(plan.status) ? plan.submissionNumber : null;
      const snapshot = selectedSubmission ? (await db.query('SELECT snapshot FROM plan_submissions WHERE plan_id = $1 AND number = $2', [plan.id, selectedSubmission])).rows[0]?.snapshot : await readPlanSnapshot(db, plan.id);
      if (!snapshot) return error('Submission not found.', 404);
      const submissions = (await db.query('SELECT number, created_at AS "createdAt" FROM plan_submissions WHERE plan_id = $1 ORDER BY number DESC', [plan.id])).rows;
      const events = (await db.query(`SELECT id, action, actor_name AS "actorName", actor_role AS "actorRole", comment, scope, submission_number AS "submissionNumber", created_at AS "createdAt" FROM plan_review_events WHERE plan_id = $1 ORDER BY id DESC`, [plan.id])).rows;
      const pillarReviews = await readPillarReviews(db, plan.id);
      return NextResponse.json({ pillarReviews, readyForUbec: readyForUbec(pillarReviews, snapshot), plan, role: workspace.role, department: workspace.department, snapshot, selectedSubmission, submissions, events }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (cause) { console.error('Review could not be loaded', cause); return error('Unable to load the review. Please try again.', 503); }
}
export async function POST(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to continue.', 401);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose a valid review action and enter no more than 5,000 characters.');
    const input = parsed.data;
    const allowedRoles = input.action === 'submit' ? ['Data Entry Staff'] : input.action === 'endorse' ? ['Director'] : ['Director', 'Executive Chairman'];
    const found = await resolveActionPlan(request, workspace.stateCode);
    if (!found) return error('Action plan not found.', 404);
    return await getPostgres().transaction(async db => {
      const actor = (await db.query('SELECT role, department FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [workspace.userId, workspace.sessionVersion])).rows[0];
      if (!actor || !allowedRoles.includes(actor.role)) return error('You do not have permission for this action.', 403);
      const department = pillarDepartments[input.pillar];
      if (actor.role !== 'Executive Chairman' && actor.department !== department) return error('This pillar belongs to another department.', 403);
      const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id = $1 FOR UPDATE`, [found.id])).rows[0];
      if (plan.version !== input.version) return error('This plan has changed. Refresh before continuing.', 409);
      if (!statePlanOpen(plan.status)) return error('The plan is locked during UBEC review.', 409);
      const reviews = await readPillarReviews(db, plan.id);
      const current = reviews.find(r => r.pillar === input.pillar)!;
      const expected = input.action === 'submit' ? ['draft','changes_requested'] : actor.role === 'Executive Chairman' ? ['chairman_ready'] : ['director_review'];
      if (!expected.includes(current.status)) return error('This action is no longer available for this pillar.', 409);
      if ((input.action === 'request_changes' || current.status === 'changes_requested') && !input.comment) return error('Describe the required changes or how the feedback was addressed.');
      const recipientRole = input.action === 'submit' ? 'Director' : input.action === 'endorse' ? 'Executive Chairman' : actor.role === 'Executive Chairman' ? 'Director' : 'Data Entry Staff';
      const recipients = (await db.query("SELECT id FROM users WHERE state_code=$1 AND active AND role=$2 AND ($2='Executive Chairman' OR department=$3)", [workspace.stateCode,recipientRole,department])).rows;
      if (!recipients.length) return error(`No active ${recipientRole} is assigned to this department/state.`, 409);
      const snapshot = await readPlanSnapshot(db, plan.id);
      if (input.action !== 'request_changes' && !snapshot[input.pillar].length) return error('Add saved entries to this pillar before sending it.');
      const status: PillarReviewStatus = input.action === 'submit' || (input.action === 'request_changes' && actor.role === 'Executive Chairman') ? 'director_review' : input.action === 'endorse' ? 'chairman_ready' : 'changes_requested';
      await db.query('INSERT INTO plan_pillar_reviews(plan_id,pillar,status) VALUES($1,$2,$3) ON CONFLICT(plan_id,pillar) DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()', [plan.id,input.pillar,status]);
      const number = plan.submissionNumber + 1;
      await db.query('INSERT INTO plan_submissions(plan_id,number,snapshot) VALUES($1,$2,$3::jsonb)', [plan.id,number,JSON.stringify(snapshot)]);
      const nextStatus = aggregateReviewStatus(reviews.map(r => r.pillar === input.pillar ? {...r,status} : r));
      await db.query('UPDATE action_plans SET status=$1,submission_number=$2,version=version+1,workflow_updated_at=NOW() WHERE id=$3', [nextStatus,number,plan.id]);
      const event = (await db.query('INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [plan.id,number,input.action,workspace.name,workspace.email,actor.role,input.comment,input.pillar])).rows[0];
      for (const recipient of recipients) await db.query('INSERT INTO plan_notifications(plan_id,user_id,event_id) VALUES($1,$2,$3)', [plan.id,recipient.id,event.id]);
      return NextResponse.json({ status: nextStatus });
    });
  } catch (cause) { console.error('Review action failed', cause); return error('Your action could not be saved. Please refresh and try again.', 503); }
}
