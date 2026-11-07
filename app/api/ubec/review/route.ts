import { withDistributionCoordinates } from '@/lib/distribution-coordinates';
import { readReadinessOptions } from '@/lib/full-allocation-setting';
import { NextRequest, NextResponse } from 'next/server';
import { readOpenRejections } from '@/lib/ubec-corrections-db';
import { rejectionProblem } from '@/lib/ubec-corrections';
import { canViewWholeStatePlan } from '@/lib/subeb-access';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { activePillars, holdsUbecChair, isUbec, pillarDepartments, ubecChairSql, ubecRoles, type UbecRound, type UbecAssignment } from '@/lib/ubec';
import { stateDisplayName } from '@/lib/state-names';
import type { Snapshot } from '@/lib/plan-review';
import { unfundedInSnapshot } from '@/lib/unfunded-components';
import { aggregateReviewStatus, componentSendProblem, componentsWithExecutiveChairman, readPillarReviews, readyForUbecSubmission, statePlanOpen, ubecSubmissionSnapshot, unreadySentComponents } from '@/lib/pillar-review';
import { readUbecSubmissionMode } from '@/lib/workflow-settings';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { shareCommentIdsSchema } from '@/lib/plan-comments';
import { shareableThreadIds } from '@/lib/ubec-comments';
import { readRatResubmitProblem, readRatReview } from '@/lib/rat-review-db';
import { ratRejectedForApproval } from '@/lib/rat-review';
import { addUbecEvent, approvableComponents, notifyUbec, openOversightCommentCount, oversightCommentsMessage, readActor, readDecisions, readFlow, readRoundComponents, readViewerRounds, releaseRows, ubecVisibleSnapshot, viewerPillars } from '@/lib/ubec-flow-db';
import { componentName, superAdminRole } from '@/lib/ubec-flow';
import { readFinanceSendProblem } from '@/lib/finance-documents-db';
import { subebComponentDepartments, type ImplementedPillar } from "@/lib/beap-pillars";
import { submissionLetterProblem } from '@/lib/submission-letter';
import { attachLetters, readPendingLetters, readRoundLetters } from '@/lib/submission-letter-db';

