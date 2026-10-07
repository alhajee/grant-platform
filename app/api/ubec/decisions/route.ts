import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { implementedPillars } from '@/lib/beap-pillars';
import { ubecRoles, type UbecRound } from '@/lib/ubec';
import { componentItems } from '@/lib/ubec-flow';
import { readActor } from '@/lib/ubec-flow-db';

// Item decisions (docs/ubec-flow.md): an Assessment Officer assigned to the component accepts or rejects each line
// (one decision per item per round) until their assessment is complete. null clears the decision.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const command = z.object({
  roundId: z.number().int().positive(), pillar: z.enum(implementedPillars), rowRef: z.string().regex(/^-?[1-9]\d{0,17}$/),
  decision: z.enum(['accept', 'reject']).nullable(), note: z.string().trim().max(1000).default(''),
}).strict();

export async function PUT(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue.', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal.', 403);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return error('Choose an item and a decision.');
    const input = parsed.data, planId = request.nextUrl.searchParams.get('plan');
    if (!planId || !/^[1-9]\d{0,9}$/.test(planId)) return error('Choose a valid plan.');
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return error('Session expired.', 401);
      if (actor.role !== ubecRoles.officer) return error(actor.role === ubecRoles.oversight ? 'Oversight Directors comment on items; they cannot accept or reject them.' : 'Only the Assessment Officers assigned to a component accept or reject its items.', 403);
      if (!(await db.query('SELECT 1 FROM action_plans WHERE id=$1 FOR SHARE', [planId])).rowCount) return error('Plan not found.', 404);
      const round = (await db.query<UbecRound>('SELECT * FROM ubec_rounds WHERE id=$1 AND plan_id=$2 FOR SHARE', [input.roundId, planId])).rows[0];
      if (!round) return error('Submission not found.', 404);
      const component = (await db.query<{ id: number; stage: string }>('SELECT id,stage FROM ubec_round_components WHERE round_id=$1 AND pillar=$2 FOR UPDATE', [round.id, input.pillar])).rows[0];
      const mine = component && (await db.query<{ completed_at: Date | null }>('SELECT completed_at FROM ubec_officer_assignments WHERE round_component_id=$1 AND officer_id=$2 AND removed_at IS NULL', [component.id, actor.id])).rows[0];
      if (!mine) return error('This component is not assigned to you.', 403);
      const latest = (await db.query<{ id: number }>('SELECT id FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
      if (latest?.id !== round.id || round.status !== 'reviewing' || component.stage !== 'director') return error('This component is no longer open for assessment.', 409);
      if (mine.completed_at) return error('You have completed your assessment; decisions are locked.', 409);
      if (!componentItems(round.snapshot, input.pillar).some(item => item.rowRef === input.rowRef)) return error('That item is not in this submission. Refresh and try again.');
      if (input.decision === null) await db.query('DELETE FROM ubec_item_decisions WHERE round_id=$1 AND pillar=$2 AND row_ref=$3', [round.id, input.pillar, input.rowRef]);
      else await db.query(`INSERT INTO ubec_item_decisions(round_id,pillar,row_ref,decision,note,officer_id,officer_name) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (round_id,pillar,row_ref) DO UPDATE SET decision=EXCLUDED.decision,note=EXCLUDED.note,officer_id=EXCLUDED.officer_id,officer_name=EXCLUDED.officer_name,decided_at=NOW()`,
        [round.id, input.pillar, input.rowRef, input.decision, input.note, actor.id, actor.full_name]);
      return NextResponse.json({ rowRef: input.rowRef, decision: input.decision });
    });
  } catch (cause) { console.error('UBEC item decision failed', cause); return error('The decision could not be saved. Please try again.', 503); }
}
