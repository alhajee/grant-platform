import type { Db } from './ubec-flow-db';
import { picksFromPriceList, sportsPicksFromPriceList } from './procurement';
import { nairaFormat } from './money-format';
import { toMinor } from './money';

// Server checks for the Procurement price list (migration 074).
// Prices compare exactly in minor units (four decimals, UBEC238).
type Priced = { priceItemId: number | null } | { problem: string; status: number };
type SavedLine = { price_item_id: number | null; unit_cost: string };

/**
 * A picked item must be an approved item of the plan's state and the unit cost its list price; a line that keeps its
 * item may keep the price it was saved with (the list may have changed since).
 */
async function pickedItem(db: Db, stateCode: string, priceItemId: number, unitCost: number, before: SavedLine | undefined): Promise<Priced> {
  const item = (await db.query<{ unit_price: string; status: string }>('SELECT unit_price::text,status FROM procurement_items WHERE id=$1 AND state_code=$2', [priceItemId, stateCode])).rows[0];
  if (!item) return { problem: 'That item is not on your state’s price list', status: 400 };
  if (before?.price_item_id === priceItemId && toMinor(before.unit_cost) === toMinor(unitCost)) return { priceItemId };
  if (item.status !== 'approved') return { problem: 'That item is waiting for the Procurement Director’s approval', status: 409 };
  if (toMinor(item.unit_price) !== toMinor(unitCost)) return { problem: `The price list says ${nairaFormat.format(Number(item.unit_price))} for this item`, status: 409 };
  return { priceItemId };
}

/**
 * Checks an activity line's price-list item on save (under the plan lock). Any activity line may be picked from the
 * list except Teacher Development trainings (UBEC244). Picking is always optional (the Super Admin
 * "Require the price list" setting was removed on 7 November 2026: it blocked SUBEBs). Returns the item id to store, or a problem.
 */
export async function resolvePriceItem(db: Db, input: { stateCode: string; workstream: string; activity: number; priceItemId: number | null; unitCost: number; lineId: number | null }): Promise<Priced> {
  const before = input.lineId ? (await db.query<SavedLine & { activity: number }>('SELECT price_item_id,unit_cost::text,activity FROM activity_plan_lines WHERE id=$1', [input.lineId])).rows[0] : undefined;
  if (input.priceItemId === null) {
    return { priceItemId: null };
  }
  if (!picksFromPriceList(input.workstream)) return { problem: 'Trainings do not come from the price list', status: 400 };
  return pickedItem(db, input.stateCode, input.priceItemId, input.unitCost, before);
}

/** The same check for a Sports line (UBEC244, migration 095): only the items bought, not PHE training; never required. */
export async function resolveSportsPriceItem(db: Db, input: { stateCode: string; section: string; activityType: string; priceItemId: number | null; unitCost: number; lineId: number | null }): Promise<Priced> {
  if (input.priceItemId === null) return { priceItemId: null };
  if (!sportsPicksFromPriceList(input)) return { problem: 'Only the items bought under Procurement & Training of PHE Officers come from the price list', status: 400 };
  const before = input.lineId ? (await db.query<SavedLine>('SELECT price_item_id,unit_cost::text FROM sports_budget_lines WHERE id=$1', [input.lineId])).rows[0] : undefined;
  return pickedItem(db, input.stateCode, input.priceItemId, input.unitCost, before);
}
