// Explicit .ts so the Node test scripts can load this file directly.
import { implementedPillars, type ImplementedPillar } from './beap-pillars.ts';
import type { Snapshot } from './plan-review';

// The correction loop after UBEC returns a plan (UBEC189/195/196, 28 October 2026). A rejected item counts as corrected
// once the SUBEB has changed it (any of its figures, details, schools, documents or allocations) or removed it. While a
// component still has rejected items nobody corrected, it is not sent on (to the Director, the BEAP Chair, the Executive
// Chairman or UBEC). On the resubmitted round UBEC sees which rejected items were corrected (shown in yellow).

export type RejectedItem = { pillar: ImplementedPillar; rowRef: string };
type Row = Record<string, unknown>;

// Fields that change on any save, so they do not count as a correction.
const volatile = new Set(['updated_at', 'created_at', 'client_key', 'version', 'updatedAt', 'createdAt', 'code']);
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Row).filter(([key]) => !volatile.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)]));
  return value;
}

/** Each item of a component by its row ref, as comparable text. Infrastructure items include their school's documents. */
function itemsOf(snapshot: Snapshot, pillar: ImplementedPillar): Map<string, string> {
  if (pillar === 'infrastructure') return new Map((snapshot.infrastructure ?? []).map(line => [String(line.id), JSON.stringify(stable({
    quantity: line.quantity, unit_cost: line.unit_cost, input: line.package?.input, total: line.package?.total_cost, quarters: line.quarters, start: line.start_date, due: line.due_date,
    documents: (snapshot.infrastructureDocuments ?? []).filter(d => d.schoolId === line.school.id).map(d => d.id).sort(),
  }))]));
  const lines = (pillar === 'sports' ? snapshot.sports : snapshot[pillar]) as unknown as Row[] | undefined;
  return new Map((lines ?? []).map(line => [String(line.id), JSON.stringify(stable(line))]));
}

/** The rejected items still unchanged in the current working plan, per component (removed items are corrected). */
export function openRejections(returned: Snapshot, current: Snapshot, rejected: readonly RejectedItem[]): Partial<Record<ImplementedPillar, string[]>> {
  const open: Partial<Record<ImplementedPillar, string[]>> = {};
  for (const pillar of implementedPillars) {
    const refs = rejected.filter(r => r.pillar === pillar).map(r => r.rowRef);
    if (!refs.length) continue;
    const before = itemsOf(returned, pillar), now = itemsOf(current, pillar);
    const unchanged = refs.filter(ref => now.has(ref) && now.get(ref) === before.get(ref));
    if (unchanged.length) open[pillar] = unchanged;
  }
  return open;
}

/** Rejected items of the previous round that the SUBEB changed before resubmitting, per component (kept, not removed). */
export function correctedItems(previous: Snapshot, resubmitted: Snapshot, rejected: readonly RejectedItem[]): Partial<Record<ImplementedPillar, string[]>> {
  const corrected: Partial<Record<ImplementedPillar, string[]>> = {};
  for (const pillar of implementedPillars) {
    const refs = rejected.filter(r => r.pillar === pillar).map(r => r.rowRef);
    if (!refs.length) continue;
    const before = itemsOf(previous, pillar), now = itemsOf(resubmitted, pillar);
    const changed = refs.filter(ref => now.has(ref) && now.get(ref) !== before.get(ref));
    if (changed.length) corrected[pillar] = changed;
  }
  return corrected;
}

/** Why a component cannot be sent on yet, or null. */
export function rejectionProblem(name: string, open: readonly string[] | undefined): string | null {
  if (!open?.length) return null;
  return `Correct the ${open.length === 1 ? 'item' : `${open.length} items`} UBEC rejected in ${name} first: change or remove ${open.length === 1 ? 'it' : 'them'}. Open the rejected items from the component card`;
}
