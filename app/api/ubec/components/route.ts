import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { implementedPillars } from '@/lib/beap-pillars';
import { isOversightDepartment, oversightIds, ubecRoles, type UbecRound } from '@/lib/ubec';
import { componentItems, componentName } from '@/lib/ubec-flow';
import { addUbecEvent, notifyUbec, readActor, readDecisions, type Actor, type Db } from '@/lib/ubec-flow-db';

// Component steps of the UBEC review (docs/ubec-flow.md): the Director assigns Assessment Officers and sends the
// component for oversight; officers complete their assessment; Audit, Procurement and Finance finish their observations.
// Locks: the plan row FOR SHARE (serialises with the BEAP Chair's decision), then the round and the component FOR UPDATE.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const note = z.string().trim().max(5000).default('');
const base = { roundId: z.number().int().positive(), pillar: z.enum(implementedPillars) };
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign_officers'), ...base, officerIds: z.array(z.number().int().positive()).min(1).max(20), comment: note }).strict(),
  z.object({ action: z.literal('unassign_officer'), ...base, assignmentId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('complete_assessment'), ...base, note }).strict(),
  z.object({ action: z.literal('send_oversight'), ...base, comment: note }).strict(),
  z.object({ action: z.literal('observations_done'), ...base, note }).strict(),
]);
type Command = z.infer<typeof command>;
type ComponentRow = { id: number; pillar: (typeof implementedPillars)[number]; department: string; stage: string };
const roles: Record<Command['action'], string> = { assign_officers: ubecRoles.director, unassign_officer: ubecRoles.director, send_oversight: ubecRoles.director, complete_assessment: ubecRoles.officer, observations_done: ubecRoles.oversight };

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue.', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal.', 403);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Invalid review request.');
    const input = parsed.data, planId = request.nextUrl.searchParams.get('plan');
    if (!planId || !/^[1-9]\d{0,9}$/.test(planId)) return error('Choose a valid plan.');
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return error('Session expired.', 401);
      if (actor.role !== roles[input.action]) return error(actor.role === ubecRoles.es ? 'The UBEC Executive Secretary oversees the review and does not take workflow actions.' : actor.role === ubecRoles.oversight ? 'Oversight Directors comment and record observations; they cannot assign, accept or reject.' : 'You do not have permission for this action.', 403);
      if (!(await db.query('SELECT 1 FROM action_plans WHERE id=$1 FOR SHARE', [planId])).rowCount) return error('Plan not found.', 404);
      const round = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE id=$1 AND plan_id=$2 FOR UPDATE', [input.roundId, planId])).rows[0];
      const latest = (await db.query<{ id: number }>('SELECT id FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
      if (!round) return error('Submission not found.', 404);
      if (latest?.id !== round.id || round.status !== 'reviewing') return error('This submission is no longer open for review.', 409);
      const component = (await db.query<ComponentRow>('SELECT id,pillar,department,stage FROM ubec_round_components WHERE round_id=$1 AND pillar=$2 FOR UPDATE', [round.id, input.pillar])).rows[0];
      if (!component) return error('This component was not released for review.', 404);
      return run(db, input, actor, round, component, planId);
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('This was already recorded. Refresh to see it.', 409);
    console.error('UBEC component step failed', cause); return error('Unable to save this action. Refresh and try again.', 503);
  }
}

