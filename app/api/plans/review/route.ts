import { visibleComponents, visibleSnapshot } from '@/lib/plan-visibility';
import { infrastructureDocumentProblem } from '@/lib/infrastructure-documents';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan, planFields } from '@/lib/plan-workspace';
import { type ActionPlan } from '@/lib/action-plans';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { budgetKobo, sbmcBudgetProblem } from '@/lib/sbmc-budget';
import { implementedPillars } from '@/lib/beap-pillars';
import { subebComponentDepartments as pillarDepartments } from '@/lib/beap-pillars';
import { aggregateReviewStatus, readPillarReviews, readyForExecutiveChairman, readyForUbec, statePlanOpen, type PillarReviewStatus } from '@/lib/pillar-review';

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.object({ action: z.enum(['submit', 'request_changes', 'endorse', 'forward']), version: z.number().int().nonnegative(), comment: z.string().trim().max(5000).default(''), pillar: z.enum(implementedPillars).optional() }).strict();
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
      const visiblePillars = visibleComponents(workspace);
      const visibleEvents = canViewWholeStatePlan(workspace) ? events : events.filter(event => visiblePillars.includes(event.scope));
      const visibleSubmissions = canViewWholeStatePlan(workspace) ? submissions : submissions.filter(submission => visibleEvents.some(event => event.submissionNumber === submission.number));
      if (requested && !visibleSubmissions.some(submission => submission.number === Number(requested))) return error('Submission not found.', 404);
      return NextResponse.json({ visiblePillars, pillarReviews: pillarReviews.filter(review => visiblePillars.includes(review.pillar)), readyForExecutiveChairman: workspace.isBeapChair && readyForExecutiveChairman(pillarReviews, snapshot), readyForUbec: canViewWholeStatePlan(workspace) && readyForUbec(pillarReviews, snapshot), plan, role: workspace.role, department: workspace.department, isBeapChair: workspace.isBeapChair, snapshot: visibleSnapshot(snapshot, workspace), selectedSubmission, submissions: visibleSubmissions, events: visibleEvents }, { headers: { 'Cache-Control': 'no-store' } });
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
    const found = await resolveActionPlan(request, workspace.stateCode);
    if (!found) return error('Action plan not found.', 404);
    return await getPostgres().transaction(async db => {
      const actor = (await db.query('SELECT role, department, is_beap_chair FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [workspace.userId, workspace.sessionVersion])).rows[0];
      if (!actor) return error('You do not have permission for this action.', 403);
      const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id = $1 FOR UPDATE`, [found.id])).rows[0];
      if (plan.version !== input.version) return error('This plan has changed. Refresh before continuing.', 409);
      if (!statePlanOpen(plan.status)) return error('The plan is locked during UBEC review.', 409);
      const reviews = await readPillarReviews(db, plan.id);
      const snapshot = await readPlanSnapshot(db, plan.id);
      if (input.action === 'forward') {
        if (actor.role !== 'Director' || !actor.is_beap_chair) return error('Only the nominated BEAP Chair can send the plan to the SUBEB Executive Chairman.', 403);
        if (!readyForExecutiveChairman(reviews,snapshot)) return error('Every implemented component must be reviewed by its department Director before the BEAP Chair can send the plan onward.', 409);
        const recipients = (await db.query("SELECT id FROM users WHERE state_code=$1 AND active AND role='Executive Chairman'", [workspace.stateCode])).rows;
        if (!recipients.length) return error('No active SUBEB Executive Chairman is configured for this state.',409);
        await db.query("UPDATE plan_pillar_reviews SET status='chairman_ready',updated_at=NOW() WHERE plan_id=$1 AND status='beap_review'",[plan.id]);
        const number=plan.submissionNumber+1;
        await db.query('INSERT INTO plan_submissions(plan_id,number,snapshot) VALUES($1,$2,$3::jsonb)',[plan.id,number,JSON.stringify(snapshot)]);
        await db.query("UPDATE action_plans SET status='awaiting_chairman',submission_number=$1,version=version+1,workflow_updated_at=NOW() WHERE id=$2",[number,plan.id]);
        const event=(await db.query("INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,'forward',$3,$4,$5,$6,'general') RETURNING id",[plan.id,number,workspace.name,workspace.email,actor.role,input.comment])).rows[0];
        for(const recipient of recipients)await db.query('INSERT INTO plan_notifications(plan_id,user_id,event_id) VALUES($1,$2,$3)',[plan.id,recipient.id,event.id]);
        return NextResponse.json({status:'awaiting_chairman'});
      }
      if (!input.pillar) return error('Choose a component for this review action.');
      const department = pillarDepartments[input.pillar];
      const current = reviews.find(r => r.pillar === input.pillar)!;
      let status: PillarReviewStatus;
      let recipientLabel: string;
      let recipients: {id:number}[];
      if (input.action === 'submit') {
        if (actor.role !== 'Data Entry Staff' || actor.department !== department) return error('Only the assigned Data Entry Staff can send this component to the department Director.', 403);
        if (!['draft','changes_requested'].includes(current.status)) return error('This action is no longer available for this component.', 409);
        status = 'director_review'; recipientLabel = 'department Director';
        recipients = (await db.query("SELECT id FROM users WHERE state_code=$1 AND active AND role='Director' AND department=$2", [workspace.stateCode,department])).rows;
      } else if (input.action === 'endorse' && current.status === 'director_review') {
        if (actor.role !== 'Director' || actor.department !== department) return error('Only this department’s Director can send the component to the BEAP Chair.', 403);
        status = 'beap_review'; recipientLabel = 'nominated BEAP Chair';
        recipients = (await db.query('SELECT id FROM users WHERE state_code=$1 AND active AND is_beap_chair', [workspace.stateCode])).rows;
      } else if (input.action === 'request_changes' && current.status === 'director_review') {
        if (actor.role !== 'Director' || actor.department !== department) return error('Only this department’s Director can return this component to Data Entry Staff.', 403);
        status = 'changes_requested'; recipientLabel = 'department Data Entry Staff';
        recipients = (await db.query("SELECT id FROM users WHERE state_code=$1 AND active AND role='Data Entry Staff' AND department=$2", [workspace.stateCode,department])).rows;
      } else if (input.action === 'request_changes' && current.status === 'beap_review') {
        if (actor.role !== 'Director' || !actor.is_beap_chair) return error('Only the nominated BEAP Chair can return this component to its department Director.', 403);
        status = 'director_review'; recipientLabel = 'department Director';
        recipients = (await db.query("SELECT id FROM users WHERE state_code=$1 AND active AND role='Director' AND department=$2", [workspace.stateCode,department])).rows;
      } else if (input.action === 'request_changes' && current.status === 'chairman_ready') {
        if (actor.role !== 'Executive Chairman') return error('Only the SUBEB Executive Chairman can return this component to the BEAP Chair.', 403);
        status = 'beap_review'; recipientLabel = 'nominated BEAP Chair';
        recipients = (await db.query('SELECT id FROM users WHERE state_code=$1 AND active AND is_beap_chair', [workspace.stateCode])).rows;
      } else {
        return error('This action is no longer available for this component.', 409);
      }
      if ((input.action === 'request_changes' || current.status === 'changes_requested') && !input.comment) return error('Describe the required changes or how the feedback was addressed.');
      if (!recipients.length) return error(`No active ${recipientLabel} is configured for this state.`, 409);
      if(input.action!=='request_changes' && input.pillar==='sbmc') {
        const problem=sbmcBudgetProblem((snapshot.sbmc??[]).reduce((sum,line)=>sum+budgetKobo(line.unit_cost)*BigInt(line.quantity),BigInt(0)),plan,true);
        if(problem)return error(problem);
        if(snapshot.sbmc?.some(line=>!line.rationale?.trim()||!line.implementation_approach?.trim()))return error('Complete the rationale and implementation approach for every SBMC item before sending it.');
      }
      if (input.action !== 'request_changes' && !snapshot[input.pillar]?.length) return error('Add saved entries to this pillar before sending it.');
      if (input.action !== 'request_changes' && input.pillar==='infrastructure') { const problem=infrastructureDocumentProblem(snapshot); if(problem)return error(problem); }
      if (input.action !== 'request_changes' && input.pillar==='tlm' && !snapshot.tlmDistribution?.length) return error('Add at least one school to the TLM distribution list before sending it.');
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
