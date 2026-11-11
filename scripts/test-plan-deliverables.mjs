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
// UBEC171: grouped new ECCDE classrooms are counted in classrooms; ungrouped ones as blocks of two (the model writes "blocks").
const eccdeKinds = { kind: 'whole', result: { items: [{ key: 'classroomEccde-construct', quantity: 3, unit: 'classrooms' }] } };
assert.equal(countDeliverables([eccdeKinds]).eccde, 3);
assert.equal(countDeliverables([{ kind: 'whole', result: { items: [{ key: 'classroomEccde-construct', quantity: 2, unit: 'blocks' }] } }]).eccde, 4);
// Provisions (7 November 2026) still count: magnetic boards and handwashing stations keep their quantities.
assert.deepEqual([countDeliverables([{ kind: 'whole', result: { items: [{ key: 'magneticBoard', quantity: 7, total: 0 }, { key: 'handwashing', quantity: 1, total: 0 }] } }])].map(c => [c.equipment, c.water])[0], [7, 1]);
// Not costed items (7 November 2026) still count with their quantities.
assert.equal(countDeliverables([{ kind: 'whole', result: { items: [{ key: 'dualDesk', quantity: 40, total: 0, notCosted: true }] } }]).furniture, 40);
// Block items (7 November 2026): blocks × what one block holds (classrooms or ECCDE rooms, and toilet compartments).
assert.deepEqual((({ classrooms, eccde, toilets, admin }) => [classrooms, eccde, toilets, admin])(countDeliverables([{ kind: 'whole', result: { items: [
  { key: 'block-construct-p6c1o1s4t', quantity: 2, unit: 'blocks', block: { kind: 'construct', classroomType: 'primary', classrooms: 6, offices: 1, stores: 1, toilets: 4 } },
  { key: 'block-renovate-p3c0o0s0t', quantity: 1, unit: 'blocks', block: { kind: 'renovate', classroomType: 'primary', classrooms: 3, offices: 0, stores: 0, toilets: 0 } },
  { key: 'block-construct-e2c0o0s2t', quantity: 1, unit: 'blocks', block: { kind: 'construct', classroomType: 'eccde', classrooms: 2, offices: 0, stores: 0, toilets: 2 } },
  { key: 'block-construct-p0c0o0s6t', quantity: 3, unit: 'blocks', block: { kind: 'construct', classroomType: 'primary', classrooms: 0, offices: 0, stores: 0, toilets: 6 } },
] } }])), [15, 2, 8 + 2 + 18, 0]);
// UBEC252: other facilities in a block (staff room, laboratory) add no classrooms, toilets or admin blocks.
assert.deepEqual((({ classrooms, eccde, toilets, admin }) => [classrooms, eccde, toilets, admin])(countDeliverables([{ kind: 'whole', result: { items: [
  { key: 'block-construct-p6c1o1s4t_staffroom1_scienceLab1', quantity: 2, unit: 'blocks', block: { kind: 'construct', classroomType: 'primary', classrooms: 6, offices: 1, stores: 1, toilets: 4, facilities: { staffroom: 1, scienceLab: 1 } } },
  { key: 'block-construct-p0c0o0s0t_library1', quantity: 1, unit: 'blocks', block: { kind: 'construct', classroomType: 'primary', classrooms: 0, offices: 0, stores: 0, toilets: 0, facilities: { library: 1 } } },
] } }])), [12, 0, 8, 0]);
// Client, 11 November 2026: an admin block inside a block still counts as an admin block (2 blocks × 1).
assert.equal(countDeliverables([{ kind: 'whole', result: { items: [
  { key: 'block-renovate-p2c1o1s0t_adminBlock1', quantity: 2, unit: 'blocks', block: { kind: 'renovate', classroomType: 'primary', classrooms: 2, offices: 1, stores: 1, toilets: 0, facilities: { adminBlock: 1 } } },
] } }]).admin, 2);
const furniture = { kind: 'furniture', result: { items: [{ key: 'furniture-0', quantity: 220 }, { key: 'furniture-1', quantity: 1 }] } };
const small = { kind: 'new', result: { items: [{ key: 'eccdeBlock1', quantity: 1, unit: 'block' }] } };
const older = { kind: 'new', result: { items: [{ key: 'block3os', quantity: 2 }, { key: 'block3', quantity: 2 }] } };

assert.deepEqual(countDeliverables([newConstruction, wholeSchool, furniture, older, small, null, { kind: 'whole', result: null }]), {
  classrooms: 12 + 10 + 12, toilets: 32, furniture: 240 + 221, equipment: 14 + 5, water: 2, fencing: 1, eccde: 2 + 1 + 2 + 1, admin: 1, fenceMetres: 400,
});
assert.deepEqual(countDeliverables([]), { classrooms: 0, toilets: 0, furniture: 0, equipment: 0, water: 0, fencing: 0, eccde: 0, admin: 0, fenceMetres: 0 });
console.log('PASS: plan deliverables summary.');
