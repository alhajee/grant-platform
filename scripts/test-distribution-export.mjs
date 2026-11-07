// UBEC245/UBEC246: Greening communities is not shared out to schools, and the workbook download lists each distribution
// school's items and quantities, one row per school per item (unit test, no server).
// Usage: node scripts/test-distribution-export.mjs
import assert from 'node:assert/strict';
import { distributionItemRows } from '../lib/distribution-export.ts';
import { distributionListProblem, distributionListRequired, isDistributedLine, distributionAllocationProblem } from '../lib/distribution-lists.ts';

// UBEC245: Greening 3 ("GSCCI Pillar 4: Greening communities") is no longer an item for schools; the other pillars are.
assert.equal(isDistributedLine('gscci', 3), false);
for (const activity of [0, 1, 2, 4, 5, 6, 7]) assert.equal(isDistributedLine('gscci', activity), true, `Greening ${activity}`);
assert.equal(isDistributedLine('gscci', 8), false);
// The Greening list is needed only with an item for schools; TLM and Curriculum need theirs with any item.
assert.equal(distributionListRequired('gscci', [{ activity: 3 }, { activity: 8 }]), false);
assert.equal(distributionListRequired('gscci', [{ activity: 3 }, { activity: 0 }]), true);
assert.equal(distributionListRequired('curriculum', [{ activity: 1 }]), false); // UBEC245: training only, no list
assert.equal(distributionListRequired('curriculum', [{ activity: 0 }]), true);
assert.equal(distributionListRequired('sbmc', [{ activity: 0 }]), false);
assert.equal(distributionListProblem('gscci', [{ activity: 3 }], []), null);
assert.equal(distributionListProblem('gscci', [{ activity: 3 }, { activity: 5 }], []), 'Add at least one school to the Greening distribution list before sending it');
assert.equal(distributionListProblem('gscci', [{ activity: 5 }], [{ id: 1 }]), null);
assert.equal(distributionListProblem('tlm', [{ activity: 5 }], undefined), 'Add at least one school to the TLM distribution list before sending it');
assert.equal(distributionListProblem('tlm', [{ activity: 2 }], undefined), null); // UBEC245: nothing for schools, no list
// Allocations left on a Greening communities line never count: the list's schools need items only from items for schools.
const list = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
assert.equal(distributionAllocationProblem('gscci', [{ activity: 3, quantity: 5, schools: [{ id: 1, quantity: 2 }] }], list, true), null, 'only Pillar 4 items: nothing to share');
assert.match(distributionAllocationProblem('gscci', [{ activity: 3, quantity: 5, schools: [{ id: 2, quantity: 5 }] }, { activity: 0, quantity: 4, schools: [{ id: 1, quantity: 4 }] }], list, true), /^B has no Greening items allocated/);
console.log('✓ Greening communities is not shared out; the Greening list is required only with items for schools (UBEC245)');

// UBEC246: one row per school per item, in the list's order, each school's items in line order; zero quantities left out.
const schools = [
  { id: 20, name: 'Zuba Primary', lga: 'Gwagwalada', level: 'Primary', code: '1234567890' },
  { id: 10, name: 'Abaji JSS', lga: 'Abaji', level: 'JSS', code: null },
];
const lines = [
  { id: 1, activity: 0, description: 'Mathematics textbooks', code: 'UBEC/SUBEB/TLM/001/2027 · Q1–Q4', unit_cost: '1250.0202', schools: [{ id: 10, quantity: 3 }, { id: 20, quantity: 7 }] },
  { id: 2, activity: 1, description: 'Teacher training', code: 'UBEC/SUBEB/TLM/002/2027', unit_cost: '500', schools: [{ id: 20, quantity: 4 }] },
  { id: 3, activity: 5, description: '', code: 'UBEC/SUBEB/TLM/003/2027', unit_cost: '10', schools: [{ id: 20, quantity: 2 }, { id: 10, quantity: 0 }] },
];
const rows = distributionItemRows('tlm', schools, lines, true);
assert.deepEqual(rows.map(r => [r.school, r.item, r.quantity]), [
  ['Zuba Primary', 'Mathematics textbooks', 7],
  ['Zuba Primary', distributionItemRows('tlm', schools, [{ ...lines[2] }], true)[0].activity, 2],
  ['Abaji JSS', 'Mathematics textbooks', 3],
], 'training (not an item for schools) is left out; a blank description falls back to the activity');
const first = rows[0];
assert.equal(first.code, '1234567890'); assert.equal(first.lga, 'Gwagwalada'); assert.equal(first.level, 'Primary');
assert.equal(first.itemCode, 'UBEC/SUBEB/TLM/001/2027', 'the quarters of older codes are hidden');
assert.equal(first.unitCost, 1250.0202);
assert.equal(first.value, 8750.1414, 'exact quantity × unit cost to four decimals');
assert.equal(rows[2].code, '', 'no DNEMIS code: blank');
assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'row ids are unique');
// Totals per school add up to the per-school sheet's figures.
assert.equal(rows.filter(r => r.school === 'Zuba Primary').reduce((sum, r) => sum + r.quantity, 0), 9);
// Greening: a Pillar 4 line is never listed, even with allocations saved before UBEC245; the Item names the purchase.
const greening = distributionItemRows('gscci', schools, [
  { id: 7, activity: 3, description: 'Community trees', unit_cost: '100', schools: [{ id: 10, quantity: 5 }] },
  { id: 8, activity: 0, description: '', item: 'Tree seedlings', unit_cost: '100', schools: [{ id: 10, quantity: 5 }] },
], true);
assert.deepEqual(greening.map(r => [r.school, r.item, r.quantity, r.value]), [['Abaji JSS', 'Tree seedlings', 5, 500]]);
// Snapshots from before the allocations keep their earlier output (no item rows).
assert.deepEqual(distributionItemRows('tlm', schools, lines, false), []);
console.log('✓ the download lists each school\'s items, quantities, unit costs and values, one row per school per item (UBEC246)');
