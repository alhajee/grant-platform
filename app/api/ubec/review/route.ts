import { NextRequest, NextResponse } from 'next/server';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { activePillars, departments, isUbec, type UbecRound, type UbecAssignment } from '@/lib/ubec';
import { stateDisplayName } from '@/lib/state-names';
import type { Snapshot } from '@/lib/plan-review';
import { readPillarReviews, readyForUbecSubmission, statePlanOpen, ubecSubmissionSnapshot, unreadySentComponents } from '@/lib/pillar-review';
import { componentReadinessProblem } from '@/lib/component-readiness';
import { readComponentDocumentsRequired } from '@/lib/component-documents-setting';
import { readUbecSubmissionMode } from '@/lib/workflow-settings';
import { implementedPillars } from '@/lib/beap-pillars';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { shareCommentIdsSchema } from '@/lib/plan-comments';
import { shareableThreadIds } from '@/lib/ubec-comments';
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.object({ action: z.enum(['submit','assign','feedback','return','approve']), version: z.number().int().nonnegative(), roundId: z.number().int().positive().optional(), comment: z.string().trim().max(5000).default(''), assignments: z.array(z.object({ pillar: z.enum(implementedPillars), department: z.string() }).strict()).max(implementedPillars.length * departments.length).optional(), assignmentId: z.number().int().positive().optional(), recommendation: z.enum(['endorse','changes']).optional(), shareCommentIds: shareCommentIdsSchema.optional() }).strict();

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to view this plan.', 401);
    if (!isUbec(user.role) && !canViewWholeStatePlan(user)) return error('Your account can view only its department components.', 403);
    const id = request.nextUrl.searchParams.get('plan');
    if (!id || !/^[1-9]\d*$/.test(id)) return error('Choose a valid plan.');
    return await getPostgres().transaction(async db => {
      const plan = (await db.query('SELECT id,state_code,start_year,end_year,funding_quarters,status,version FROM action_plans WHERE id=$1 FOR SHARE', [id])).rows[0];
      if (!plan || (!isUbec(user.role) && plan.state_code !== user.stateCode)) return error('Plan not found.', 404);
      const national = isUbec(user.role), reviewer = user.role === 'UBEC Department Reviewer';
      const rounds = (await db.query<UbecRound>(`SELECT r.* FROM ubec_rounds r WHERE plan_id=$1 ${reviewer ? 'AND EXISTS (SELECT 1 FROM ubec_assignments a WHERE a.round_id=r.id AND a.department=$2)' : ''} ORDER BY number DESC`, reviewer ? [id, user.department] : [id])).rows;
      if (national && !rounds.length) return error('No assigned submission found.', 404);
      const selected = request.nextUrl.searchParams.get('round');
      const round = selected ? rounds.find(r => String(r.id) === selected) : rounds[0];
      if (selected && !round) return error('Submission not found.', 404);
      let assignments: UbecAssignment[] = [];
      if (round) assignments = (await db.query<UbecAssignment>(`SELECT * FROM ubec_assignments WHERE round_id=$1 ${reviewer ? 'AND department=$2' : ''} ORDER BY pillar,department`, reviewer ? [round.id, user.department] : [round.id])).rows;
      if (!national && round && !['returned','approved'].includes(round.status)) assignments = [];
      const snapshot = round ? reviewer ? { setup: round.snapshot.setup, infrastructureDocuments: assignments.some(a=>a.pillar==='infrastructure') ? round.snapshot.infrastructureDocuments : undefined, infrastructure: assignments.some(a => a.pillar === 'infrastructure') ? round.snapshot.infrastructure : [], sports: assignments.some(a => a.pillar === 'sports') ? round.snapshot.sports : [], sbmc: assignments.some(a=>a.pillar==='sbmc') ? round.snapshot.sbmc ?? [] : [], tlm: assignments.some(a=>a.pillar==='tlm') ? round.snapshot.tlm ?? [] : [], tlmDistribution: assignments.some(a=>a.pillar==='tlm') ? round.snapshot.tlmDistribution ?? [] : [], monitoring: assignments.some(a=>a.pillar==='monitoring') ? round.snapshot.monitoring ?? [] : [], gscci: assignments.some(a=>a.pillar==='gscci') ? round.snapshot.gscci ?? [] : [], gscciDistribution: assignments.some(a=>a.pillar==='gscci') ? round.snapshot.gscciDistribution ?? [] : [], curriculum: assignments.some(a=>a.pillar==='curriculum') ? round.snapshot.curriculum ?? [] : [], curriculumDistribution: assignments.some(a=>a.pillar==='curriculum') ? round.snapshot.curriculumDistribution ?? [] : [], quality: assignments.some(a=>a.pillar==='quality') ? round.snapshot.quality ?? [] : [], teachers: assignments.some(a=>a.pillar==='teachers') ? round.snapshot.teachers ?? [] : [], ict: assignments.some(a=>a.pillar==='ict') ? round.snapshot.ict ?? [] : [], planning: assignments.some(a=>a.pillar==='planning') ? round.snapshot.planning ?? [] : [], componentDocuments: (round.snapshot.componentDocuments ?? []).filter(d=>assignments.some(a=>a.pillar===d.component)) } : round.snapshot : null;
      const events = round ? (await db.query(`SELECT id,action,actor,comment,created_at FROM ubec_events WHERE round_id=$1 ${reviewer ? 'AND (actor_id=$2 OR action=\'assign\')' : !national ? "AND action IN ('submit','return','approve')" : ''} ORDER BY id DESC`, reviewer ? [round.id, user.userId] : [round.id])).rows : [];
      const ubecMode = await readUbecSubmissionMode(db);
      const reviews = user.role === 'Executive Chairman' ? await readPillarReviews(db, plan.id) : [];
      const canSubmit = user.role === 'Executive Chairman' && (!rounds[0] || rounds[0].status === 'returned') && (ubecMode === 'reviewed_components' ? statePlanOpen(plan.status) : plan.status === 'awaiting_chairman') && readyForUbecSubmission(ubecMode, reviews, await readPlanSnapshot(db, plan.id), { documentsRequired: await readComponentDocumentsRequired(db) });
      return NextResponse.json({ canSubmit, ubecMode, plan: { ...plan, stateName: stateDisplayName(plan.state_code) }, user: { name: user.name, role: user.role }, role: user.role, department: user.department, rounds: rounds.map(r => ({ id: r.id, plan_id: r.plan_id, number: r.number, state_submission: r.state_submission, status: r.status, submitted_at: r.submitted_at, decision: r.decision, decided_at: r.decided_at })), round: round ? { ...round, snapshot } : null, assignments, events }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (cause) { console.error(cause); return error('Unable to load the UBEC review.', 503); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue.', 401);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Invalid review request.');
    const input = parsed.data, id = request.nextUrl.searchParams.get('plan');
    if (input.shareCommentIds && input.action !== 'return') return error('Comments can only be shared with the SUBEB when returning the plan.');
    if (!id || !/^[1-9]\d*$/.test(id)) return error('Choose a valid plan.');
    return await getPostgres().transaction(async db => {
      const user = (await db.query('SELECT id,role,department,state_code,full_name,email FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [session.userId, session.sessionVersion])).rows[0];
      if (!user) return error('Session expired.', 401);
      const expectedRole = input.action === 'submit' ? 'Executive Chairman' : input.action === 'feedback' ? 'UBEC Department Reviewer' : 'UBEC Executive Secretary';
      if (user.role !== expectedRole) return error('You do not have permission for this action.', 403);
      const plan = (await db.query('SELECT * FROM action_plans WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!plan || (input.action === 'submit' && plan.state_code !== user.state_code)) return error('Plan not found.', 404);
      if (plan.version !== input.version) return error('This review has changed. Refresh before continuing.', 409);
      let round = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [id])).rows[0];
      let status = plan.status;
      if (input.action === 'submit') {
        const ubecMode = await readUbecSubmissionMode(db);
        const partial = ubecMode === 'reviewed_components';
        if (partial ? !statePlanOpen(plan.status) : plan.status !== 'awaiting_chairman') return error(partial ? 'This plan is already with UBEC.' : 'The nominated BEAP Chair must send every implemented component to the SUBEB Executive Chairman first.', 409);
        if (!(await db.query("SELECT id FROM users WHERE role='UBEC Executive Secretary' AND active LIMIT 1")).rowCount) return error('A UBEC ES account must be configured first.', 409);
        if (round && round.status !== 'returned') return error('This plan has already been submitted.', 409);
        if (round && !input.comment) return error('Describe how the UBEC feedback was addressed.');
        const snapshot: Snapshot = await readPlanSnapshot(db, plan.id);
        const reviews = await readPillarReviews(db, plan.id);
        const readiness = { documentsRequired: await readComponentDocumentsRequired(db) };
        const unready = unreadySentComponents(snapshot, reviews, readiness)[0];
        if (unready) return error(componentReadinessProblem(unready, snapshot[unready] ?? [], snapshot.setup, readiness)!, 409);
        if (!readyForUbecSubmission(ubecMode, reviews, snapshot, readiness)) return error(partial ? 'At least one component must reach the Executive Chairman before sending to UBEC.' : 'Complete every implemented component and obtain the Director, BEAP Chair and Executive Chairman reviews before sending to UBEC.', 409);
        round = (await db.query<UbecRound>('INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,submitted_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *', [id, (round?.number ?? 0) + 1, plan.submission_number, JSON.stringify(ubecSubmissionSnapshot(snapshot, reviews)), user.id])).rows[0];
        status = 'submitted_ubec';
      } else {
        if (!round || round.id !== input.roundId || !['received','reviewing'].includes(round.status)) return error('This submission is no longer open for review.', 409);
        const assignments = (await db.query<UbecAssignment>('SELECT * FROM ubec_assignments WHERE round_id=$1', [round.id])).rows;
        if (input.action === 'assign') {
          if (!input.assignments?.length) return error('Choose at least one department.');
          const pillars = activePillars(round.snapshot);
          if (input.assignments.some(a => !pillars.includes(a.pillar) || !departments.some(d => d.id === a.department))) return error('Choose valid departments and populated pillars.');
          if (pillars.some(p => ![...assignments, ...input.assignments!].some(a => a.pillar === p))) return error('Assign every populated pillar to a department.');
          for (const assignment of input.assignments) {
            if (!(await db.query("SELECT id FROM users WHERE role='UBEC Department Reviewer' AND department=$1 LIMIT 1", [assignment.department])).rowCount) return error(`No reviewer account is configured for ${departments.find(d => d.id === assignment.department)?.name}.`, 409);
          }
          for (const assignment of input.assignments) await db.query('INSERT INTO ubec_assignments(round_id,pillar,department) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [round.id, assignment.pillar, assignment.department]);
          await db.query("UPDATE ubec_rounds SET status='reviewing' WHERE id=$1", [round.id]); status = 'ubec_review';
        } else if (input.action === 'feedback') {
          const assignment = assignments.find(a => a.id === input.assignmentId && a.department === user.department);
          if (!assignment) return error('This pillar is not assigned to your department.', 403);
          if (assignment.completed_at) return error('This review has already been submitted.', 409);
          if (!input.comment || !input.recommendation) return error('Enter feedback and a recommendation.');
          await db.query('UPDATE ubec_assignments SET feedback=$1,recommendation=$2,reviewer=$3,completed_at=NOW() WHERE id=$4', [input.comment, input.recommendation, user.full_name, assignment.id]);
        } else {
          if (!input.comment) return error('Enter the decision and consolidated feedback.');
          if (input.action === 'approve' && (activePillars(round.snapshot).some(p => !assignments.some(a => a.pillar === p)) || assignments.some(a => !a.completed_at))) return error('All assigned departments must finish reviewing before approval.', 409);
          // Only the UBEC threads the ES ticked on return reach the state; approval never shares any.
          const share = input.shareCommentIds ?? [];
          if (share.length) {
            const open = await shareableThreadIds(db, plan.id, round);
            if (share.some(commentId => !open.has(commentId))) return error('Some selected comments are no longer open on this submission. Refresh and try again.');
            await db.query('UPDATE plan_comments SET shared_at=NOW(), shared_by_name=$1 WHERE id=ANY($2::bigint[])', [user.full_name, share]);
          }
          await db.query('UPDATE ubec_rounds SET status=$1,decision=$2,decided_at=NOW() WHERE id=$3', [input.action === 'approve' ? 'approved' : 'returned', input.comment, round.id]);
          status = input.action === 'approve' ? 'ubec_approved' : 'changes_requested';
          if (input.action === 'return') await db.query("UPDATE plan_pillar_reviews SET status='changes_requested',updated_at=NOW() WHERE plan_id=$1", [id]);
          // Publish only the ES decision to the state workflow, never draft departmental feedback.
          const event = (await db.query(`INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,$3,$4,$5,$6,$7,'general') RETURNING id`, [id, plan.submission_number, input.action === 'return' ? 'request_changes' : 'approve', user.full_name, user.email, user.role, input.comment])).rows[0];
          await db.query("INSERT INTO plan_notifications(plan_id,user_id,event_id) SELECT $1,id,$2 FROM users WHERE state_code=$3 AND active AND role IN ('Executive Chairman','Director','Data Entry Staff')", [id, event.id, plan.state_code]);
        }
      }
      await db.query('UPDATE action_plans SET status=$1,version=version+1,workflow_updated_at=NOW() WHERE id=$2', [status, id]);
      const ubecEvent = (await db.query('INSERT INTO ubec_events(round_id,plan_id,action,actor,actor_id,comment) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [round.id, id, input.action, user.full_name, user.id, input.action === 'assign' ? input.assignments!.map(a => `${a.pillar}: ${a.department}`).join('; ') : input.comment])).rows[0];
      // Bell notifications for national users: the ES hears about submissions and finished department reviews, reviewers about new assignments.
      if (input.action === 'submit' || input.action === 'feedback') await db.query("INSERT INTO plan_notifications(plan_id,user_id,ubec_event_id) SELECT $1,id,$2 FROM users WHERE active AND role='UBEC Executive Secretary' ON CONFLICT DO NOTHING", [id, ubecEvent.id]);
      if (input.action === 'assign') await db.query("INSERT INTO plan_notifications(plan_id,user_id,ubec_event_id) SELECT $1,id,$2 FROM users WHERE active AND role='UBEC Department Reviewer' AND department=ANY($3::text[]) ON CONFLICT DO NOTHING", [id, ubecEvent.id, [...new Set(input.assignments!.map(a => a.department))]]);
      return NextResponse.json({ status });
    });
  } catch (cause) { console.error(cause); return error('Unable to save this action. Refresh and try again.', 503); }
}
