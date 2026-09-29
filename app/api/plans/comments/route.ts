import { NextRequest, NextResponse } from 'next/server';
import type { QueryResult, QueryResultRow } from 'pg';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { resolveActionPlan, planFields } from '@/lib/plan-workspace';
import type { ActionPlan } from '@/lib/action-plans';
import { readPlanSnapshot } from '@/lib/plan-snapshot';
import { readPillarReviews, statePlanOpen } from '@/lib/pillar-review';
import { visibleComponents } from '@/lib/plan-visibility';
import { subebRoles } from '@/lib/subeb-access';
import { userDepartmentsSql } from '@/lib/user-departments';
import { commentAbilities, commentColumns, commentSheets, createCommentSchema, displayRole, sheetPillar, sheetRows, targetLabel, updateCommentSchema, type CommentSheet, type PlanCommentReply, type PlanCommentThread } from '@/lib/plan-comments';

type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
type Actor = { id: number; role: string; department: string | null; departments: string[]; isBeapChair: boolean };
type Row = { id: number; parent_id: number | null; pillar: PlanCommentThread['pillar']; sheet: CommentSheet; row_ref: string; column_id: string | null; body: string; author_id: number | null; author_name: string; author_role: string; created_at: string; resolved_at: string | null; resolved_by_name: string | null; submission_number: number; target_label: string };

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const noStore = { 'Cache-Control': 'no-store' };
const stateOnly = 'Comments are available to SUBEB reviewers and Data Entry Staff only.';
const columns = 'id, parent_id, pillar, sheet, row_ref, column_id, body, author_id, author_name, author_role, created_at, resolved_at, resolved_by_name, submission_number, target_label';

async function readActor(db: Db, userId: number, sessionVersion: number) {
  return (await db.query<Actor>(`SELECT id, role, department, ${userDepartmentsSql('users')} AS departments, is_beap_chair AS "isBeapChair" FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE`, [userId, sessionVersion])).rows[0];
}
const reply = (row: Row, userId: number): PlanCommentReply => ({ id: Number(row.id), body: row.body, authorName: row.author_name, authorRole: row.author_role, createdAt: row.created_at, mine: row.author_id === userId });

export async function GET(request: NextRequest) {
  try {
    const workspace = await getWorkspaceState(request);
    if (!workspace) return error('Sign in to view comments.', 401);
    if (!(subebRoles as readonly string[]).includes(workspace.role)) return error(stateOnly, 403);
    const found = await resolveActionPlan(request, workspace.stateCode);
    if (!found) return error('Action plan not found.', 404);
    const visible = visibleComponents(workspace);
    const { rows, snapshot, reviews } = await getPostgres().transaction(async db => ({
      rows: await db.query<Row>(`SELECT ${columns} FROM plan_comments WHERE plan_id=$1 AND pillar=ANY($2::text[]) ORDER BY id`, [found.id, visible]),
      snapshot: await readPlanSnapshot(db, found.id), reviews: await readPillarReviews(db, found.id),
    }));
    const current = Object.fromEntries(commentSheets.map(sheet => [sheet, sheetRows(snapshot, sheet)])) as Record<CommentSheet, Map<string, string>>;
    const threads = new Map<number, PlanCommentThread>();
    for (const row of rows.rows) {
      if (row.parent_id === null) threads.set(Number(row.id), {
        ...reply(row, workspace.userId), pillar: row.pillar, sheet: row.sheet, rowRef: row.row_ref, columnId: row.column_id, targetLabel: row.target_label,
        submissionNumber: row.submission_number, resolvedAt: row.resolved_at, resolvedByName: row.resolved_by_name, replies: [],
        orphaned: !current[row.sheet].has(row.row_ref) || (row.column_id !== null && !(row.column_id in commentColumns[row.sheet])),
      });
      else threads.get(Number(row.parent_id))?.replies.push(reply(row, workspace.userId));
    }
    const abilities = Object.fromEntries(visible.map(pillar => [pillar, commentAbilities(workspace, pillar, reviews.find(r => r.pillar === pillar)?.status ?? 'draft')]));
    return NextResponse.json({ threads: [...threads.values()], locked: !statePlanOpen(found.status), abilities }, { headers: noStore });
  } catch (cause) { console.error('Plan comments could not be loaded', cause); return error('Unable to load comments. Please try again.', 503); }
}

