import type { Db } from './ubec-flow-db';
import { isPriceListActivity, notOnListMessage } from './procurement';
import { nairaFormat } from './money-format';

// Server checks for the Procurement price list (migration 074).
/** Whether the activities that buy goods must use the price list (Super Admin; off when the row or column is missing). */
export async function readPriceListRequired(db: Db): Promise<boolean> {
  try {
    return (await db.query<{ required: boolean | null }>("SELECT price_list_required AS required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.required === true;
  } catch (cause) {
    if ((cause as { code?: string }).code === '42703') return false;
    throw cause;
  }
}

const toKobo = (value: number | string) => Math.round(Number(value) * 100);

/**
 * Checks a line's price-list item on save (under the plan lock). A newly picked item must be an approved item of the
 * plan's state and the unit cost its list price; a line that keeps its item may keep the price it was saved with (the
 * list may have changed since). With the setting on, a new line, or a line moved to another activity, on an activity
 * that buys goods needs an item. Returns the item id to store, or a problem.
 */
export async function resolvePriceItem(db: Db, input: { stateCode: string; workstream: string; activity: number; priceItemId: number | null; unitCost: number; lineId: number | null }): Promise<{ priceItemId: number | null } | { problem: string; status: number }> {
  const listed = isPriceListActivity(input.workstream, input.activity);
  const before = input.lineId ? (await db.query<{ price_item_id: number | null; unit_cost: string; activity: number }>('SELECT price_item_id,unit_cost::text,activity FROM activity_plan_lines WHERE id=$1', [input.lineId])).rows[0] : undefined;
  if (input.priceItemId === null) {
    if (listed && (!before || before.activity !== input.activity) && await readPriceListRequired(db)) return { problem: notOnListMessage, status: 400 };
    return { priceItemId: null };
  }
  if (!listed) return { problem: 'Only items to buy come from the price list', status: 400 };
  const item = (await db.query<{ unit_price: string; status: string }>('SELECT unit_price::text,status FROM procurement_items WHERE id=$1 AND state_code=$2', [input.priceItemId, input.stateCode])).rows[0];
  if (!item) return { problem: 'That item is not on your state’s price list', status: 400 };
  const kept = before?.price_item_id === input.priceItemId;
  if (kept && toKobo(before!.unit_cost) === toKobo(input.unitCost)) return { priceItemId: input.priceItemId };
  if (item.status !== 'approved') return { problem: 'That item is waiting for the Procurement Director’s approval', status: 409 };
  if (toKobo(item.unit_price) !== toKobo(input.unitCost)) return { problem: `The price list says ${nairaFormat.format(Number(item.unit_price))} for this item`, status: 409 };
  return { priceItemId: input.priceItemId };
}
