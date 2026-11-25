import type { ImplementedPillar } from './beap-pillars';
import { ubecRoles, type UbecRound } from './ubec';
import { componentItems } from './ubec-flow';
import { addUbecEvent, notifyUbec, releaseRows, type Db } from './ubec-flow-db';
import { unchangedItems } from './ubec-corrections';

type Actor = Parameters<typeof addUbecEvent>[1]['actor'];
export type ResubmissionResult = { carried: ImplementedPillar[]; reassigned: ImplementedPillar[]; waiting: ImplementedPillar[] };

/**
 * Client, 25 November 2026: a plan coming back from the SUBEB is not released again by the UBEC BEAP Chair and accepted
 * components are not opened again. On a resubmission each component goes straight back to UBEC:
 *   - every item accepted last time and nothing changed: its decisions, officers and oversight are carried forward and it
 *     waits for the BEAP Chair at once;
 *   - otherwise it goes to the officers who assessed it last time (still active in the department), with the unchanged
 *     accepted items already decided, so they assess only what changed or is new;
 *   - a component with nobody to reassign (or new in this submission) waits for its Director, as on a first submission.
 */
export async function releaseResubmission(db: Db, round: UbecRound, previous: UbecRound, actor: Actor): Promise<ResubmissionResult> {
  const result: ResubmissionResult = { carried: [], reassigned: [], waiting: [] };
  const before = (await db.query<{ id: number; pillar: ImplementedPillar; director_name: string | null }>('SELECT id,pillar,director_name FROM ubec_round_components WHERE round_id=$1', [previous.id])).rows;
  const decisions = (await db.query<{ pillar: string; row_ref: string; decision: string; note: string; officer_id: number; officer_name: string }>('SELECT pillar,row_ref,decision,note,officer_id,officer_name FROM ubec_item_decisions WHERE round_id=$1', [previous.id])).rows;
  for (const { pillar, department } of releaseRows(round.snapshot)) {
    const last = before.find(c => c.pillar === pillar);
    const items = componentItems(round.snapshot, pillar);
    const same = unchangedItems(previous.snapshot, round.snapshot, pillar);
    const carried = items.map(item => decisions.find(d => d.pillar === pillar && d.row_ref === item.rowRef)).filter((d, i) => d?.decision === 'accept' && same.has(items[i].rowRef)) as typeof decisions;
    const allAccepted = !!last && items.length > 0 && carried.length === items.length;
    const officers = last ? (await db.query<{ officer_id: number; officer_name: string; assigned_by_id: number; assigned_by_name: string }>(
      `SELECT a.officer_id,a.officer_name,a.assigned_by_id,a.assigned_by_name FROM ubec_officer_assignments a JOIN users u ON u.id=a.officer_id
        WHERE a.round_component_id=$1 AND a.removed_at IS NULL AND u.active AND u.deleted_at IS NULL AND u.role=$2 AND u.department=$3 ORDER BY a.id`, [last.id, ubecRoles.officer, department])).rows : [];
    const note = `Accepted in submission ${previous.number} and unchanged`;
    const component = (await db.query<{ id: number }>(allAccepted
      ? "INSERT INTO ubec_round_components(round_id,pillar,department,stage,director_comment,director_name,sent_to_oversight_at,arrived_at) VALUES($1,$2,$3,'chair',$4,$5,NOW(),NOW()) RETURNING id"
      : 'INSERT INTO ubec_round_components(round_id,pillar,department) VALUES($1,$2,$3) RETURNING id', allAccepted ? [round.id, pillar, department, note, last!.director_name] : [round.id, pillar, department])).rows[0];
    for (const d of carried) await db.query('INSERT INTO ubec_item_decisions(round_id,pillar,row_ref,decision,note,officer_id,officer_name,carried_from) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [round.id, pillar, d.row_ref, d.decision, d.note, d.officer_id, d.officer_name, previous.number]);
    const toAssess = items.length - carried.length;
    const comment = allAccepted ? note : `The SUBEB resubmitted the plan. You assessed submission ${previous.number}: ${toAssess} ${toAssess === 1 ? 'item' : 'items'} changed or new to assess${carried.length ? `, ${carried.length} accepted ${carried.length === 1 ? 'item is' : 'items are'} carried forward` : ''}`;
    for (const o of officers) await db.query(`INSERT INTO ubec_officer_assignments(round_component_id,officer_id,officer_name,assigned_by_id,assigned_by_name,comment${allAccepted ? ',completed_at,completion_note' : ''}) VALUES($1,$2,$3,$4,$5,$6${allAccepted ? ',NOW(),$6' : ''})`, [component.id, o.officer_id, o.officer_name, o.assigned_by_id, o.assigned_by_name, comment]);
    if (allAccepted) {
      await db.query('INSERT INTO ubec_oversight_reviews(round_component_id,department,reviewer_id,reviewer_name,note) SELECT $1,department,reviewer_id,reviewer_name,note FROM ubec_oversight_reviews WHERE round_component_id=$2', [component.id, last!.id]);
      await addUbecEvent(db, { roundId: round.id, planId: round.plan_id, action: 'carry_forward', actor, comment: note, pillar });
      result.carried.push(pillar);
    } else if (officers.length) {
      const event = await addUbecEvent(db, { roundId: round.id, planId: round.plan_id, action: 'reassign_officer', actor, comment, pillar });
      await notifyUbec(db, round.plan_id, event, actor.id, { userIds: officers.map(o => o.officer_id) }, { role: ubecRoles.director, departments: [department] });
      result.reassigned.push(pillar);
    } else result.waiting.push(pillar);
  }
  return result;
}