/** Shared guard for writes: signed-in state user, same origin, plan in this state and still open. */
async function withOpenPlan(request: NextRequest, run: (db: Db, context: { plan: ActionPlan; actor: Actor; name: string; status: (pillar: PlanCommentThread['pillar']) => string }) => Promise<NextResponse>) {
  const workspace = await getWorkspaceState(request);
  if (!workspace) return error('Sign in to continue.', 401);
  if (!isSameRequestOrigin(request)) return error('This action must come from the portal.', 403);
  if (!(subebRoles as readonly string[]).includes(workspace.role)) return error(stateOnly, 403);
  const found = await resolveActionPlan(request, workspace.stateCode);
  if (!found) return error('Action plan not found.', 404);
  return getPostgres().transaction(async db => {
    const actor = await readActor(db, workspace.userId, workspace.sessionVersion);
    if (!actor) return error('You do not have permission for this action.', 403);
    // FOR SHARE serialises with review transitions, which lock the plan FOR UPDATE.
    const plan = (await db.query<ActionPlan>(`SELECT ${planFields} FROM action_plans WHERE id=$1 AND state_code=$2 FOR SHARE`, [found.id, workspace.stateCode])).rows[0];
    if (!plan) return error('Action plan not found.', 404);
    if (!statePlanOpen(plan.status)) return error('The plan is locked during UBEC review, so comments are read-only.', 409);
    const reviews = await readPillarReviews(db, plan.id);
    return run(db, { plan, actor, name: workspace.name, status: pillar => reviews.find(r => r.pillar === pillar)?.status ?? 'draft' });
  });
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues.find(issue => issue.path[0] === 'body')?.message ?? 'Choose a cell or row and write a comment of up to 2,000 characters.');
    const input = parsed.data;
    return await withOpenPlan(request, async (db, { plan, actor, name, status }) => {
      const role = displayRole(actor.role, actor.isBeapChair);
      if ('parentId' in input) {
        const parent = (await db.query<Row>(`SELECT ${columns} FROM plan_comments WHERE id=$1 AND plan_id=$2 AND parent_id IS NULL FOR UPDATE`, [input.parentId, plan.id])).rows[0];
        if (!parent || !commentAbilities(actor, parent.pillar, status(parent.pillar)).reply) return error('Comment not found.', 404);
        if (parent.resolved_at) return error('This comment is resolved. Reopen it before replying.', 409);
        const id = (await db.query('INSERT INTO plan_comments(plan_id,pillar,sheet,row_ref,column_id,parent_id,body,author_id,author_name,author_role,submission_number,target_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
          [plan.id, parent.pillar, parent.sheet, parent.row_ref, parent.column_id, parent.id, input.body, actor.id, name, role, plan.submissionNumber, parent.target_label])).rows[0].id;
        return NextResponse.json({ id: Number(id) }, { status: 201 });
      }
      const pillar = sheetPillar[input.sheet];
      const can = commentAbilities(actor, pillar, status(pillar));
      if (!can.reply) return error('This component is not assigned to your departments.', 403);
      if (!can.start) return error('Only the reviewer currently holding this component can start a new comment. You can still reply to existing comments.', 403);
      const rowLabel = sheetRows(await readPlanSnapshot(db, plan.id), input.sheet).get(input.rowRef);
      if (rowLabel === undefined || (input.columnId !== null && !(input.columnId in commentColumns[input.sheet]))) return error('That cell is no longer in the plan. Refresh the page and try again.', 400);
      const existing = await db.query('SELECT 1 FROM plan_comments WHERE plan_id=$1 AND sheet=$2 AND row_ref=$3 AND column_id IS NOT DISTINCT FROM $4 AND parent_id IS NULL AND resolved_at IS NULL', [plan.id, input.sheet, input.rowRef, input.columnId]);
      if (existing.rowCount) return error(`This ${input.columnId ? 'cell' : 'row'} already has an open comment. Reply to it instead.`, 409);
      const id = (await db.query('INSERT INTO plan_comments(plan_id,pillar,sheet,row_ref,column_id,body,author_id,author_name,author_role,submission_number,target_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
        [plan.id, pillar, input.sheet, input.rowRef, input.columnId, input.body, actor.id, name, role, plan.submissionNumber, targetLabel(input.sheet, input.columnId, rowLabel)])).rows[0].id;
      return NextResponse.json({ id: Number(id) }, { status: 201 });
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('This cell or row already has an open comment. Refresh to see it.', 409);
    console.error('Plan comment could not be saved', cause); return error('Your comment could not be saved. Please try again.', 503);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = updateCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose a comment to resolve or reopen.');
    const input = parsed.data;
    return await withOpenPlan(request, async (db, { plan, actor, name, status }) => {
      const root = (await db.query<Row>(`SELECT ${columns} FROM plan_comments WHERE id=$1 AND plan_id=$2 AND parent_id IS NULL FOR UPDATE`, [input.id, plan.id])).rows[0];
      const can = root && commentAbilities(actor, root.pillar, status(root.pillar));
      if (!root || !can?.reply) return error('Comment not found.', 404);
      if (input.action === 'resolve') {
        if (root.resolved_at) return error('This comment is already resolved.', 409);
        if (!can.resolveAny && root.author_id !== actor.id) return error('Only this department’s Data Entry Staff, the comment author or the reviewer holding the component can resolve it.', 403);
        await db.query('UPDATE plan_comments SET resolved_at=NOW(), resolved_by_name=$1 WHERE id=$2', [name, root.id]);
      } else {
        if (!root.resolved_at) return error('This comment is already open.', 409);
        if (!can.reopen) return error('Only a Director, the BEAP Chair or the Executive Chairman can reopen a comment.', 403);
        const clash = await db.query('SELECT 1 FROM plan_comments WHERE plan_id=$1 AND sheet=$2 AND row_ref=$3 AND column_id IS NOT DISTINCT FROM $4 AND parent_id IS NULL AND resolved_at IS NULL', [plan.id, root.sheet, root.row_ref, root.column_id]);
        if (clash.rowCount) return error('Another open comment already covers this cell. Reply there instead.', 409);
        await db.query('UPDATE plan_comments SET resolved_at=NULL, resolved_by_name=NULL WHERE id=$1', [root.id]);
      }
      return NextResponse.json({ id: Number(root.id), resolved: input.action === 'resolve' });
    });
  } catch (cause) { console.error('Plan comment could not be updated', cause); return error('The comment could not be updated. Please try again.', 503); }
}
