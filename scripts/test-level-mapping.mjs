// UBEC127 spending by school level: how each line's amount is shared across ECCDE, Primary, JSS and not school-specific
// (unit test, no server). Usage: node scripts/test-level-mapping.mjs
import assert from 'node:assert/strict';
import { levelMapping, levelOf, sumMappings } from '../lib/level-mapping.ts';
import { eccdeShare, eccdeShareProblem } from '../lib/eccde-share.ts';

const school = level => ({ name: `${level} school`, lga: 'Damaturu', level, location: 'Urban' });
const line = (unit_cost, quantity = 1, extra = {}) => ({ id: 1, unit_cost: String(unit_cost), quantity, ...extra });
const snapshot = {
  infrastructure: [line(1000, 1, { school: school('Primary') }), line(500, 1, { school: school('ECCDE') })],
  sports: [line(100, 4, { allocations: [{ quantity: 2, school: school('JSS') }, { quantity: 1, school: school('Primary') }] })],
  ict: [line(300, 1, { schools: [school('Primary'), school('JSS'), school('JSS')] })],
  tlm: [line(900, 1, { textbook_classes: ['Primary 1', 'Primary 2', 'JSS 1'] }), line(200, 1, { activity: 6 }), line(50, 1, { activity: 1 })],
  tlmDistribution: [school('Primary'), school('ECCDE')],
  teachers: [line(400, 1, { school_levels: ['ECCDE', 'SUBEB'] })],
  planning: [line(250, 1)],
  curriculum: [line(70, 1)],
};
const m = levelMapping(snapshot);
// Infrastructure 1000 Primary + 500 ECCDE; Sports 400: 200 JSS, 100 Primary, 100 unallocated; ICT 300: 100 Primary, 200 JSS;
// Textbooks 900: 600 Primary, 300 JSS; other TLM 200 by its list: 100 Primary, 100 ECCDE; Teacher Development 400: 200 ECCDE,
// 200 SUBEB; Planning 250 and Curriculum without a list 70: not school-specific; TLM training 50 (not shared out to schools,
// UBEC245): Others, not the list.
assert.deepEqual(m, { eccde: 800, primary: 1900, jss: 700, none: 670, total: 4070 });
assert.equal(m.eccde + m.primary + m.jss + m.none, m.total, 'the parts add up to the plan total');
const odd = levelMapping({ infrastructure: [], sports: [], ict: [line(0.1, 1, { schools: [school('Primary'), school('JSS'), school('ECCDE')] })] });
assert.equal(Math.round((odd.eccde + odd.primary + odd.jss) * 100), 10, 'whole kobo, nothing lost to rounding');
assert.equal(levelOf('SSS'), 'none'); assert.equal(levelOf('JSS 3'), 'jss'); assert.equal(levelOf('Pre-primary'), 'eccde');
assert.deepEqual(sumMappings([m, m]), { eccde: 1600, primary: 3800, jss: 1400, none: 1340, total: 8140 });
assert.deepEqual(levelMapping({ infrastructure: [], sports: [] }), { eccde: 0, primary: 0, jss: 0, none: 0, total: 0 });
// UBEC231: a line with no schools, classes or list follows the school levels named in its target groups.
const groups = levelMapping({ infrastructure: [], sports: [], monitoring: [line(100, 1, { target_group: 'ECCDE Learners' }), line(90, 1, { target_group: 'ECCDE Learners and Teachers, Primary School Learners, Teachers' }), line(50, 1, { target_group: 'Schools, Teachers' })], curriculum: [line(40, 1, { target_group: 'JSS Learners' })] });
assert.deepEqual(groups, { eccde: 145, primary: 45, jss: 40, none: 50, total: 280 });
// A distribution list still comes first.
assert.equal(levelMapping({ infrastructure: [], sports: [], tlm: [line(100, 1, { activity: 6, target_group: 'ECCDE Learners' })], tlmDistribution: [school('Primary')] }).primary, 100);
// UBEC245: an item not shared out to schools (TLM training) ignores the list: target groups, else Others.
assert.equal(levelMapping({ infrastructure: [], sports: [], tlm: [line(100, 1, { activity: 1, target_group: 'ECCDE Learners' })], tlmDistribution: [school('Primary')] }).eccde, 100);
assert.equal(levelMapping({ infrastructure: [], sports: [], gscci: [line(100, 1, { activity: 3, target_group: 'Communities' })], gscciDistribution: [school('Primary')] }).none, 100);
// UBEC254: Infrastructure. Items plainly for ECCDE count as ECCDE by their own amounts; the rest of the package follows the
// levels its target groups name, else the school's level.
const pkg = (kind, items, extra = {}) => ({ kind, result: { items }, ...extra });
const item = (key, total, extra = {}) => ({ key, total, ...extra });
const whole = line(1000, 1, { school: school('Primary'), target_group: 'Schools', package: pkg('whole', [
  item('classroomEccde-construct', 200), item('classroomEccde-renovate', 50), item('eccdeFurniture', 30), item('playEquipment', 20), item('kgBed', 10),
  item('block-construct-e2c0o0s0t', 100, { block: { classroomType: 'eccde' } }), item('block-construct-p3c1o1s4t', 300, { block: { classroomType: 'primary' } }),
  item('classroomPri-construct', 250), item('magneticBoard', 0, { notCosted: true }), item('dualDesk', 40)]) });
