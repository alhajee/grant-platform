// UBEC114 deliverables card: counts per heading from saved infrastructure package results (unit test, no server).
// Usage: node scripts/test-plan-deliverables.mjs
import assert from 'node:assert/strict';
import { countDeliverables } from '../lib/plan-deliverables.ts';

const newConstruction = { kind: 'new', result: { items: [
  { key: 'classBlock6', quantity: 2, unit: 'blocks' }, { key: 'eccdeBlock', quantity: 1, unit: 'block' }, { key: 'toilet', quantity: 28 },
  { key: 'dualDesk', quantity: 240 }, { key: 'magneticBoard', quantity: 14 }, { key: 'solarBorehole', quantity: 1 }, { key: 'fence', quantity: 400 },
  { key: 'adminBlock', quantity: 1 }, { key: 'package', quantity: 1 },
] } };
const wholeSchool = { kind: 'whole', result: { items: [
  { key: 'classroomPri-renovate', quantity: 1 }, { key: 'classroomPri-construct', quantity: 9 },
  { key: 'classroomEccde-renovate', quantity: 1, unit: 'classrooms' }, { key: 'classroomEccde-construct', quantity: 1, unit: 'block' },
  { key: 'toilet-construct', quantity: 4 }, { key: 'rwh', quantity: 1 }, { key: 'laptop', quantity: 5 },
] } };
const furniture = { kind: 'furniture', result: { items: [{ key: 'furniture-0', quantity: 220 }, { key: 'furniture-1', quantity: 1 }] } };
const older = { kind: 'new', result: { items: [{ key: 'block3os', quantity: 2 }, { key: 'block3', quantity: 2 }] } };

assert.deepEqual(countDeliverables([newConstruction, wholeSchool, furniture, older, null, { kind: 'whole', result: null }]), {
  classrooms: 12 + 10 + 12, toilets: 32, furniture: 240 + 221, equipment: 14 + 5, water: 2, fencing: 1, eccde: 2 + 1 + 2, admin: 1, fenceMetres: 400,
});
assert.deepEqual(countDeliverables([]), { classrooms: 0, toilets: 0, furniture: 0, equipment: 0, water: 0, fencing: 0, eccde: 0, admin: 0, fenceMetres: 0 });
console.log('PASS: plan deliverables summary.');
