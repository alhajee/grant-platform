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
  tlm: [line(900, 1, { textbook_classes: ['Primary 1', 'Primary 2', 'JSS 1'] }), line(200, 1)],
  tlmDistribution: [school('Primary'), school('ECCDE')],
  teachers: [line(400, 1, { school_levels: ['ECCDE', 'SUBEB'] })],
  planning: [line(250, 1)],
  curriculum: [line(70, 1)],
};
const m = levelMapping(snapshot);
// Infrastructure 1000 Primary + 500 ECCDE; Sports 400: 200 JSS, 100 Primary, 100 unallocated; ICT 300: 100 Primary, 200 JSS;
// Textbooks 900: 600 Primary, 300 JSS; other TLM 200 by its list: 100 Primary, 100 ECCDE; Teacher Development 400: 200 ECCDE,
// 200 SUBEB; Planning 250 and Curriculum without a list 70: not school-specific.
assert.deepEqual(m, { eccde: 800, primary: 1900, jss: 700, none: 620, total: 4020 });
assert.equal(m.eccde + m.primary + m.jss + m.none, m.total, 'the parts add up to the plan total');
const odd = levelMapping({ infrastructure: [], sports: [], ict: [line(0.1, 1, { schools: [school('Primary'), school('JSS'), school('ECCDE')] })] });
assert.equal(Math.round((odd.eccde + odd.primary + odd.jss) * 100), 10, 'whole kobo, nothing lost to rounding');
assert.equal(levelOf('SSS'), 'none'); assert.equal(levelOf('JSS 3'), 'jss'); assert.equal(levelOf('Pre-primary'), 'eccde');
assert.deepEqual(sumMappings([m, m]), { eccde: 1600, primary: 3800, jss: 1400, none: 1240, total: 8040 });
assert.deepEqual(levelMapping({ infrastructure: [], sports: [] }), { eccde: 0, primary: 0, jss: 0, none: 0, total: 0 });
// UBEC231: a line with no schools, classes or list follows the school levels named in its target groups.
const groups = levelMapping({ infrastructure: [], sports: [], monitoring: [line(100, 1, { target_group: 'ECCDE Learners' }), line(90, 1, { target_group: 'ECCDE Learners and Teachers, Primary School Learners, Teachers' }), line(50, 1, { target_group: 'Schools, Teachers' })], curriculum: [line(40, 1, { target_group: 'JSS Learners' })] });
assert.deepEqual(groups, { eccde: 145, primary: 45, jss: 40, none: 50, total: 280 });
// A distribution list still comes first.
assert.equal(levelMapping({ infrastructure: [], sports: [], tlm: [line(100, 1, { target_group: 'ECCDE Learners' })], tlmDistribution: [school('Primary')] }).primary, 100);
// UBEC231: the 15% ECCDE rule.
assert.equal(eccdeShareProblem({ infrastructure: [], sports: [] }), null, 'nothing proposed: nothing to check');
assert.equal(eccdeShareProblem({ infrastructure: [], sports: [], monitoring: [line(15, 1, { target_group: 'ECCDE Learners' }), line(85, 1)] }), null, 'exactly 15% passes');
const short = eccdeShare({ infrastructure: [], sports: [], monitoring: [line(14.99, 1, { target_group: 'ECCDE Learners' }), line(85.01, 1)] });
assert.equal(short.met, false); assert.equal(short.shortMinor, 100, 'one kobo short, in minor units (1/10,000 naira)'); assert.equal(short.percent, 14.9);
assert.match(eccdeShareProblem({ infrastructure: [], sports: [], monitoring: [line(100, 1, { target_group: 'ECCDE Learners' }), line(900, 1)] }), /^ECCDE must be at least 15% of the plan before it goes to the Executive Chairman: it is ₦100\.0000 \(10%\), ₦50\.0000 short\./);
console.log('PASS: spending by school level');