// Plan-level UBEC steps (docs/ubec-flow.md): the SUBEB Executive Chairman submits; the UBEC BEAP Chair releases the
// round to the departments and finally approves or returns it. Component steps live in app/api/ubec/components.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.object({
  action: z.enum(['submit', 'release', 'return', 'approve']), version: z.number().int().nonnegative(), roundId: z.number().int().positive().optional(),
  comment: z.string().trim().max(5000).default(''), shareCommentIds: shareCommentIdsSchema.optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to view this plan', 401);
    // The Super Admin opens any submitted plan read-only, with the officer assignment controls (migration 056).
    const admin = user.role === superAdminRole, national = isUbec(user.role) || admin;
    if (!national && !canViewWholeStatePlan(user)) return error('Your account can view only its department components', 403);
    const id = request.nextUrl.searchParams.get('plan');
    if (!id || !/^[1-9]\d{0,9}$/.test(id)) return error('Choose a valid plan');
    return await getPostgres().transaction(async db => {
      const plan = (await db.query('SELECT id,state_code,start_year,end_year,funding_quarters,status,version FROM action_plans WHERE id=$1 FOR SHARE', [id])).rows[0];
      if (!plan || (!national && plan.state_code !== user.stateCode)) return error('Plan not found', 404);
      const viewer = { id: user.userId, role: user.role, department: user.department, chair: holdsUbecChair(user) };
      const allRounds = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC', [id])).rows;
      const rounds = national && !admin ? await readViewerRounds(db, id, viewer) : allRounds;
      if (national && !rounds.length) return error('No assigned submission found', 404);
      const selected = request.nextUrl.searchParams.get('round');
      const round = selected ? rounds.find(r => String(r.id) === selected) : rounds[0];
      if (selected && !round) return error('Submission not found', 404);
      const latest = !!round && allRounds[0]?.id === round.id;
      // State users see the earlier-flow department feedback only once UBEC has decided.
      let assignments: UbecAssignment[] = [];
      let snapshot: Snapshot | null = null, flow = null, pillars: ImplementedPillar[] = [];
      if (round) {
        pillars = national ? await viewerPillars(db, round, viewer) : activePillars(round.snapshot);
        assignments = (await db.query<UbecAssignment>('SELECT * FROM ubec_assignments WHERE round_id=$1 AND pillar=ANY($2::text[]) ORDER BY pillar,department', [round.id, pillars])).rows;
        if (!national && !['returned', 'approved'].includes(round.status)) assignments = [];
        snapshot = await withDistributionCoordinates(db, national ? ubecVisibleSnapshot(round.snapshot, pillars) : round.snapshot);
        if (national) flow = await readFlow(db, round, latest, viewer, pillars);
      }
      const events = round ? (await db.query(`SELECT id,action,actor,comment,created_at,pillar FROM ubec_events WHERE round_id=$1 ${national ? '' : "AND action IN ('submit','return','approve')"} AND (pillar IS NULL OR pillar=ANY($2::text[])) ORDER BY id DESC`, [round.id, pillars])).rows : [];
      const ubecMode = await readUbecSubmissionMode(db);
      const reviews = user.role === 'Executive Chairman' ? await readPillarReviews(db, plan.id) : [];
      const canSubmit = user.role === 'Executive Chairman' && (!allRounds[0] || allRounds[0].status === 'returned') && (ubecMode === 'reviewed_components' ? statePlanOpen(plan.status) : plan.status === 'awaiting_chairman') && readyForUbecSubmission(ubecMode, reviews, await readPlanSnapshot(db, plan.id), await readReadinessOptions(db))
        && !Object.keys(await readOpenRejections(db, plan.id, await readPlanSnapshot(db, plan.id))).some(p => componentsWithExecutiveChairman(reviews).includes(p as ImplementedPillar));
      const setup = round?.snapshot.setup;
      const fundingTotal = setup?.fundingTotal != null ? Number(setup.fundingTotal) : null;
      return NextResponse.json({
        canSubmit, ubecMode, plan: { ...plan, stateName: stateDisplayName(plan.state_code) }, user: { name: user.name, role: user.role, department: user.department, chair: viewer.chair }, role: user.role, department: user.department, chair: viewer.chair,
        rounds: rounds.map(r => ({ id: r.id, plan_id: r.plan_id, number: r.number, state_submission: r.state_submission, status: r.status, submitted_at: r.submitted_at, decision: r.decision, decided_at: r.decided_at, released_at: r.released_at })),
        round: round ? { ...round, snapshot } : null, assignments, flow, events, fundingTotal,
        // UBEC132: the Executive Chairman's signature and cover letter sent with this round.
        submissionLetters: round ? await readRoundLetters(db, round.id) : [],
      }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (cause) { console.error(cause); return error('Unable to load the UBEC review', 503); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Invalid review request');
    const input = parsed.data, id = request.nextUrl.searchParams.get('plan');
    if (input.shareCommentIds && input.action !== 'return') return error('Comments can only be shared with the SUBEB when returning the plan');
    if (!id || !/^[1-9]\d{0,9}$/.test(id)) return error('Choose a valid plan');
    return await getPostgres().transaction(async db => {
      const user = await readActor(db, session);
      if (!user) return error('Session expired', 401);
      // UBEC241: the chair steps are taken by the UBEC BEAP Chair or a Director holding the chair duty.
      if (input.action === 'submit' ? user.role !== 'Executive Chairman' : !user.chair) return error(user.role === ubecRoles.es ? 'The UBEC Executive Secretary oversees the review and does not take workflow actions' : 'You do not have permission for this action', 403);
      const userState = (await db.query<{ state_code: string }>('SELECT state_code FROM users WHERE id=$1', [user.id])).rows[0].state_code;
      const plan = (await db.query('SELECT * FROM action_plans WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!plan || (input.action === 'submit' && plan.state_code !== userState)) return error('Plan not found', 404);
      if (plan.version !== input.version) return error('This review has changed. Refresh before continuing.', 409);
      let round = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1 FOR UPDATE', [id])).rows[0];
      let status = plan.status;
      if (input.action === 'submit') {
        const ubecMode = await readUbecSubmissionMode(db);
        const partial = ubecMode === 'reviewed_components';
        if (partial ? !statePlanOpen(plan.status) : plan.status !== 'awaiting_chairman') return error(partial ? 'This plan is already with UBEC.' : 'The nominated BEAP Chair must send every implemented component to the SUBEB Executive Chairman first', 409);
        if (!(await db.query(`SELECT id FROM users WHERE active AND ${ubecChairSql()} LIMIT 1`)).rowCount) return error('A UBEC BEAP Chair account must be configured first', 409);
        if (round && round.status !== 'returned') return error('This plan has already been submitted', 409);
        if (round && !input.comment) return error('Describe how the UBEC feedback was addressed');
        const snapshot: Snapshot = await readPlanSnapshot(db, plan.id);
        const reviews = await readPillarReviews(db, plan.id);
        const readiness = await readReadinessOptions(db);
        const unready = unreadySentComponents(snapshot, reviews, readiness)[0];
        if (unready) return error(componentSendProblem(unready, snapshot, readiness)!, 409);
        // UBEC217: the three Finance documents must be uploaded first (observation requests no longer hold the send).
        const finance = await readFinanceSendProblem(db, plan.id);
        if (finance) return error(finance, 409);
        // UBEC205: a RAT tool UBEC rejected must be replaced first.
        const rat = await readRatResubmitProblem(db, plan.id);
        if (rat) return error(rat, 409);
        // UBEC189: the components going to UBEC must have every rejected item of the returned round changed or removed.
        { const open = await readOpenRejections(db, plan.id, snapshot); const sent = componentsWithExecutiveChairman(reviews); const problem = sent.map(p => rejectionProblem(componentName(p), open[p])).find(Boolean); if (problem) return error(problem, 409); }
        if (!readyForUbecSubmission(ubecMode, reviews, snapshot, readiness)) return error(partial ? 'At least one component must reach the Executive Chairman before sending to UBEC.' : 'Complete every implemented component and obtain the Director, BEAP Chair and Executive Chairman reviews before sending to UBEC.', 409);
        // UBEC132: the Executive Chairman signs and attaches a cover letter to every submission.
        { const problem = submissionLetterProblem(await readPendingLetters(db, plan.id)); if (problem) return error(problem, 409); }
        round = (await db.query<UbecRound>('INSERT INTO ubec_rounds(plan_id,number,state_submission,snapshot,submitted_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *', [id, (round?.number ?? 0) + 1, plan.submission_number, JSON.stringify(ubecSubmissionSnapshot(snapshot, reviews)), user.id])).rows[0];
        await attachLetters(db, plan.id, round.id);
        status = 'submitted_ubec';
      } else {
        if (!round || round.id !== input.roundId || !['received', 'reviewing'].includes(round.status)) return error('This submission is no longer open for review', 409);
        if (input.action === 'release') {
          if (round.status !== 'received') return error('This submission has already been released to the departments', 409);
          if (!input.comment) return error('Enter your comment before releasing the plan to the UBEC departments');
          const rows = releaseRows(round.snapshot);
          if (!rows.length) return error('This submission has no components to review', 409);
          // The components go to their Directors, who assign the officers (the Admin defaults are pre-ticked for them).
          for (const row of rows) await db.query('INSERT INTO ubec_round_components(round_id,pillar,department) VALUES($1,$2,$3)', [round.id, row.pillar, row.department]);
          await db.query("UPDATE ubec_rounds SET status='reviewing',released_at=NOW(),released_by_name=$1,release_comment=$2 WHERE id=$3", [user.full_name, input.comment, round.id]);
          status = 'ubec_review';
        } else {
          if (round.status !== 'reviewing') return error('Release the plan to the UBEC departments first', 409);
          if (!input.comment) return error('Enter the decision and consolidated feedback');
          const decisions = await readDecisions(db, round.id);
          const components = await readRoundComponents(db, round, decisions);
          const waiting = components.filter(c => c.stage !== 'chair');
          if (!components.length || waiting.length) return error(`Every component must finish department assessment and oversight first (${waiting.length} still in progress)`, 409);
          if (input.action === 'approve' && !approvableComponents(components)) return error('The plan cannot be approved while items are rejected. Return it to the SUBEB instead.', 409);
          // Audit, Procurement and Finance comments must be resolved first (UBEC56, migration 071).
          const oversightOpen = input.action === 'approve' ? await openOversightCommentCount(db, round.id) : 0;
          if (oversightOpen) return error(oversightCommentsMessage(oversightOpen), 409);
          if (input.action === 'approve' && (await readRatReview(db, round.id))?.decision === 'reject') return error(ratRejectedForApproval, 409);
          // Only the UBEC threads ticked on return reach the state; approval never shares any.
          const share = input.shareCommentIds ?? [];
          if (share.length) {
            const open = await shareableThreadIds(db, plan.id, round);
            if (share.some(commentId => !open.has(commentId))) return error('Some selected comments are no longer open on this submission. Refresh and try again.');
            await db.query('UPDATE plan_comments SET shared_at=NOW(), shared_by_name=$1 WHERE id=ANY($2::bigint[])', [user.full_name, share]);
          }
          await db.query('UPDATE ubec_rounds SET status=$1,decision=$2,decided_at=NOW() WHERE id=$3', [input.action === 'approve' ? 'approved' : 'returned', input.comment, round.id]);
          status = 'ubec_approved';
          // A return: components with items UBEC rejected go straight back to Data Entry ("Changes requested"), who
          // correct them and send them up the chain again (UBEC203, the Directors and Data Entry saw the rejections but
          // could not correct them while the components sat with the BEAP Chair); the rest go to the SUBEB BEAP Chair.
          const rejectedPillars = input.action === 'return' ? [...new Set(decisions.filter(d => d.decision === 'reject').map(d => d.pillar))].filter(p => components.some(c => c.pillar === p)) : [];
          if (input.action === 'return') {
            const rest = components.map(c => c.pillar).filter(p => !rejectedPillars.includes(p));
            await db.query("UPDATE plan_pillar_reviews SET status='beap_review',updated_at=NOW() WHERE plan_id=$1 AND pillar=ANY($2::text[])", [id, rest]);
            await db.query("UPDATE plan_pillar_reviews SET status='changes_requested',updated_at=NOW() WHERE plan_id=$1 AND pillar=ANY($2::text[])", [id, rejectedPillars]);
            status = aggregateReviewStatus(await readPillarReviews(db, Number(id)), unfundedInSnapshot(await readPlanSnapshot(db, Number(id))));
          }
          const event = (await db.query(`INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,$3,$4,$5,$6,$7,'general') RETURNING id`, [id, plan.submission_number, input.action === 'return' ? 'request_changes' : 'approve', user.full_name, user.email, user.chair ? ubecRoles.chair : user.role, input.comment])).rows[0];
          // The SUBEB hears about it: the BEAP Chair and the Executive Chairman, who sent it; a return also reaches the
          // Directors and Data Entry staff of the components with rejected items, an approval those of every component.
          // Whole departments and single-component grants ("academic/sports", lib/component-access.ts).
          const notified = input.action === 'approve' ? components.map(c => c.pillar) : rejectedPillars;
          const stateDepartments = [...new Set(notified.flatMap(p => [subebComponentDepartments[p], `${subebComponentDepartments[p]}/${p}`]))];
          await db.query(`INSERT INTO plan_notifications(plan_id,user_id,event_id) SELECT $1,u.id,$2 FROM users u WHERE u.state_code=$3 AND u.active AND (u.role='Executive Chairman' OR u.is_beap_chair
            OR (u.role IN ('Director','Data Entry Staff') AND (u.department=ANY($4::text[]) OR EXISTS(SELECT 1 FROM user_departments ud WHERE ud.user_id=u.id AND ud.department=ANY($4::text[])))))`, [id, event.id, plan.state_code, stateDepartments]);
        }
      }
      await db.query('UPDATE action_plans SET status=$1,version=version+1,workflow_updated_at=NOW() WHERE id=$2', [status, id]);
      const ubecEvent = await addUbecEvent(db, { roundId: round.id, planId: id, action: input.action, actor: user, comment: input.comment });
      if (input.action === 'submit') await notifyUbec(db, id, ubecEvent, user.id, { role: ubecRoles.chair }, { role: ubecRoles.es });
      if (input.action === 'release') await notifyUbec(db, id, ubecEvent, user.id, { role: ubecRoles.director, departments: [...new Set(releaseRows(round.snapshot).map(r => pillarDepartments[r.pillar]))] }, { role: ubecRoles.es }, { role: ubecRoles.chair });
      if (input.action === 'return' || input.action === 'approve') {
        const people = (await db.query<{ id: number }>(`SELECT DISTINCT oa.officer_id AS id FROM ubec_officer_assignments oa JOIN ubec_round_components rc ON rc.id=oa.round_component_id WHERE rc.round_id=$1 AND oa.removed_at IS NULL`, [round.id])).rows.map(r => r.id);
        const departments = (await db.query<{ department: string }>('SELECT DISTINCT department FROM ubec_round_components WHERE round_id=$1', [round.id])).rows.map(r => r.department);
        // UBEC242: the other BEAP Chair (when there are two) hears of the decision too; the actor never does.
        await notifyUbec(db, id, ubecEvent, user.id, { role: ubecRoles.es }, { role: ubecRoles.director, departments }, { userIds: people }, { role: ubecRoles.chair });
      }
      return NextResponse.json({ status });
    });
  } catch (cause) { console.error(cause); return error('Unable to save this action. Refresh and try again.', 503); }
}
