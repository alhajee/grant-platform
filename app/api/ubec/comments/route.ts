import { NextRequest, NextResponse } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { getWorkspaceState } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { isUbec, ubecRoles, type UbecRound } from '@/lib/ubec';
import { implementedPillars } from '@/lib/beap-pillars';
import { commentColumns, createCommentSchema, sheetPillar, sheetRows, targetLabel, ubecAbilities, updateCommentSchema } from '@/lib/plan-comments';
import { readRoundRoot, readRoundRows, readViewerRounds, roundCellTaken, roundCutoff, roundOpen, toThreads, viewerPillars, type Db } from '@/lib/ubec-comments';

// UBEC review comments (migrations 029, 055). Every UBEC reviewer comments on the components of the round they
// can see (lib/ubec-flow-db.ts: the BEAP Chair all, a Director their department's once released, Oversight once sent
// for oversight, an Assessment Officer their assigned ones); the UBEC ES reads everything but writes nothing.
// Threads stay internal to UBEC until the UBEC BEAP Chair shares them when returning the plan. State users are refused.

type Actor = { id: number; role: string; department: string | null; full_name: string };
type Context = { planId: number; round: UbecRound; pillars: string[]; actor: Actor };
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const noStore = { 'Cache-Control': 'no-store' };
const ubecOnly = 'UBEC comments are available to UBEC reviewers only.';
const planParam = (request: NextRequest) => { const id = request.nextUrl.searchParams.get('plan'); return id && /^[1-9]\d{0,9}$/.test(id) ? Number(id) : null; };
const roundParam = (request: NextRequest) => { const id = request.nextUrl.searchParams.get('round'); return id === null ? undefined : /^[1-9]\d{0,9}$/.test(id) ? Number(id) : NaN; };

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to view comments.', 401);
    if (!isUbec(user.role)) return error(ubecOnly, 403);
    const planId = planParam(request), selected = roundParam(request);
    if (!planId || Number.isNaN(selected)) return error('Choose a valid plan.');
    return await getPostgres().transaction(async db => {
      const viewer = { id: user.userId, role: user.role, department: user.department };
      const rounds = await readViewerRounds(db, planId, viewer);
      const round = selected ? rounds.find(r => r.id === selected) : rounds[0];
      if (!round) return error('Submission not found.', 404);
      const latest = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
      // A round picked in the history selector is always read-only, even when it is the open one.
      const pillars = await viewerPillars(db, round, viewer), open = roundOpen(round, latest) && selected === undefined, cutoff = roundCutoff(round, latest);
      const rows = await readRoundRows(db, planId, round, pillars, cutoff);
      const abilities = Object.fromEntries(implementedPillars.filter(p => pillars.includes(p)).map(p => [p, ubecAbilities(true, open, user.role)]));
      return NextResponse.json({ threads: toThreads(rows, user.userId, round.snapshot, { cutoff, withSharing: true }), locked: !open, abilities, scope: 'ubec', roundId: round.id }, { headers: noStore });
    });
  } catch (cause) { console.error('UBEC comments could not be loaded', cause); return error('Unable to load comments. Please try again.', 503); }
}

