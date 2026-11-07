// UBEC189/195: which items UBEC rejected are still uncorrected (unchanged) in the working plan, and which were corrected
// before resubmitting. A change to any figure, detail, school or document, or removing the item, counts as corrected;
// saving without a change (updated_at, client key) does not. Unit test, no server.
// Usage: node scripts/test-ubec-corrections.mjs
import assert from 'node:assert/strict';
import { correctedItems, openRejections, rejectionProblem } from '../lib/ubec-corrections.ts';

const line = (id, extra = {}) => ({ id, activity: 0, description: `Item ${id}`, quantity: 1, unit_cost: '100.00', updated_at: '2026-10-01', documents: [], ...extra });
const snapshot = (monitoring, extra = {}) => ({ infrastructure: [], sports: [], monitoring, ...extra });
const returned = snapshot([line(1), line(2), line(3), line(4)]);
const rejected = [1, 2, 3, 4].map(id => ({ pillar: 'monitoring', rowRef: String(id) }));

// 1 untouched, 2 re-saved without a change, 3 changed, 4 removed.
const current = snapshot([line(1), line(2, { updated_at: '2026-10-28', client_key: 'x' }), line(3, { unit_cost: '90.00' })]);
assert.deepEqual(openRejections(returned, current, rejected), { monitoring: ['1', '2'] });
assert.deepEqual(correctedItems(returned, current, rejected), { monitoring: ['3'] });
// A new document counts as a correction too.
assert.deepEqual(openRejections(returned, snapshot([line(1, { documents: [{ id: 'd1', name: 'quote.pdf' }] }), line(2)]), rejected), { monitoring: ['2'] });
assert.match(rejectionProblem('Supervision & Monitoring', ['1', '2']), /^Correct the 2 items UBEC rejected in Supervision & Monitoring first: change or remove them/);
assert.equal(rejectionProblem('Sports', []), null);
// Infrastructure: a package counts as corrected when its input, total or school documents change.
const pkg = (total, docs = []) => snapshot([], { infrastructure: [{ id: -5, quantity: 1, unit_cost: String(total), school: { id: 9 }, package: { input: { lumpSum: total }, total_cost: String(total), updated_at: 'x' } }], infrastructureDocuments: docs });
const infraRejected = [{ pillar: 'infrastructure', rowRef: '-5' }];
assert.deepEqual(openRejections(pkg(1000), pkg(1000), infraRejected), { infrastructure: ['-5'] });
assert.deepEqual(openRejections(pkg(1000), pkg(1000, [{ id: 'b', kind: 'boq', schoolId: 9 }]), infraRejected), {});
assert.deepEqual(correctedItems(pkg(1000), pkg(900), infraRejected), { infrastructure: ['-5'] });
// UBEC238: rounds returned before migration 093 read '100.00', the widened working plan '100.0000': the same amount, not a correction.
assert.deepEqual(openRejections(returned, snapshot([line(1, { unit_cost: '100.0000' }), line(2), line(3), line(4)]), rejected), { monitoring: ['1', '2', '3', '4'] });
assert.deepEqual(openRejections(returned, snapshot([line(1, { unit_cost: '100.0202' })]), rejected), {}, 'a four-decimal change is a correction');
const pkgAt = amount => snapshot([], { infrastructure: [{ id: -5, quantity: 1, unit_cost: amount, school: { id: 9 }, package: { input: { lumpSum: 1000 }, total_cost: amount } }] });
assert.deepEqual(openRejections(pkgAt('1000.00'), pkgAt('1000.0000'), infraRejected), { infrastructure: ['-5'] });
// UBEC244 (migration 095): an empty price-list item on a Sports line equals its absence in an older round; a picked one is a change.
const ball = extra => snapshot([], { sports: [{ id: 7, section: 'equipment', unit_cost: '25.50', quantity: 2, ...extra }] }), sportsRejected = [{ pillar: 'sports', rowRef: '7' }];
assert.deepEqual(openRejections(ball({}), ball({ price_item_id: null }), sportsRejected), { sports: ['7'] });
assert.deepEqual(openRejections(ball({}), ball({ price_item_id: 4 }), sportsRejected), {});
console.log('PASS: UBEC corrections (open rejections, corrected items, infrastructure documents, money read at four decimals, Sports price-list items)');
