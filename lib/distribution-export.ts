import { activityLabel } from './activity-plans.ts';
import { isDistributedLine, type DistributionWorkstream } from './distribution-lists.ts';
import { lineCodeLabel } from './line-code.ts';
import { lineMinor, minorToNaira } from './money.ts';

/**
 * UBEC246 (client, 7 November 2026): the workbook download says which items go to each school on the TLM, Curriculum
 * and Greening distribution lists, and how many. One row per school per item, so a filter on School (or Item) gives
 * that school's items and the totals row (SUBTOTAL) its quantity and value. Pure, so scripts/test-distribution-export.mjs
 * checks it without a browser.
 */
export type DistributionItemRow = {
  id: string; schoolId: number; school: string; code: string; lga: string; level: string;
  activity: string; item: string; itemCode: string; quantity: number; unitCost: number; value: number;
};
type ListSchool = { id: number; name: string; lga: string; level: string; code?: string | null };
type ItemLine = {
  id: number; activity: number; custom_activity?: string; description?: string; item?: string; code?: string; unit_cost: string;
  schools?: readonly { id: number; name?: string; lga?: string; level?: string; quantity?: number | null }[];
};

/** The item's own name: its description, else the Greening item, else the activity. */
const itemName = (component: DistributionWorkstream, line: ItemLine) =>
  line.description?.trim() || line.item?.trim() || activityLabel(component, line.activity, line.custom_activity);

/**
 * Rows in the distribution list's order, each school's items in the component's line order. Empty for snapshots from
 * before the allocations (`withAllocations` false): their download keeps the share by enrolment only.
 */
export function distributionItemRows(component: DistributionWorkstream, schools: readonly ListSchool[], lines: readonly ItemLine[], withAllocations: boolean): DistributionItemRow[] {
  if (!withAllocations) return [];
  const order = new Map(schools.map((s, index) => [s.id, index]));
  const byId = new Map(schools.map(s => [s.id, s]));
  const rows = lines.filter(line => isDistributedLine(component, line.activity)).flatMap((line, lineIndex) => (line.schools ?? [])
    .filter(s => (s.quantity ?? 0) > 0)
    .map(s => {
      const school = byId.get(s.id), quantity = s.quantity ?? 0;
      return { lineIndex, row: {
        id: `${line.id}-${s.id}`, schoolId: s.id, school: school?.name ?? s.name ?? '', code: school?.code ?? '', lga: school?.lga ?? s.lga ?? '', level: school?.level ?? s.level ?? '',
        activity: activityLabel(component, line.activity, line.custom_activity), item: itemName(component, line), itemCode: lineCodeLabel(line.code ?? ''),
        quantity, unitCost: Number(line.unit_cost), value: minorToNaira(lineMinor(line.unit_cost, quantity)),
      } };
    }));
  const rank = (id: number) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  return rows.sort((a, b) => rank(a.row.schoolId) - rank(b.row.schoolId) || a.row.school.localeCompare(b.row.school) || a.lineIndex - b.lineIndex).map(entry => entry.row);
}
