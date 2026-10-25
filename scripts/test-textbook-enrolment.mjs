// UBEC73: TLM offers Verification and Monitoring again, and a textbook quantity above the learners it is for is warned about.
// UBEC88: textbooks are one per learner of the chosen classes, allocated per school (unit test, no server).
// Usage: node scripts/test-textbook-enrolment.mjs
import assert from 'node:assert/strict';
import { activityLabel, activityLineSchema, activityShare, selectableActivityIndexes } from '../lib/activity-plans.ts';
import { textbookAllocation, textbookLearners, textbookQuantityWarning } from '../lib/textbook-enrolment.ts';

assert.equal(activityLabel('tlm', 3), 'Verification and Monitoring');
assert.deepEqual(selectableActivityIndexes.tlm.slice(-3), [2, 3, 22], 'Distribution, then Verification and Monitoring, just before Other TLMs');
assert.equal(activityShare('tlm', 3), undefined, 'no cap of its own');
const line = { workstream: 'tlm', activity: 3, description: 'Verification visits', quantity: 4, unitCost: 1000, strategy: 'Request for quotation', targetGroup: 'Schools' };
assert.equal(activityLineSchema.safeParse(line).success, true, 'Verification and Monitoring lines can be saved');

const schools = [
  { id: 1, name: 'A', lga: 'X', level: 'Primary', location: 'Rural', enrolmentByClass: { P1: { male: 30, female: 20 }, P2: { male: 10, female: 15 }, JSS1: { male: 5, female: 5 } } },
  { id: 2, name: 'B', lga: 'X', level: 'Primary', location: 'Rural', enrolmentByClass: { P1: { male: 40, female: 35 } } },
  { id: 3, name: 'C', lga: 'X', level: 'Primary', location: 'Rural', enrolmentByClass: null },
];
assert.equal(textbookLearners(['Primary 1'], schools), 125);
assert.equal(textbookLearners(['Primary 1', 'Primary 2'], schools), 150);
assert.equal(textbookLearners(['JSS 3'], schools), 0);
assert.equal(textbookQuantityWarning(150, ['Primary 1', 'Primary 2'], schools), null, 'equal to the learners: no warning');
assert.match(textbookQuantityWarning(151, ['Primary 1', 'Primary 2'], schools), /^151 textbooks is more than the 150 learners in the chosen classes across the 3 distribution schools/);
assert.equal(textbookQuantityWarning(999, ['JSS 3'], schools), null, 'no class figures: nothing to compare');
assert.equal(textbookQuantityWarning(999, ['Primary 1'], []), null, 'empty list: no warning');
// UBEC88: one textbook per learner of the chosen classes, per school (largest first, schools without figures left out).
assert.deepEqual(textbookAllocation(['Primary 1', 'Primary 2'], schools).map(r => [r.school.name, r.learners]), [['B', 75], ['A', 75]].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));
assert.deepEqual(textbookAllocation(['Primary 1'], schools).map(r => [r.school.name, r.learners]), [['B', 75], ['A', 50]]);
assert.deepEqual(textbookAllocation(['JSS 3'], schools), []);
console.log('textbook enrolment: ok');
