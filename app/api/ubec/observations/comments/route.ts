import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { statePlanOpen } from '@/lib/pillar-review';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { implementedPillars } from '@/lib/beap-pillars';
import { commentColumns, createCommentSchema, sheetPillar, sheetRows, targetLabel, ubecAbilities, updateCommentSchema } from '@/lib/plan-comments';
import { commentFields, toThreads, type CommentRow, type Db } from '@/lib/ubec-comments';
import { mayObserve, observationViewer, type ObservationViewer } from '@/lib/observation-requests';
import { readObservationRequests } from '@/lib/observation-requests-db';

// Observation comments (bug sheet row 156, migration 075): plan_comments scope 'observation' on the SUBEB's working plan,
// tagged with the UBEC department that wrote them. Each department reads its own threads (the UBEC BEAP Chair reads them
// all); the Oversight Director and Assessment Officers of a department asked on the latest request (and not yet sent back) start,
// reply to, resolve and reopen their own department's threads. The SUBEB sees a department's threads once it sends them
// back (app/api/plans/comments) and replies; only the department resolves them (UBEC193), so after sending back it may
// still reply and resolve while the plan is with the SUBEB. The formal UBEC review (app/api/ubec/comments) never shows them.
type Actor = { id: number; role: string; department: string | null; full_name: string };
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? Number(plan) : null; };
const followed = `EXISTS (SELECT 1 FROM plan_observation_requests r JOIN plan_observation_departments d ON d.request_id=r.id WHERE r.plan_id=p.id AND ($2::text IS NULL OR d.department=$2))`;

