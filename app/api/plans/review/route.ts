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
import { activityBudgetProblem, isCapped, lineKobo } from '@/lib/activity-budget';
import { infrastructurePoolProblem, isPoolComponent } from '@/lib/infrastructure-pool';
import { implementedPillars } from '@/lib/beap-pillars';
import { distributionSnapshotKeys, emptyDistributionMessage, hasDistribution } from '@/lib/activity-plans';
import { componentReadinessProblem, hasReadinessRules } from '@/lib/component-readiness';
import { readComponentDocumentsRequired } from '@/lib/component-documents-setting';
import { subebComponentDepartments as pillarDepartments } from '@/lib/beap-pillars';
import { aggregateReviewStatus, readPillarReviews, readyForExecutiveChairman, readyForUbecSubmission, statePlanOpen, type PillarReviewStatus } from '@/lib/pillar-review';
import { readBeapChairSubmissionMode, readWorkflowSettings } from '@/lib/workflow-settings';
import { hasDepartment, userDepartmentsSql } from '@/lib/user-departments';

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
      const { mode: beapChairSubmissionMode, ubecMode: ubecSubmissionMode } = await readWorkflowSettings(db);
      const documentsRequired = await readComponentDocumentsRequired(db);
      const visiblePillars = visibleComponents(workspace);
      const visibleEvents = canViewWholeStatePlan(workspace) ? events : events.filter(event => visiblePillars.includes(event.scope));
      const visibleSubmissions = canViewWholeStatePlan(workspace) ? submissions : submissions.filter(submission => visibleEvents.some(event => event.submissionNumber === submission.number));
      if (requested && !visibleSubmissions.some(submission => submission.number === Number(requested))) return error('Submission not found.', 404);
      return NextResponse.json({ visiblePillars, pillarReviews: pillarReviews.filter(review => visiblePillars.includes(review.pillar)), readyForExecutiveChairman: workspace.isBeapChair && readyForExecutiveChairman(pillarReviews, snapshot, { documentsRequired }), readyForUbec: canViewWholeStatePlan(workspace) && readyForUbecSubmission(ubecSubmissionMode, pillarReviews, snapshot, { documentsRequired }), plan, role: workspace.role, department: workspace.department, departments: workspace.departments, isBeapChair: workspace.isBeapChair, beapChairSubmissionMode, ubecSubmissionMode, documentsRequired, snapshot: visibleSnapshot(snapshot, workspace), selectedSubmission, submissions: visibleSubmissions, events: visibleEvents }, { headers: { 'Cache-Control': 'no-store' } });
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
      const actor = (await db.query(`SELECT role, department, ${userDepartmentsSql('users')} AS departments, is_beap_chair FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE`, [workspace.userId, workspace.sessionVersion])).rows[0];
      if (!actor) return error('You do not have permission for this action.', 403);
      const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id = $1 FOR UPDATE`, [found.id])).rows[0];
      if (plan.version !== input.version) return error('This plan has changed. Refresh before continuing.', 409);
      if (!statePlanOpen(plan.status)) return error('The plan is locked during UBEC review.', 409);
      const reviews = await readPillarReviews(db, plan.id);
      const snapshot = await readPlanSnapshot(db, plan.id);
      const beapChairSubmissionMode = await readBeapChairSubmissionMode(db);
      const readiness = { documentsRequired: await readComponentDocumentsRequired(db) };
      if (input.action === 'forward' && beapChairSubmissionMode === 'complete_plan') {
        if (actor.role !== 'Director' || !actor.is_beap_chair) return error('Only the nominated BEAP Chair can send the plan to the SUBEB Executive Chairman.', 403);
        if (input.pillar) return error('This state sends the complete BEAP to the Executive Chairman at once.', 409);
        if (!readyForExecutiveChairman(reviews,snapshot,readiness)) return error('Every implemented component must reach the BEAP Chair before all components can be sent together to the Executive Chairman.', 409);
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
        if (actor.role !== 'Data Entry Staff' || !hasDepartment(actor.departments, department)) return error('Only assigned Data Entry Staff can send this component to the department Director.', 403);
        if (!['draft','changes_requested'].includes(current.status)) return error('This action is no longer available for this component.', 409);
        status = 'director_review'; recipientLabel = 'department Director';
        recipients = (await db.query("SELECT DISTINCT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND u.active AND u.role='Director' AND NOT u.is_beap_chair AND ud.department=$2", [workspace.stateCode,department])).rows;
      } else if (input.action === 'endorse' && current.status === 'director_review') {
        if (actor.role !== 'Director' || actor.is_beap_chair || !hasDepartment(actor.departments, department)) return error('Only this department’s assigned Director can send the component to the BEAP Chair.', 403);
        status = 'beap_review'; recipientLabel = 'nominated BEAP Chair';
        recipients = (await db.query('SELECT id FROM users WHERE state_code=$1 AND active AND is_beap_chair', [workspace.stateCode])).rows;
      } else if (input.action === 'request_changes' && current.status === 'director_review') {
        if (actor.role !== 'Director' || actor.is_beap_chair || !hasDepartment(actor.departments, department)) return error('Only this department’s assigned Director can return this component to Data Entry Staff.', 403);
        status = 'changes_requested'; recipientLabel = 'department Data Entry Staff';
        recipients = (await db.query("SELECT DISTINCT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND u.active AND u.role='Data Entry Staff' AND ud.department=$2", [workspace.stateCode,department])).rows;
      } else if (input.action === 'request_changes' && current.status === 'beap_review') {
        if (actor.role !== 'Director' || !actor.is_beap_chair) return error('Only the nominated BEAP Chair can return this component to its department Director.', 403);
        status = 'director_review'; recipientLabel = 'department Director';
        recipients = (await db.query("SELECT DISTINCT u.id FROM users u JOIN user_departments ud ON ud.user_id=u.id WHERE u.state_code=$1 AND u.active AND u.role='Director' AND NOT u.is_beap_chair AND ud.department=$2", [workspace.stateCode,department])).rows;
      } else if (input.action === 'request_changes' && current.status === 'chairman_ready') {
        if (actor.role !== 'Executive Chairman') return error('Only the SUBEB Executive Chairman can return this component to the BEAP Chair.', 403);
        status = 'beap_review'; recipientLabel = 'nominated BEAP Chair';
        recipients = (await db.query('SELECT id FROM users WHERE state_code=$1 AND active AND is_beap_chair', [workspace.stateCode])).rows;
      } else if (input.action === 'forward' && current.status === 'beap_review') {
        if (beapChairSubmissionMode !== 'individual_components') return error('This state sends the complete BEAP to the Executive Chairman at once.', 409);
        if (actor.role !== 'Director' || !actor.is_beap_chair) return error('Only the nominated BEAP Chair can send this component to the SUBEB Executive Chairman.', 403);
        status = 'chairman_ready'; recipientLabel = 'SUBEB Executive Chairman';
        recipients = (await db.query("SELECT id FROM users WHERE state_code=$1 AND active AND role='Executive Chairman'", [workspace.stateCode])).rows;
      } else {
        return error('This action is no longer available for this component.', 409);
      }
      // Open cell/row comments travel with a change request, so the general note becomes optional.
      const openComments = input.action === 'request_changes' ? Number((await db.query("SELECT COUNT(*)::int AS n FROM plan_comments WHERE plan_id=$1 AND pillar=$2 AND scope='state' AND parent_id IS NULL AND resolved_at IS NULL", [plan.id,input.pillar])).rows[0].n) : 0;
      if (input.action === 'request_changes' && !input.comment && !openComments) return error('Describe the required changes, or leave comments on specific cells or rows before requesting changes.');
      if (input.action !== 'request_changes' && current.status === 'changes_requested' && !input.comment) return error('Describe the required changes or how the feedback was addressed.');
      const eventComment = input.comment || (openComments ? `${openComments} ${openComments === 1 ? 'comment' : 'comments'} on specific cells` : '');
      if (!recipients.length) return error(`No active ${recipientLabel} is configured for this state.`, 409);
      if(input.action!=='request_changes' && input.pillar==='sbmc') {
        const problem=sbmcBudgetProblem((snapshot.sbmc??[]).reduce((sum,line)=>sum+budgetKobo(line.unit_cost)*BigInt(line.quantity),BigInt(0)),plan,true);
        if(problem)return error(problem);
        if(snapshot.sbmc?.some(line=>!line.rationale?.trim()||!line.implementation_approach?.trim()))return error('Complete the rationale and implementation approach for every SBMC item before sending it.');
      }
      if (input.action !== 'request_changes' && !snapshot[input.pillar]?.length) return error('Add saved entries to this pillar before sending it.');
      if (input.action !== 'request_changes' && input.pillar==='infrastructure') { const problem=infrastructureDocumentProblem(snapshot); if(problem)return error(problem); }
      // TLM, GSCCI and Curriculum: the distribution list needs at least one school at every send step.
      if (input.action !== 'request_changes' && hasDistribution(input.pillar) && !snapshot[distributionSnapshotKeys[input.pillar]]?.length) return error(emptyDistributionMessage(input.pillar));
      // Quality Assurance, ICT and Teacher Development: compulsory activities, line schools, line documents and the Teacher Development split block every send step.
      if (input.action !== 'request_changes' && hasReadinessRules(input.pillar)) { const problem=componentReadinessProblem(input.pillar,snapshot[input.pillar]??[],snapshot.setup,readiness); if(problem)return error(problem,409); }
      // Infrastructure and TLM share one pool: neither is sent while their combined proposals exceed it.
      if (input.action !== 'request_changes' && isPoolComponent(input.pillar)) { const problem=infrastructurePoolProblem(plan,{infrastructure:(snapshot.infrastructure??[]).reduce((sum,item)=>sum+lineKobo(item),BigInt(0)),tlm:(snapshot.tlm??[]).reduce((sum,line)=>sum+lineKobo(line),BigInt(0))}); if(problem)return error(problem,409); }
      if (input.action !== 'request_changes' && (isCapped(input.pillar) || input.pillar === 'sbmc')) { const problem=activityBudgetProblem(input.pillar,(snapshot[input.pillar]??[]).map(line=>({activity:line.activity,kobo:lineKobo(line)})),plan); if(problem)return error(problem); }
      await db.query('INSERT INTO plan_pillar_reviews(plan_id,pillar,status) VALUES($1,$2,$3) ON CONFLICT(plan_id,pillar) DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()', [plan.id,input.pillar,status]);
      const number = plan.submissionNumber + 1;
      await db.query('INSERT INTO plan_submissions(plan_id,number,snapshot) VALUES($1,$2,$3::jsonb)', [plan.id,number,JSON.stringify(snapshot)]);
      const nextStatus = aggregateReviewStatus(reviews.map(r => r.pillar === input.pillar ? {...r,status} : r));
      await db.query('UPDATE action_plans SET status=$1,submission_number=$2,version=version+1,workflow_updated_at=NOW() WHERE id=$3', [nextStatus,number,plan.id]);
      const event = (await db.query('INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [plan.id,number,input.action,workspace.name,workspace.email,actor.role,eventComment,input.pillar])).rows[0];
      for (const recipient of recipients) await db.query('INSERT INTO plan_notifications(plan_id,user_id,event_id) VALUES($1,$2,$3)', [plan.id,recipient.id,event.id]);
      return NextResponse.json({ status: nextStatus });
    });
  } catch (cause) { console.error('Review action failed', cause); return error('Your action could not be saved. Please refresh and try again.', 503); }
}