async function run(db: Db, input: Command, actor: Actor, round: UbecRound, component: ComponentRow, planId: string) {
  const name = componentName(component.pillar);
  const event = (action: string, comment = '') => addUbecEvent(db, { roundId: round.id, planId, action, actor, comment, pillar: component.pillar });
  const live = async () => (await db.query<{ id: number; officer_id: number; completed_at: Date | null }>('SELECT id,officer_id,completed_at FROM ubec_officer_assignments WHERE round_component_id=$1 AND removed_at IS NULL ORDER BY id', [component.id])).rows;
  if (input.action === 'observations_done') {
    if (!isOversightDepartment(actor.department)) return error('Your account has no oversight department.', 403);
    if (component.stage !== 'oversight') return error(component.stage === 'director' ? `${name} has not been sent for oversight yet.` : `${name} has already reached the UBEC BEAP Chair.`, 409);
    if ((await db.query('SELECT 1 FROM ubec_oversight_reviews WHERE round_component_id=$1 AND department=$2', [component.id, actor.department])).rowCount) return error('Your department has already finished its observations on this component.', 409);
    await db.query('INSERT INTO ubec_oversight_reviews(round_component_id,department,reviewer_id,reviewer_name,note) VALUES($1,$2,$3,$4,$5)', [component.id, actor.department, actor.id, actor.full_name, input.note]);
    const id = await event('observations_done', input.note);
    await notifyUbec(db, planId, id, actor.id, { role: ubecRoles.director, departments: [component.department] });
    const done = (await db.query<{ department: string }>('SELECT department FROM ubec_oversight_reviews WHERE round_component_id=$1', [component.id])).rows.map(r => r.department);
    if (oversightIds.every(d => done.includes(d))) {
      // The third observation moves the component to the UBEC BEAP Chair automatically.
      await db.query("UPDATE ubec_round_components SET stage='chair',arrived_at=NOW() WHERE id=$1", [component.id]);
      const ready = await event('ready_for_chair');
      await notifyUbec(db, planId, ready, actor.id, { role: ubecRoles.chair }, { role: ubecRoles.director, departments: [component.department] });
      return NextResponse.json({ stage: 'chair' });
    }
    return NextResponse.json({ stage: 'oversight', pending: oversightIds.filter(d => !done.includes(d)) });
  }
  if (component.stage !== 'director') return error(`${name} has already been sent for oversight.`, 409);
  if (input.action === 'complete_assessment') {
    const mine = (await live()).find(a => a.officer_id === actor.id);
    if (!mine) return error('This component is not assigned to you.', 403);
    if (mine.completed_at) return error('You have already completed this assessment.', 409);
    const decided = new Set((await readDecisions(db, round.id)).filter(d => d.pillar === component.pillar).map(d => d.rowRef));
    const undecided = componentItems(round.snapshot, component.pillar).filter(item => !decided.has(item.rowRef)).length;
    if (undecided) return error(`Accept or reject every item first (${undecided} still undecided).`, 409);
    await db.query('UPDATE ubec_officer_assignments SET completed_at=NOW(),completion_note=$1 WHERE id=$2', [input.note, mine.id]);
    const id = await event('complete_assessment', input.note);
    await notifyUbec(db, planId, id, actor.id, { role: ubecRoles.director, departments: [component.department] });
    return NextResponse.json({ completed: true });
  }
  // Director steps: only the Director of the component's department.
  if (actor.department !== component.department) return error('This component belongs to another department.', 403);
  if (input.action === 'assign_officers') {
    if (!input.comment) return error('Add a comment for the Assessment Officer before assigning.');
    const officers = (await db.query<{ id: number; full_name: string }>('SELECT id,full_name FROM users WHERE id=ANY($1::int[]) AND role=$2 AND department=$3 AND active', [input.officerIds, ubecRoles.officer, component.department])).rows;
    if (officers.length !== new Set(input.officerIds).size) return error('Choose active Assessment Officers of your department.');
    const current = await live();
    const fresh = officers.filter(o => !current.some(a => a.officer_id === o.id));
    if (!fresh.length) return error('These officers are already assigned to this component.', 409);
    for (const officer of fresh) {
      await db.query('INSERT INTO ubec_officer_assignments(round_component_id,officer_id,officer_name,assigned_by_id,assigned_by_name,comment) VALUES($1,$2,$3,$4,$5,$6)', [component.id, officer.id, officer.full_name, actor.id, actor.full_name, input.comment]);
    }
    const id = await event('assign_officer', `${fresh.map(o => o.full_name).join(', ')}: ${input.comment}`);
    await notifyUbec(db, planId, id, actor.id, { userIds: fresh.map(o => o.id) });
    return NextResponse.json({ assigned: fresh.map(o => o.id) });
  }
  if (input.action === 'unassign_officer') {
    const assignment = (await live()).find(a => a.id === input.assignmentId);
    if (!assignment) return error('Assignment not found.', 404);
    if (assignment.completed_at) return error('A completed assessment cannot be removed.', 409);
    await db.query('UPDATE ubec_officer_assignments SET removed_at=NOW() WHERE id=$1', [assignment.id]);
    await event('unassign_officer');
    return NextResponse.json({ removed: assignment.id });
  }
  // send_oversight
  if (!input.comment) return error('Add your comment before sending for oversight.');
  const assignments = await live();
  if (!assignments.length) return error('Assign an Assessment Officer first.', 409);
  const open = assignments.filter(a => !a.completed_at).length;
  if (open) return error(`Wait for every Assessment Officer to complete their assessment (${open} still working).`, 409);
  await db.query("UPDATE ubec_round_components SET stage='oversight',sent_to_oversight_at=NOW(),director_comment=$1,director_name=$2 WHERE id=$3", [input.comment, actor.full_name, component.id]);
  const id = await event('send_oversight', input.comment);
  await notifyUbec(db, planId, id, actor.id, { role: ubecRoles.oversight });
  return NextResponse.json({ stage: 'oversight' });
}