async function readPlan(db: Db, viewer: ObservationViewer, planId: number) {
  return (await db.query<{ id: number; status: string; submission_number: number }>(`SELECT p.id,p.status,p.submission_number FROM action_plans p WHERE p.id=$1 AND ${followed} FOR SHARE OF p`, [planId, viewer.department])).rows[0];
}

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to view comments', 401);
    const viewer = observationViewer(user.role, user.department), planId = planParam(request);
    if (!viewer) return error('Observation requests go to UBEC Audit, Procurement and Finance', 403);
    if (!planId) return error('Choose a valid plan');
    return await getPostgres().transaction(async db => {
      const plan = await readPlan(db, viewer, planId);
      if (!plan) return error('Plan not found', 404);
      if (!statePlanOpen(plan.status)) return error('This plan has been sent to UBEC. Its observations are not part of the UBEC review.', 409);
      const rows = (await db.query<CommentRow>(`SELECT ${commentFields()} FROM plan_comments c WHERE c.plan_id=$1 AND c.scope='observation' AND ($2::text IS NULL OR c.observation_department=$2) ORDER BY c.id`, [plan.id, viewer.department])).rows;
      const open = mayObserve(viewer, await readObservationRequests(db, plan.id));
      // After sending back, the department still replies to the SUBEB and resolves its threads (UBEC193).
      const answer = !viewer.chair;
      const abilities = Object.fromEntries(implementedPillars.map(p => [p, { ...ubecAbilities(true, open, user.role), reply: open || answer, resolveAny: open || answer }]));
      return NextResponse.json({ threads: toThreads(rows, user.userId, await readPlanSnapshot(db, plan.id)), locked: !open, abilities, scope: 'observation' }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (cause) { console.error('Observation comments could not be loaded', cause); return error('Unable to load comments. Please try again.', 503); }
}

/**
 * Writes: same origin, a current account of a department the latest request is waiting on, plan still with the SUBEB.
 * `answer` (replies and resolving) is also open to a department that has already sent its observations back.
 */
async function withOpenRequest(request: NextRequest, run: (db: Db, context: { plan: { id: number; submission_number: number }; actor: Actor; department: string }) => Promise<NextResponse>, { answer = false } = {}) {
  const session = await getWorkspaceState(request);
  if (!session) return error('Sign in to continue', 401);
  if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
  const planId = planParam(request);
  if (!planId) return error('Choose a valid plan');
  return getPostgres().transaction(async db => {
    const actor = (await db.query<Actor>('SELECT id, role, department, display_name AS full_name FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [session.userId, session.sessionVersion])).rows[0];
    const viewer = actor && observationViewer(actor.role, actor.department);
    if (!viewer) return error('Observation requests go to UBEC Audit, Procurement and Finance', 403);
    const plan = await readPlan(db, viewer, planId);
    if (!plan) return error('Plan not found', 404);
    if (!statePlanOpen(plan.status)) return error('This plan has been sent to UBEC, so its observations are read-only', 409);
    if (viewer.chair) return error('The UBEC BEAP Chair follows observations read-only', 403);
    if (!answer && !mayObserve(viewer, await readObservationRequests(db, plan.id))) return error(viewer.chair ? 'The UBEC BEAP Chair follows observations read-only' : 'Your department has no open request for observations on this plan', viewer.chair ? 403 : 409);
    return run(db, { plan, actor, department: viewer.department! });
  });
}
const rootSql = `SELECT ${commentFields('plan_comments')} FROM plan_comments WHERE id=$1 AND plan_id=$2 AND parent_id IS NULL AND scope='observation' AND observation_department=$3 FOR UPDATE`;
const taken = (db: Db, planId: number, department: string, target: { sheet: string; row_ref: string; column_id: string | null }) =>
  db.query("SELECT 1 FROM plan_comments WHERE plan_id=$1 AND scope='observation' AND observation_department=$2 AND parent_id IS NULL AND resolved_at IS NULL AND sheet=$3 AND row_ref=$4 AND column_id IS NOT DISTINCT FROM $5", [planId, department, target.sheet, target.row_ref, target.column_id]).then(r => !!r.rowCount);

export async function POST(request: NextRequest) {
  try {
    const parsed = createCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues.find(issue => issue.path[0] === 'body')?.message ?? 'Choose a cell or row and write a comment of up to 2,000 characters');
    const input = parsed.data;
    return await withOpenRequest(request, async (db, { plan, actor, department }) => {
      const insert = (values: unknown[]) => db.query("INSERT INTO plan_comments(plan_id,pillar,sheet,row_ref,column_id,parent_id,body,author_id,author_name,author_role,submission_number,target_label,scope,observation_department) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'observation',$13) RETURNING id", values);
      if ('parentId' in input) {
        const parent = (await db.query<CommentRow>(rootSql, [input.parentId, plan.id, department])).rows[0];
        if (!parent) return error('Comment not found', 404);
        if (parent.resolved_at) return error('This comment is resolved. Reopen it before replying.', 409);
        const id = (await insert([plan.id, parent.pillar, parent.sheet, parent.row_ref, parent.column_id, parent.id, input.body, actor.id, actor.full_name, actor.role, plan.submission_number, parent.target_label, department])).rows[0].id;
        return NextResponse.json({ id: Number(id) }, { status: 201 });
      }
      const rowLabel = sheetRows(await readPlanSnapshot(db, plan.id), input.sheet).get(input.rowRef);
      if (rowLabel === undefined || (input.columnId !== null && !(input.columnId in commentColumns[input.sheet]))) return error('That cell is no longer in the plan. Refresh the page and try again.', 400);
      if (await taken(db, plan.id, department, { sheet: input.sheet, row_ref: input.rowRef, column_id: input.columnId })) return error(`Your department already has an open comment on this ${input.columnId ? 'cell' : 'row'}. Reply to it instead.`, 409);
      const id = (await insert([plan.id, sheetPillar[input.sheet], input.sheet, input.rowRef, input.columnId, null, input.body, actor.id, actor.full_name, actor.role, plan.submission_number, targetLabel(input.sheet, input.columnId, rowLabel), department])).rows[0].id;
      return NextResponse.json({ id: Number(id) }, { status: 201 });
    }, { answer: 'parentId' in input });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('This cell or row already has an open comment. Refresh to see it.', 409);
    console.error('Observation comment could not be saved', cause); return error('Your comment could not be saved. Please try again.', 503);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = updateCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose a comment to resolve or reopen');
    const input = parsed.data;
    return await withOpenRequest(request, async (db, { plan, actor, department }) => {
      const root = (await db.query<CommentRow>(rootSql, [input.id, plan.id, department])).rows[0];
      if (!root) return error('Comment not found', 404);
      if (input.action === 'resolve') {
        if (root.resolved_at) return error('This comment is already resolved', 409);
        await db.query('UPDATE plan_comments SET resolved_at=NOW(), resolved_by_name=$1 WHERE id=$2', [actor.full_name, root.id]);
      } else {
        if (!root.resolved_at) return error('This comment is already open', 409);
        if (await taken(db, plan.id, department, root)) return error('Another open comment already covers this cell. Reply there instead.', 409);
        await db.query('UPDATE plan_comments SET resolved_at=NULL, resolved_by_name=NULL WHERE id=$1', [root.id]);
      }
      return NextResponse.json({ id: Number(root.id), resolved: input.action === 'resolve' });
    }, { answer: input.action === 'resolve' });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('Another open comment already covers this cell. Refresh to see it.', 409);
    console.error('Observation comment could not be updated', cause); return error('The comment could not be updated. Please try again.', 503);
  }
}