assert.deepEqual(levelMapping({ infrastructure: [whole], sports: [] }), { eccde: 410, primary: 590, jss: 0, none: 0, total: 1000 }, 'ECCDE items as ECCDE, the rest by the school (Schools names no level)');
assert.deepEqual(levelMapping({ infrastructure: [{ ...whole, target_group: 'Primary School Learners, JSS Learners' }], sports: [] }), { eccde: 410, primary: 295, jss: 295, none: 0, total: 1000 }, 'the rest follows the levels the target groups name');
// A lump-sum New Construction package has no per-item amounts (its ECCDE block is ₦0 inside the package): all of it by target groups.
const lump = line(900, 1, { school: school('Primary'), target_group: 'ECCDE Learners, Primary School Learners, Teachers', package: pkg('new', [item('eccdeBlock', 0), item('classBlock6', 0), item('package', 900)]) });
assert.deepEqual(levelMapping({ infrastructure: [lump], sports: [] }), { eccde: 450, primary: 450, jss: 0, none: 0, total: 900 });
assert.equal(levelMapping({ infrastructure: [{ ...lump, target_group: 'Teachers' }], sports: [] }).primary, 900, 'no level named: the school level');
// HOPE-costed New Construction: the ECCDE block has its own amount; Small School's 1-classroom block too.
assert.equal(levelMapping({ infrastructure: [line(500, 1, { school: school('JSS'), package: pkg('new', [item('eccdeBlock1', 120), item('classBlock6', 380)]) })], sports: [] }).eccde, 120);
// Older snapshots: no target group and no package behave as before (the school's level).
assert.deepEqual(levelMapping({ infrastructure: [line(300, 1, { school: school('JSS') })], sports: [] }), { eccde: 0, primary: 0, jss: 300, none: 0, total: 300 });
// The ECCDE items never count for more than the package.
assert.equal(levelMapping({ infrastructure: [line(100, 1, { school: school('Primary'), package: pkg('whole', [item('classroomEccde-construct', 250)]) })], sports: [] }).eccde, 100);
// UBEC254 client answers (11 November 2026): classrooms, furniture and toilets split by the school's enrolment at the named
// levels; shared parts (fence, water, VAT…) follow the school's level.
const enrolled = { ...school('Primary'), enrolmentByClass: { ECCDE: { male: 30, female: 30 }, P1: { male: 90, female: 90 } } };
const mixed = line(1000, 1, { school: enrolled, target_group: 'ECCDE Learners, Primary School Learners', package: pkg('whole', [
  item('classroomEccde-construct', 100), item('classroomPri-renovate', 400), item('toilet-renovate', 200), item('fence', 150), item('solarBorehole', 50)]) });
// ECCDE 100; learner items 600 split 60:180 → 150 ECCDE, 450 Primary; shared 300 (fence, borehole, VAT 100) → Primary.
assert.deepEqual(levelMapping({ infrastructure: [mixed], sports: [] }), { eccde: 250, primary: 750, jss: 0, none: 0, total: 1000 });
assert.deepEqual(levelMapping({ infrastructure: [{ ...mixed, school: school('JSS'), target_group: 'Primary School Learners' }], sports: [] }), { eccde: 100, primary: 600, jss: 300, none: 0, total: 1000 }, 'shared parts follow the school level, not the target groups');
assert.deepEqual(levelMapping({ infrastructure: [{ ...lump, school: enrolled }], sports: [] }), { eccde: 225, primary: 675, jss: 0, none: 0, total: 900 }, 'a lump-sum package by enrolment at the named levels');
// UBEC231: the 15% ECCDE rule.
assert.equal(eccdeShareProblem({ infrastructure: [], sports: [] }), null, 'nothing proposed: nothing to check');
assert.equal(eccdeShareProblem({ infrastructure: [], sports: [], monitoring: [line(15, 1, { target_group: 'ECCDE Learners' }), line(85, 1)] }), null, 'exactly 15% passes');
const short = eccdeShare({ infrastructure: [], sports: [], monitoring: [line(14.99, 1, { target_group: 'ECCDE Learners' }), line(85.01, 1)] });
assert.equal(short.met, false); assert.equal(short.shortMinor, 100, 'one kobo short, in minor units (1/10,000 naira)'); assert.equal(short.percent, 14.9);
assert.match(eccdeShareProblem({ infrastructure: [], sports: [], monitoring: [line(100, 1, { target_group: 'ECCDE Learners' }), line(900, 1)] }), /^ECCDE must be at least 15% of the plan before it goes to the Executive Chairman: it is ₦100\.0000 \(10%\), ₦50\.0000 short\./);
console.log('PASS: spending by school level');
