import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { departmentName, isOversightDepartment, ubecRoles, type UbecRound } from '@/lib/ubec';
import { addUbecEvent, notifyUbec, readActor } from '@/lib/ubec-flow-db';

// UBEC270 (client, 19 November 2026): an Oversight Director assigns their Assessment Officers to a whole plan, not
// component by component. One action puts the chosen officers on every released component their department has not
// finished (ubec_oversight_assignments, migration 071); removing an officer takes them off the plan's open components.
// Assigned officers get the plan in their dashboard queue and comment on its items (they never accept or reject).
// Locks: the plan row FOR SHARE, then the round and its components FOR UPDATE (as app/api/ubec/components).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), roundId: z.number().int().positive(), officerIds: z.array(z.number().int().positive()).min(1).max(50), comment: z.string().trim().max(5000) }).strict(),
  z.object({ action: z.literal('unassign'), roundId: z.number().int().positive(), officerId: z.number().int().positive() }).strict(),
]);

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Invalid request');
    const input = parsed.data, planId = request.nextUrl.searchParams.get('plan');
    if (!planId || !/^[1-9]\d{0,9}$/.test(planId)) return error('Choose a valid plan');
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return error('Session expired', 401);
      const department = actor.department;
      if (actor.role !== ubecRoles.oversight || !isOversightDepartment(department)) return error('Only an Oversight Director assigns their department’s officers to a plan', 403);
      if (!(await db.query('SELECT 1 FROM action_plans WHERE id=$1 FOR SHARE', [planId])).rowCount) return error('Plan not found', 404);
      const round = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE id=$1 AND plan_id=$2 FOR UPDATE', [input.roundId, planId])).rows[0];
      const latest = (await db.query<{ id: number }>('SELECT id FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
      if (!round) return error('Submission not found', 404);
      if (latest?.id !== round.id || round.status !== 'reviewing') return error('This submission is no longer open for review', 409);
      // The components still open to the department: released, not yet with the BEAP Chair, observations not recorded.
      const open = (await db.query<{ id: number; pillar: string }>(`SELECT c.id,c.pillar FROM ubec_round_components c WHERE c.round_id=$1 AND c.stage IN ('director','oversight')
        AND NOT EXISTS (SELECT 1 FROM ubec_oversight_reviews r WHERE r.round_component_id=c.id AND r.department=$2) ORDER BY c.id FOR UPDATE`, [round.id, department])).rows;
      const live = (await db.query<{ id: number; round_component_id: number; officer_id: number; officer_name: string; completed_at: Date | null }>(
        'SELECT id,round_component_id,officer_id,officer_name,completed_at FROM ubec_oversight_assignments WHERE round_component_id=ANY($1::int[]) AND department=$2 AND removed_at IS NULL', [open.map(c => c.id), department])).rows;
      const event = (action: string, comment: string) => addUbecEvent(db, { roundId: round.id, planId, action, actor, comment, pillar: null });

      if (input.action === 'unassign') {
        const theirs = live.filter(a => a.officer_id === input.officerId && !a.completed_at);
        if (!theirs.length) return error('This officer has no open work on this plan', 404);
        await db.query('UPDATE ubec_oversight_assignments SET removed_at=NOW() WHERE id=ANY($1::int[])', [theirs.map(a => a.id)]);
        await event('unassign_observer', theirs[0].officer_name);
        return NextResponse.json({ removed: theirs.length });
      }
      if (!input.comment) return error('Add a comment for the Assessment Officers before assigning');
      if (!open.length) return error(`${departmentName(department)} has finished its observations on every component of this plan`, 409);
      const officers = (await db.query<{ id: number; full_name: string }>('SELECT id,display_name AS full_name FROM users WHERE id=ANY($1::int[]) AND role=$2 AND department=$3 AND active AND deleted_at IS NULL', [input.officerIds, ubecRoles.officer, department])).rows;
      if (officers.length !== new Set(input.officerIds).size) return error(`Choose active Assessment Officers of ${departmentName(department)}`);
      let added = 0;
      const assigned: typeof officers = [];
      for (const officer of officers) {
        const missing = open.filter(c => !live.some(a => a.round_component_id === c.id && a.officer_id === officer.id));
        if (!missing.length) continue;
        for (const component of missing) {
          await db.query('INSERT INTO ubec_oversight_assignments(round_component_id,department,officer_id,officer_name,assigned_by_id,assigned_by_name,comment) VALUES($1,$2,$3,$4,$5,$6,$7)', [component.id, department, officer.id, officer.full_name, actor.id, actor.full_name, input.comment]);
          added++;
        }
        assigned.push(officer);
      }
      if (!assigned.length) return error('These officers are already on this plan', 409);
      const id = await event('assign_observer', `${assigned.map(o => o.full_name).join(', ')}: ${input.comment}`);
      await notifyUbec(db, planId, id, actor.id, { userIds: assigned.map(o => o.id) });
      return NextResponse.json({ assigned: assigned.map(o => o.id), components: open.length, added });
    });
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') return error('This was already recorded. Refresh to see it.', 409);
    console.error('UBEC plan oversight assignment failed', cause); return error('Unable to save this action. Refresh and try again.', 503);
  }
}
