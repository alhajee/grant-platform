import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { isProcurement, isProcurementDirector, type ProcurementItem } from '@/lib/procurement';
import { readPriceListRequired } from '@/lib/procurement-db';
import { isUbec } from '@/lib/ubec';

// The state's Procurement price list (UBEC130 part 2, migration 074). GET: Procurement sees every live item (pending and
// approved); everyone else in the state sees the approved items, for the editors' pickers. POST (Procurement, same
// origin): create / update (Data Entry: pending until approved; the Director: approved at once), approve (Director),
// archive (the Director, or Data Entry for an item not approved yet). Lines keep the price they were saved with.
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fields = {
  name: z.string().trim().min(1, 'Enter the item name').max(160),
  maker: z.string().trim().max(120).default(''),
  modelYear: z.number().int().min(1950).max(2100).nullable().default(null),
  description: z.string().trim().max(1000).default(''),
  unitPrice: z.number().positive('Enter a price above ₦0').max(999_999_999_999.99).refine(v => Number.isInteger(Math.round(v * 100)), 'Enter a valid price'),
};
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), ...fields }).strict(),
  z.object({ action: z.literal('update'), id: z.number().int().positive(), ...fields }).strict(),
  z.object({ action: z.literal('approve'), id: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('archive'), id: z.number().int().positive() }).strict(),
]);
type Row = { id: number; name: string; maker: string; model_year: number | null; description: string; unit_price: string; status: ProcurementItem['status']; created_by_name: string; updated_by_name: string; approved_by_name: string | null; approved_at: Date | null; updated_at: Date };
const toItem = (r: Row): ProcurementItem => ({ id: r.id, name: r.name, maker: r.maker, modelYear: r.model_year, description: r.description, unitPrice: Number(r.unit_price), status: r.status, createdByName: r.created_by_name, updatedByName: r.updated_by_name, approvedByName: r.approved_by_name, approvedAt: r.approved_at ? r.approved_at.toISOString() : null, updatedAt: r.updated_at.toISOString() });

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue' }, 401);
    if (isUbec(user.role) || user.role === 'Super Admin') return json({ error: 'The price list belongs to each SUBEB' }, 403);
    const db = getPostgres(), procurement = isProcurement(user);
    const rows = (await db.query<Row>(`SELECT * FROM procurement_items WHERE state_code=$1 AND status ${procurement ? "<>'archived'" : "='approved'"} ORDER BY lower(name), id`, [user.stateCode])).rows;
    return json({ items: rows.map(toItem), canEdit: procurement, canApprove: isProcurementDirector(user), required: await readPriceListRequired(db) });
  } catch (cause) { console.error('Price list read failed', cause); return json({ error: 'Unable to load the price list' }, 503); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return json({ error: 'Sign in to continue' }, 401);
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    if (!isProcurement(user)) return json({ error: 'Only the Procurement department keeps the price list' }, 403);
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Enter the item details' }, 400);
    const input = parsed.data, director = isProcurementDirector(user), db = getPostgres();
    if (input.action === 'create') {
      const row = (await db.query<Row>(`INSERT INTO procurement_items(state_code,name,maker,model_year,description,unit_price,status,created_by,created_by_name,updated_by_name,approved_by_name,approved_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11) RETURNING *`, [user.stateCode, input.name, input.maker, input.modelYear, input.description, input.unitPrice.toFixed(2), director ? 'approved' : 'pending', user.userId, user.name, director ? user.name : null, director ? new Date() : null])).rows[0];
      return json({ item: toItem(row) }, 201);
    }
    const current = (await db.query<Row>("SELECT * FROM procurement_items WHERE id=$1 AND state_code=$2 AND status<>'archived'", [input.id, user.stateCode])).rows[0];
    if (!current) return json({ error: 'Item not found' }, 404);
    if (input.action === 'approve') {
      if (!director) return json({ error: 'Only the Procurement Director approves items' }, 403);
      if (current.status === 'approved') return json({ error: 'This item is already approved' }, 409);
      const row = (await db.query<Row>("UPDATE procurement_items SET status='approved',approved_by_name=$1,approved_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING *", [user.name, current.id])).rows[0];
      return json({ item: toItem(row) });
    }
    if (input.action === 'archive') {
      if (current.status === 'approved' && !director) return json({ error: 'Only the Procurement Director removes approved items' }, 403);
      await db.query("UPDATE procurement_items SET status='archived',updated_by_name=$1,updated_at=NOW() WHERE id=$2", [user.name, current.id]);
      return json({ ok: true });
    }
    // An edit by Data Entry goes back for approval; the Director's edit stays approved. Saved lines keep their price.
    const row = (await db.query<Row>(`UPDATE procurement_items SET name=$1,maker=$2,model_year=$3,description=$4,unit_price=$5,status=$6,updated_by_name=$7,approved_by_name=$8,approved_at=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [input.name, input.maker, input.modelYear, input.description, input.unitPrice.toFixed(2), director ? 'approved' : 'pending', user.name, director ? user.name : null, director ? new Date() : null, current.id])).rows[0];
    return json({ item: toItem(row) });
  } catch (cause) { console.error('Price list write failed', cause); return json({ error: 'Unable to save the price list. Please try again.' }, 503); }
}
