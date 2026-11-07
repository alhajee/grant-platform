// UBEC130 part 2 (migration 074): each state's Procurement price list. Procurement Data Entry adds or edits items
// (pending), the Procurement Director approves them (and adds or edits directly); component Data Entry picks approved
// items on the activities that buy goods and the unit cost must be the list price; a saved line keeps its price when
// the list changes; the Super Admin switch makes the list required for new items to buy.
// UBEC244 (bug sheet 18): items carry the client's fields (Item, Maker and Year optional, Description required, Amount);
// everyone in the state reads the approved list; any activity line (not Teacher Development trainings) and the Sports
// items bought (migration 095) may be picked from it, while the switch still covers only the activities that buy goods.
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
  await user('chairman', 'Executive Chairman', []); await user('tdDes', 'Data Entry Staff', ['teachers']); await user('sportsDes', 'Data Entry Staff', ['academic']);
  assert.deepEqual(ok(await items('chairman')).items.map(i => i.name).sort(), ['Desktop computer', 'Projector'], 'everyone in the state reads the approved list');
  fails(await add('chairman'), 403, /Procurement/);
  step('Procurement keeps the state list: Data Entry items wait for the Director, the Director approves or adds directly, states are separate');

  // UBEC244: the client's columns. Maker and Year are optional, Year is four digits, Description is required.
  fails(await add('procDes', { description: '  ' }), 400, /Enter the description/);
  fails(await add('procDes', { modelYear: 20255 }), 400, /four digits/);
  const vehicle = ok(await add('procDirector', { name: 'Pick up vehicle', maker: 'Toyota', modelYear: 2025, description: 'Toyota Hilux 4WD double cabin', unitPrice: 65707989.25 }), 201).item;
  assert.deepEqual([vehicle.maker, vehicle.modelYear, vehicle.description, vehicle.unitPrice], ['Toyota', 2025, 'Toyota Hilux 4WD double cabin', 65707989.25]);
  const swing = ok(await add('procDes', { name: 'Swing', maker: '', modelYear: null, description: 'Two-seater playground swing', unitPrice: 120000.5 }), 201).item;
  assert.deepEqual([swing.maker, swing.modelYear, swing.status], ['', null, 'pending']);
  ok(await api('procDirector', '/api/procurement/items', { action: 'archive', id: vehicle.id })); ok(await api('procDes', '/api/procurement/items', { action: 'archive', id: swing.id }));
  step('items take Item, Maker and Year (optional, four digits), Description (required) and a four-decimal Amount');

  planId = (await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding,tlm_allocation) VALUES($1,2028,2028,3757.50,0,1000) RETURNING id', [state])).rows[0].id;
  const url = `/api/activities?plan=${planId}&workstream=tlm`;
  const line = { workstream: 'tlm', entity: 'line', action: 'create', activity: 6, description: 'Supplementary readers', quantity: 2, unitCost: 92, strategy: 'NCB', targetGroup: 'Schools' };
  fails(await api('tlmDes', url, { ...line, priceItemId: pending.id, unitCost: 91 }), 409, /price list says/);
  const saved = ok(await api('tlmDes', url, { ...line, priceItemId: pending.id })).id;
  // UBEC244: any activity line may be picked from the list (TLM 3 is not one of the activities that buy goods) ...
  const anyActivity = ok(await api('tlmDes', url, { ...line, activity: 3, priceItemId: direct.id, unitCost: 40 })).id;
  assert.equal(ok(await api('tlmDes', url)).lines.find(l => l.id === anyActivity).priceItemId, direct.id);
  ok(await api('tlmDes', url, { workstream: 'tlm', entity: 'line', action: 'delete', id: anyActivity }));
  // ... but not Teacher Development: its lines are trainings.
  const training = { workstream: 'teachers', entity: 'line', action: 'create', activity: 0, description: 'TD training', quantity: 5, unitCost: 40, trainingProvider: 'Special training provider approved by UBEC', targetParticipants: 'Teachers', schoolLevels: ['Primary'], trainingDays: 5, venueType: 'Hall', schoolIds: [], priceItemId: direct.id };
  fails(await api('tdDes', `/api/activities?plan=${planId}&workstream=teachers`, training), 400, /Trainings do not come from the price list/);
  const foreign = ok(await add('foreignProc', { unitPrice: 5 }), 201).item;
  fails(await api('tlmDes', url, { ...line, priceItemId: foreign.id, unitCost: 5 }), 400, /not on your state/);
  assert.equal(ok(await api('tlmDes', url)).lines.find(l => l.id === saved).priceItemId, pending.id);
  step('an item picked from the list must carry the list price; only approved items of the state; any activity line but Teacher Development trainings');

  ok(await api('procDirector', '/api/procurement/items', { action: 'update', id: pending.id, name: 'Desktop computer', maker: 'HP', modelYear: 2025, description: 'All-in-one, Core i5', unitPrice: 95 }));
  ok(await api('tlmDes', url, { ...line, action: 'update', id: saved, quantity: 3, priceItemId: pending.id, unitCost: 92 }));
  assert.equal((await db.query('SELECT unit_cost::float8 AS c FROM activity_plan_lines WHERE id=$1', [saved])).rows[0].c, 92, 'the saved line keeps its price');
  ok(await api('procDes', '/api/procurement/items', { action: 'update', id: direct.id, name: 'Projector', maker: 'Optoma', modelYear: null, description: 'Short throw projector', unitPrice: 45 }));
  assert.ok(!ok(await items('tlmDes')).items.some(i => i.id === direct.id), 'an edit by Data Entry goes back for approval');
  fails(await api('tlmDes', url, { ...line, priceItemId: direct.id, unitCost: 45 }), 409, /approval/);
  step('a price change does not touch saved lines; an edit by Data Entry goes back for approval');

  // UBEC238: prices and unit costs take four decimals and total exactly; a fifth decimal is refused.
  fails(await add('procDirector', { name: 'Chalk', unitPrice: 1.02025 }), 400, /Use at most four decimal places/);
  const chalk = ok(await add('procDirector', { name: 'Chalk', maker: '', modelYear: null, unitPrice: 1.0202 }), 201).item;
  assert.equal((await db.query('SELECT unit_price::text AS p FROM procurement_items WHERE id=$1', [chalk.id])).rows[0].p, '1.0202');
  const chalkLine = ok(await api('tlmDes', url, { ...line, description: 'Chalk', quantity: 3, priceItemId: chalk.id, unitCost: 1.0202 })).id;
  assert.deepEqual((await db.query('SELECT unit_cost::text AS cost, (quantity*unit_cost)::text AS total FROM activity_plan_lines WHERE id=$1', [chalkLine])).rows[0], { cost: '1.0202', total: '3.0606' });
  assert.equal(ok(await api('tlmDes', url)).lines.find(l => l.id === chalkLine).unitCost, 1.0202);
  fails(await api('tlmDes', url, { ...line, activity: 3, description: 'Visits', unitCost: 1.02025 }), 400, /Use at most four decimal places/);
  ok(await api('tlmDes', url, { workstream: 'tlm', entity: 'line', action: 'delete', id: chalkLine }));
  step('four-decimal prices and unit costs are kept exactly (3 × ₦1.0202 = ₦3.0606); a fifth decimal is refused');

  // UBEC244 (migration 095): Sports items bought may come from the list too, at the list price; PHE training may not.
  const sportsUrl = `/api/sports?plan=${planId}`;
  const ball = ok(await add('procDirector', { name: 'Football', maker: 'Mikasa', modelYear: null, description: 'Size 5 match ball', unitPrice: 25.5 }), 201).item;
  const sportsLine = { entity: 'budget', action: 'create', section: 'equipment', activityType: 'Football', description: 'Match balls', targetGroup: 'Schools', quantity: 2, unitCost: 25.5, priceItemId: ball.id };
  fails(await api('sportsDes', sportsUrl, { ...sportsLine, unitCost: 30 }), 409, /price list says/);
  fails(await api('sportsDes', sportsUrl, { ...sportsLine, priceItemId: direct.id, unitCost: 45 }), 409, /approval/);
  fails(await api('sportsDes', sportsUrl, { ...sportsLine, activityType: 'Training of PHE Officers', description: 'PHE officers trained' }), 400, /Only the items bought/);
  const ballLine = ok(await api('sportsDes', sportsUrl, sportsLine), 201).id;
  assert.equal(ok(await api('sportsDes', sportsUrl)).lines.find(l => l.id === ballLine).priceItemId, ball.id);
  ok(await api('procDirector', '/api/procurement/items', { action: 'update', id: ball.id, name: 'Football', maker: 'Mikasa', modelYear: null, description: 'Size 5 match ball', unitPrice: 27 }));
  ok(await api('sportsDes', sportsUrl, { ...sportsLine, action: 'update', id: ballLine, quantity: 3 }));
  assert.deepEqual((await db.query('SELECT unit_cost::text AS cost, price_item_id AS item FROM sports_budget_lines WHERE id=$1', [ballLine])).rows[0], { cost: '25.5000', item: ball.id }, 'the saved Sports line keeps its price');
  const typedBall = ok(await api('sportsDes', sportsUrl, { ...sportsLine, description: 'Cones', unitCost: 1, priceItemId: null }), 201).id;
  assert.equal((await db.query('SELECT price_item_id FROM sports_budget_lines WHERE id=$1', [typedBall])).rows[0].price_item_id, null);
  step('Sports items bought may be picked from the list at its price and keep it; PHE training lines may not');

  await db.query("UPDATE state_workflow_settings SET price_list_required=TRUE WHERE state_code='GLOBAL'");
  assert.equal(ok(await items('tlmDes')).required, true);
  fails(await api('tlmDes', url, { ...line, unitCost: 10 }), 400, /Pick the item from the Procurement price list/);
  ok(await api('tlmDes', url, { ...line, activity: 3, description: 'Verification visits', unitCost: 10 }));
  const typed = (await db.query("SELECT id FROM activity_plan_lines WHERE plan_id=$1 AND activity=3", [planId])).rows[0].id;
  ok(await api('tlmDes', url, { ...line, action: 'update', id: typed, activity: 3, description: 'Verification visits', quantity: 1, unitCost: 10 }));
  ok(await api('sportsDes', sportsUrl, { ...sportsLine, description: 'Bibs', unitCost: 1, priceItemId: null }), 201);
  step('with the switch on, new items to buy must come from the list; services, Sports and earlier lines are unaffected');
  console.log(`\nPASS: ${passed} price list checks`);
} finally {
  await db.query("UPDATE state_workflow_settings SET price_list_required=$1 WHERE state_code='GLOBAL'", [setting ?? false]);
  if (planId) { await db.query('DELETE FROM sports_budget_lines WHERE plan_id=$1', [planId]); await db.query('DELETE FROM activity_plan_lines WHERE plan_id=$1', [planId]); await db.query('DELETE FROM action_plans WHERE id=$1', [planId]); }
  await db.query('DELETE FROM procurement_items WHERE state_code=ANY($1::text[])', [[state, other]]);
  const ids = Object.values(users);
  if (ids.length) { await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM user_departments WHERE user_id=ANY($1::int[])', [ids]); await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]); }
  await db.end();
}