/** Shared guard for writes: same origin, a current UBEC account, and the plan's latest round still open. */
async function withOpenRound(request: NextRequest, run: (db: Db, context: Context) => Promise<NextResponse>) {
  const session = await getWorkspaceState(request);
  if (!session) return error('Sign in to continue.', 401);
  if (!isSameRequestOrigin(request)) return error('This action must come from the portal.', 403);
  if (!isUbec(session.role)) return error(ubecOnly, 403);
  const planId = planParam(request), selected = roundParam(request);
  if (!planId || Number.isNaN(selected)) return error('Choose a valid plan.');
  return getPostgres().transaction(async db => {
    const actor = (await db.query<Actor>('SELECT id, role, department, full_name FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [session.userId, session.sessionVersion])).rows[0];
    if (!actor || !isUbec(actor.role) || actor.role === ubecRoles.es) return error(actor?.role === ubecRoles.es ? 'The UBEC Executive Secretary has read-only access to comments.' : 'You do not have permission for this action.', 403);
    // FOR SHARE serialises with the ES decision, which locks the plan FOR UPDATE.
    if (!(await db.query('SELECT 1 FROM action_plans WHERE id=$1 FOR SHARE', [planId])).rowCount) return error('Plan not found.', 404);
    const round = (await readViewerRounds(db, planId, actor))[0];
    const latest = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
    if (!round || round.id !== latest?.id) return error('Submission not found.', 404);
    if ((selected && selected !== round.id) || !roundOpen(round, latest)) return error('This submission is no longer open for review, so its comments are read-only.', 409);
    const pillars = await viewerPillars(db, round, actor);
    if (!pillars.length) return error('No component of this submission has reached you.', 403);
    return run(db, { planId, round, pillars, actor });
  });
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error(parsed.error.issues.find(issue => issue.path[0] === 'body')?.message ?? 'Choose a cell or row and write a comment of up to 2,000 characters.');
    const input = parsed.data;
    return await withOpenRound(request, async (db, { planId, round, pillars, actor }) => {
      const insert = (values: unknown[]) => db.query('INSERT INTO plan_comments(plan_id,pillar,sheet,row_ref,column_id,parent_id,body,author_id,author_name,author_role,submission_number,target_label,scope,ubec_round_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,\'ubec\',$13) RETURNING id', values);
      if ('parentId' in input) {
        const parent = await readRoundRoot(db, planId, round, pillars, input.parentId);
        if (!parent) return error('Comment not found.', 404);
        if (parent.resolved_at) return error('This comment is resolved. Reopen it before replying.', 409);
        const id = (await insert([planId, parent.pillar, parent.sheet, parent.row_ref, parent.column_id, parent.id, input.body, actor.id, actor.full_name, actor.role, round.state_submission, parent.target_label, parent.ubec_round_id])).rows[0].id;
        return NextResponse.json({ id: Number(id) }, { status: 201 });
      }
      const pillar = sheetPillar[input.sheet];
      if (!pillars.includes(pillar)) return error(actor.role === ubecRoles.chair ? 'That cell is no longer in the plan. Refresh the page and try again.' : 'This component is not assigned to you.', actor.role === ubecRoles.chair ? 400 : 403);
      // Row and column refs are checked against the snapshot UBEC received, not the state's working plan.
      const rowLabel = sheetRows(round.snapshot, input.sheet).get(input.rowRef);
      if (rowLabel === undefined || (input.columnId !== null && !(input.columnId in commentColumns[input.sheet]))) return error('That cell is no longer in the plan. Refresh the page and try again.', 400);
      if (await roundCellTaken(db, planId, round, { sheet: input.sheet, row_ref: input.rowRef, column_id: input.columnId })) return error(`This ${input.columnId ? 'cell' : 'row'} already has an open comment. Reply to it instead.`, 409);
      const id = (await insert([planId, pillar, input.sheet, input.rowRef, input.columnId, null, input.body, actor.id, actor.full_name, actor.role, round.state_submission, targetLabel(input.sheet, input.columnId, rowLabel), round.id])).rows[0].id;
      return NextResponse.json({ id: Number(id) }, { status: 201 });
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('This cell or row already has an open comment. Refresh to see it.', 409);
    console.error('UBEC comment could not be saved', cause); return error('Your comment could not be saved. Please try again.', 503);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = updateCommentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose a comment to resolve or reopen.');
    const input = parsed.data;
    return await withOpenRound(request, async (db, { planId, round, pillars, actor }) => {
      const root = await readRoundRoot(db, planId, round, pillars, input.id);
      if (!root) return error('Comment not found.', 404);
      if (input.action === 'resolve') {
        if (root.resolved_at) return error('This comment is already resolved.', 409);
        await db.query('UPDATE plan_comments SET resolved_at=NOW(), resolved_by_name=$1 WHERE id=$2', [actor.full_name, root.id]);
      } else {
        if (!root.resolved_at) return error('This comment is already open.', 409);
        if (await roundCellTaken(db, planId, round, root)) return error('Another open comment already covers this cell. Reply there instead.', 409);
        await db.query('UPDATE plan_comments SET resolved_at=NULL, resolved_by_name=NULL WHERE id=$1', [root.id]);
      }
      return NextResponse.json({ id: Number(root.id), resolved: input.action === 'resolve' });
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('Another open comment already covers this cell. Refresh to see it.', 409);
    console.error('UBEC comment could not be updated', cause); return error('The comment could not be updated. Please try again.', 503);
  }
}
