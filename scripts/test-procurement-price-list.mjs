// UBEC130 part 2 (migration 074): each state's Procurement price list. Procurement Data Entry adds or edits items
// (pending), the Procurement Director approves them (and adds or edits directly); component Data Entry picks approved
// items on the activities that buy goods and the unit cost must be the list price; a saved line keeps its price when
// the list changes; the Super Admin switch makes the list required for new items to buy.
// Usage: node --env-file=.env scripts/test-procurement-price-list.mjs [baseUrl]   (local only; throwaway states, users and plan; cleans up)
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const state = `PL${randomUUID().slice(0, 6).toUpperCase()}`, other = `${state}B`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = {};
let planId, setting, passed = 0;
const step = message => { passed++; console.log('✓', message); };

async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fails = (r, status, pattern) => { assert.equal(r.status, status, JSON.stringify(r.data)); if (pattern) assert.match(r.data.error ?? '', pattern); return r.data; };
async function user(who, role, departments, code = state) {
  const email = `${who}.${state}@price.test`.toLowerCase();
  users[who] = (await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [email, `QA ${who}`, role, departments[0] ?? null, code, hashSync(password, 4)])).rows[0].id;
  for (const department of departments) await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)', [users[who], department]);
  ok(await api(who, '/api/auth/login', { email, password }));
}
const items = who => api(who, '/api/procurement/items');
const add = (who, extra = {}) => api(who, '/api/procurement/items', { action: 'create', name: 'Desktop computer', maker: 'HP', modelYear: 2025, description: 'All-in-one, Core i5', unitPrice: 92, ...extra });

await db.connect();
try {
  setting = (await db.query("SELECT price_list_required FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.price_list_required ?? false;
  await db.query("UPDATE state_workflow_settings SET price_list_required=FALSE WHERE state_code='GLOBAL'");
  await user('procDes', 'Data Entry Staff', ['procurement']); await user('procDirector', 'Director', ['procurement']);
  await user('tlmDes', 'Data Entry Staff', ['academic']); await user('foreignProc', 'Director', ['procurement'], other);

  // Price list: Data Entry's items wait for the Director; the Director's are approved at once; each state has its own.
  fails(await add('tlmDes'), 403);
  const pending = ok(await add('procDes'), 201).item;
  assert.equal(pending.status, 'pending');
  assert.equal(ok(await items('tlmDes')).items.length, 0, 'component Data Entry sees approved items only');
  fails(await api('procDes', '/api/procurement/items', { action: 'approve', id: pending.id }), 403, /Director/);
  ok(await api('procDirector', '/api/procurement/items', { action: 'approve', id: pending.id }));
  const direct = ok(await add('procDirector', { name: 'Projector', maker: 'Optoma', modelYear: null, unitPrice: 40 }), 201).item;
  assert.equal(direct.status, 'approved');
  assert.deepEqual(ok(await items('tlmDes')).items.map(i => i.name).sort(), ['Desktop computer', 'Projector']);
  assert.equal(ok(await items('foreignProc')).items.length, 0, 'another state has its own list');
  fails(await api('foreignProc', '/api/procurement/items', { action: 'approve', id: pending.id }), 404);
  fails(await add('procDes', { unitPrice: 0 }), 400);
  step('Procurement keeps the state list: Data Entry items wait for the Director, the Director approves or adds directly, states are separate');

  planId = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding,tlm_allocation) VALUES($1,2028,2028,3757.50,0,1000) RETURNING id', [state])).rows[0].id;
  const url = `/api/activities?plan=${planId}&workstream=tlm`;
  const line = { workstream: 'tlm', entity: 'line', action: 'create', activity: 6, description: 'Supplementary readers', quantity: 2, unitCost: 92, strategy: 'NCB', targetGroup: 'Schools' };
  fails(await api('tlmDes', url, { ...line, priceItemId: pending.id, unitCost: 91 }), 409, /price list says/);
  const saved = ok(await api('tlmDes', url, { ...line, priceItemId: pending.id })).id;
  fails(await api('tlmDes', url, { ...line, activity: 3, priceItemId: direct.id, unitCost: 40 }), 400, /Only items to buy/);
  const foreign = ok(await add('foreignProc', { unitPrice: 5 }), 201).item;
  fails(await api('tlmDes', url, { ...line, priceItemId: foreign.id, unitCost: 5 }), 400, /not on your state/);
  assert.equal(ok(await api('tlmDes', url)).lines.find(l => l.id === saved).priceItemId, pending.id);
  step('an item to buy picked from the list must carry the list price; only approved items of the state, only on activities that buy goods');

  ok(await api('procDirector', '/api/procurement/items', { action: 'update', id: pending.id, name: 'Desktop computer', maker: 'HP', modelYear: 2025, description: 'All-in-one, Core i5', unitPrice: 95 }));
  ok(await api('tlmDes', url, { ...line, action: 'update', id: saved, quantity: 3, priceItemId: pending.id, unitCost: 92 }));
  assert.equal((await db.query('SELECT unit_cost::float8 AS c FROM activity_plan_lines WHERE id=$1', [saved])).rows[0].c, 92, 'the saved line keeps its price');
  ok(await api('procDes', '/api/procurement/items', { action: 'update', id: direct.id, name: 'Projector', maker: 'Optoma', modelYear: null, description: '', unitPrice: 45 }));
  assert.ok(!ok(await items('tlmDes')).items.some(i => i.id === direct.id), 'an edit by Data Entry goes back for approval');
  fails(await api('tlmDes', url, { ...line, priceItemId: direct.id, unitCost: 45 }), 409, /approval/);
  step('a price change does not touch saved lines; an edit by Data Entry goes back for approval');

  await db.query("UPDATE state_workflow_settings SET price_list_required=TRUE WHERE state_code='GLOBAL'");
  assert.equal(ok(await items('tlmDes')).required, true);
  fails(await api('tlmDes', url, { ...line, unitCost: 10 }), 400, /Pick the item from the Procurement price list/);
  ok(await api('tlmDes', url, { ...line, activity: 3, description: 'Verification visits', unitCost: 10 }));
  const typed = (await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND activity=3", [planId])).rows[0].id;
  ok(await api('tlmDes', url, { ...line, action: 'update', id: typed, activity: 3, description: 'Verification visits', quantity: 1, unitCost: 10 }));
  step('with the switch on, new items to buy must come from the list; services and earlier lines are unaffected');
  console.log(`\nPASS: ${passed} price list checks`);
} finally {
  await db.query("UPDATE state_workflow_settings SET price_list_required=$1 WHERE state_code='GLOBAL'", [setting ?? false]);
  if (planId) { await db.query('DELETE FROM activity_plan_lines WHERE plan_id=$1', [planId]); await db.query('DELETE FROM action_plans WHERE id=$1', [planId]); }
  await db.query('DELETE FROM procurement_items WHERE state_code=ANY($1::text[])', [[state, other]]);
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
