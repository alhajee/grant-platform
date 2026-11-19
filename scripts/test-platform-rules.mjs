// Requirements and approval letter images (migration 105): the rules' defaults and switches (unit), the Super Admin's
// rules API, and letterhead/signature uploads with a sample letter. Restores the rules and removes what it uploads.
// Usage: node --env-file=.env scripts/test-platform-rules.mjs [baseUrl]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';
import { defaultPlatformRules, withRuleDefaults } from '../lib/platform-rules.ts';
import { lineDocumentSlots, missingLineDocument, slotRequired } from '../lib/activity-extras.ts';
import { eccdeShare } from '../lib/eccde-share.ts';

const step = message => console.log('✓', message);

// Unit: defaults, stored values and bad values.
assert.deepEqual(withRuleDefaults(null), defaultPlatformRules);
assert.equal(withRuleDefaults({ boqRequired: false, eccdePercent: 20, validationReportRequired: 'yes', extra: 1 }).boqRequired, false);
assert.equal(withRuleDefaults({ eccdePercent: 20 }).eccdePercent, 20);
assert.equal(withRuleDefaults({ eccdePercent: 0 }).eccdePercent, 15);
assert.equal(withRuleDefaults({ validationReportRequired: 'yes' }).validationReportRequired, false);
step('rules keep their defaults unless a valid value is stored');

const [proforma] = lineDocumentSlots('quality', 0);
assert.equal(proforma.kind, 'proforma');
assert.equal(slotRequired(proforma, false), true);
assert.equal(slotRequired(proforma, false, { proformaRequired: false }), false);
assert.equal(slotRequired(proforma, true, { proformaRequired: false }), true, 'off: it follows the Supporting documents setting');
assert.equal(missingLineDocument('teachers', 0, [], false)?.kind, 'budget');
assert.equal(missingLineDocument('teachers', 0, [], false, { teacherDocumentsRequired: false }), null);
step('proforma and Teacher Development documents follow their switches, else the Supporting documents setting');

const snapshot = { infrastructure: [], tlm: [], sbmc: [{ id: 1, activity: 0, quantity: 1, unit_cost: '100', target_group: 'ECCDE learners' }, { id: 2, activity: 0, quantity: 4, unit_cost: '100', target_group: 'Primary learners' }] };
assert.equal(eccdeShare(snapshot).required, 15);
assert.equal(eccdeShare(snapshot, 25).required, 25);
step('the ECCDE share takes the configured percentage');

// API.
const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'Run this test against a local server only.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'Use a local database only.');
const marker = `PR${randomUUID().slice(0, 8)}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, users = [];
async function api(who, path, body, method = body ? 'POST' : 'GET') {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const type = response.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await response.json() : { bytes: new Uint8Array(await response.arrayBuffer()) };
  if (path === '/api/auth/login' && response.ok) cookies[who] = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data, type };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
async function user(who, role) {
  const email = `${who}.${marker}@rules.test`.toLowerCase();
  users.push((await db.query("INSERT INTO users(email,full_name,role,state_code,password_hash) VALUES($1,$2,$3,'ADMIN',$4) RETURNING id", [email, `QA ${who}`, role, hashSync(password, 4)])).rows[0].id);
  ok(await api(who, '/api/auth/login', { email, password }));
}
// A 1×1 PNG and a tiny JPEG header (enough for the type check; the JPEG is only uploaded, never drawn).
function png() {
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}
const form = (kind, bytes, name) => { const f = new FormData(); f.set('kind', kind); f.set('file', new File([bytes], name)); return f; };

await db.connect();
const before = (await db.query("SELECT platform_rules AS r FROM state_workflow_settings WHERE state_code='GLOBAL'")).rows[0]?.r ?? {};
const uploaded = [];
try {
  await user('admin', 'Super Admin'); await user('ec', 'Executive Chairman');
  assert.equal((await api('ec', '/api/admin/rules')).status, 403);
  assert.equal((await api('admin', '/api/admin/rules', { eccdePercent: 12.3 }, 'PUT')).status, 400);
  assert.equal((await api('admin', '/api/admin/rules', { unknown: true }, 'PUT')).status, 400);
  const saved = ok(await api('admin', '/api/admin/rules', { boqRequired: false, eccdePercent: 20 }, 'PUT')).rules;
  assert.equal(saved.boqRequired, false); assert.equal(saved.eccdePercent, 20); assert.equal(saved.drawingsRequired, before.drawingsRequired ?? true);
  assert.equal(ok(await api('admin', '/api/admin/rules')).rules.eccdePercent, 20);
  step('only the Super Admin reads and changes the rules; a change merges into the rest');

  assert.equal((await api('ec', '/api/admin/letter-assets')).status, 403);
  assert.equal((await api('admin', '/api/admin/letter-assets', form('letterhead', Buffer.from('not an image'), 'x.png'))).status, 400);
  assert.equal((await api('admin', '/api/admin/letter-assets', form('signature', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'sig.jpg'))).status, 400);
  const head = ok(await api('admin', '/api/admin/letter-assets', form('letterhead', png(), 'letterhead.png')), 201); uploaded.push(head.id);
  const sig = ok(await api('admin', '/api/admin/letter-assets', form('signature', png(), 'signature.png')), 201); uploaded.push(sig.id);
  assert.ok(sig.assets.find(a => a.id === sig.id)?.current && sig.assets.find(a => a.id === head.id)?.current);
  const preview = await api('admin', '/api/admin/letter-assets?preview=1');
  assert.equal(preview.status, 200); assert.match(preview.type, /application\/pdf/); assert.equal(Buffer.from(preview.data.bytes.slice(0, 5)).toString(), '%PDF-');
  const image = await api('admin', `/api/admin/letter-assets?id=${sig.id}`); assert.match(image.type, /image\/png/);
  const after = ok(await api('admin', '/api/admin/letter-assets', { id: sig.id }, 'DELETE'));
  assert.ok(!after.assets.some(a => a.id === sig.id));
  step('PNG/JPEG letterheads and PNG signatures upload, the sample letter uses them, removal takes one out of use');
  console.log('PASS: Requirements and approval letter images.');
} finally {
  await db.query("UPDATE state_workflow_settings SET platform_rules=$1::jsonb WHERE state_code='GLOBAL'", [JSON.stringify(before)]);
  if (uploaded.length) await db.query('DELETE FROM letter_assets WHERE id=ANY($1::int[])', [uploaded]);
  if (users.length) await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]);
  await db.end();
}
