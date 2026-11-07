// Unit test for UBEC239 (client, 7 November 2026: "allow the component split in which one component takes all the funds"):
// either side of a split pair may get ₦0, and a ₦0 component with no items is left out of the plan (readiness, the BEAP
// Chair's collated send, the send to UBEC, the plan status and pending actions).
// Usage: node scripts/test-unfunded-components.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const requireModule = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const loaded = { exports: {} }; cache.set(path, loaded);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const local = id => { const base = id.startsWith('@/') ? resolve(id.slice(2)) : resolve(dirname(path), id); return load(base.endsWith('.ts') ? base : `${base}.ts`); };
  new Function('require', 'module', 'exports', code)(id => id.startsWith('.') || id.startsWith('@/') ? local(id) : requireModule(id), loaded, loaded.exports);
  return loaded.exports;
}
const { sharedSplit, creationSplitProblem } = load(resolve('lib/budget-pairs.ts'));
const { hasNoAllocation, unfundedComponents, unfundedInSnapshot, noAllocationLabel, noAllocationDetail } = load(resolve('lib/unfunded-components.ts'));
const { aggregateReviewStatus, executiveChairmanProblem, fundedPillars, readyForUbec } = load(resolve('lib/pillar-review.ts'));
const { pendingActionsFor } = load(resolve('lib/pending-actions.ts'));
const { implementedPillars } = load(resolve('lib/beap-pillars.ts'));
let passed = 0;
const step = message => { passed++; console.log('✓', message); };

// State contribution ₦10,000 → shared ₦20,000: Teacher Development & ICT ₦1,000 (5%), Infrastructure & TLM ₦15,000 (75%).
const plan = { infrastructureTlmMode: 'split', stateLodgment: '10000.00', otherFunding: '0.00', fundingSources: [] };
const none = { own: '0', partner: '0' };

// Either side may now be given ₦0 (the other takes the whole shared budget), but only while it has nothing planned.
assert.equal(sharedSplit(plan, 'teachers', '0', none).allocation, '1000.00', 'Teacher Development ₦0: ICT takes it all');
assert.equal(sharedSplit(plan, 'ict', '0', none).allocation, '0.00', 'ICT ₦0');
assert.equal(sharedSplit(plan, 'infrastructure', '0', none).allocation, '15000.00', 'Infrastructure ₦0: TLM takes it all');
assert.equal(sharedSplit(plan, 'tlm', '0', none).allocation, '0.00', 'TLM ₦0');
assert.match(sharedSplit(plan, 'teachers', '0', { own: '5', partner: '0' }).problem, /Teacher Development lines already propose ₦5\.0000/);
assert.match(sharedSplit(plan, 'infrastructure', '0', { own: '1', partner: '0' }).problem, /Infrastructure packages already propose/);
assert.match(sharedSplit(plan, 'ict', '1000', { own: '0', partner: '1' }).problem, /Teacher Development lines already propose ₦1\.0000, so ICT can use up to ₦999\.0000/);
step('sharedSplit: either side may be ₦0 while it has no lines or packages');

// Plan creation (the BEAP Chair's Budget splits step): all to either side.
assert.deepEqual(creationSplitProblem(plan, { ict: '1000', tlm: '15000' }), { ictAllocation: '1000.00', tlmAllocation: '15000.00' });
assert.deepEqual(creationSplitProblem(plan, { ict: '0', tlm: '0' }), { ictAllocation: '0.00', tlmAllocation: '0.00' });
assert.match(creationSplitProblem(plan, { ict: '1000.01', tlm: '0' }).problem, /up to the shared Teacher Development & ICT budget/);
step('creationSplitProblem: the whole shared budget may go to either side');

// Which components are unfunded.
const allToIct = { ...plan, ictAllocation: '1000.00', tlmAllocation: '5000.00' };
assert.equal(hasNoAllocation(allToIct, 'teachers'), true); assert.equal(hasNoAllocation(allToIct, 'ict'), false);
assert.equal(hasNoAllocation({ ...plan, ictAllocation: null }, 'teachers'), false, 'split not set yet: not unfunded');
assert.equal(hasNoAllocation({ ...plan, ictAllocation: '0.00', tlmAllocation: '0.00' }, 'tlm'), true);
assert.equal(hasNoAllocation({ ...plan, infrastructureTlmMode: 'shared_pool', tlmAllocation: '0.00' }, 'tlm'), false, 'shared pool: no split');
assert.equal(hasNoAllocation({ ...plan, tlmAllocation: '15000.00' }, 'infrastructure'), true);
assert.equal(hasNoAllocation(allToIct, 'sports'), false);
assert.deepEqual(unfundedComponents(allToIct, () => 0), ['teachers']);
assert.deepEqual(unfundedComponents(allToIct, side => side === 'teachers' ? 1 : 0), [], 'a ₦0 side with items is not unfunded');
assert.deepEqual(unfundedComponents({ ...plan, ictAllocation: '0.00', tlmAllocation: '15000.00' }, () => 0), ['infrastructure', 'ict']);
assert.equal(noAllocationLabel('teachers'), 'No allocation · ₦0 (all to ICT)');
assert.match(noAllocationDetail('teachers'), /gives the whole shared budget to ICT, so Teacher Development has nothing to plan or send/);
assert.doesNotMatch(noAllocationDetail('teachers'), /\.$/);
step('hasNoAllocation / unfundedComponents: ₦0 after the split is set, no items, split pairs only');

// Readiness: a snapshot where Teacher Development is unfunded and every other component is with the Executive Chairman.
const snapshot = { setup: allToIct, infrastructure: [], sports: [], teachers: [], ict: [{ id: 1, activity: 1, description: 'x', quantity: 1, unit_cost: '1' }] };
assert.deepEqual(unfundedInSnapshot(snapshot), ['teachers']);
assert.deepEqual(fundedPillars(snapshot), implementedPillars.filter(p => p !== 'teachers'));
assert.deepEqual(unfundedInSnapshot({ ...snapshot, setup: undefined }), [], 'snapshots without a setup are not changed');
const reviews = status => implementedPillars.map(pillar => ({ pillar, status: pillar === 'teachers' ? 'draft' : status }));
assert.equal(aggregateReviewStatus(reviews('chairman_ready')), 'draft', 'without UBEC239 the draft component held the plan');
assert.equal(aggregateReviewStatus(reviews('chairman_ready'), ['teachers']), 'awaiting_chairman');
assert.equal(aggregateReviewStatus(reviews('beap_review'), ['teachers']), 'awaiting_beap_chair');
assert.equal(aggregateReviewStatus(implementedPillars.map(pillar => ({ pillar, status: pillar === 'teachers' ? 'changes_requested' : 'beap_review' })), ['teachers']), 'awaiting_beap_chair', 'an unfunded component’s old status is ignored');
// The BEAP Chair's collated send no longer waits for it (the next problem is about the other components' empty items).
const chair = executiveChairmanProblem(reviews('beap_review'), snapshot, { documentsRequired: false });
assert.doesNotMatch(chair ?? '', /not reached the BEAP Chair/);
assert.doesNotMatch(chair ?? '', /Teacher Development/);
assert.match(executiveChairmanProblem(reviews('beap_review'), { ...snapshot, setup: { ...allToIct, ictAllocation: '500.00' } }, { documentsRequired: false }), /not reached the BEAP Chair yet: Teacher Development/);
assert.equal(readyForUbec(reviews('chairman_ready'), snapshot, { documentsRequired: false }), false, 'other components still have nothing budgeted');
step('readiness: an unfunded component never holds the plan status or the BEAP Chair’s collated send');

// Pending actions: nothing waits on an unfunded component, and the Executive Chairman's "all ready" counts without it.
const worker = role => ({ role, departments: ['teachers', 'ict'], isBeapChair: false });
const rows = implementedPillars.map(pillar => ({ plan_id: 1, pillar, status: pillar === 'teachers' ? 'draft' : 'chairman_ready' }));
assert.equal(pendingActionsFor(worker('Data Entry Staff'), { id: 1, status: 'draft' }, rows).length, 1, 'Complete Teacher Development');
assert.equal(pendingActionsFor(worker('Data Entry Staff'), { id: 1, status: 'draft' }, rows, ['teachers']).length, 0);
assert.equal(pendingActionsFor(worker('Executive Chairman'), { id: 1, status: 'awaiting_chairman' }, rows, ['teachers'])[0].label, 'Executive review and send to UBEC');
step('pending actions skip unfunded components');

console.log(`\n${passed} checks passed`);
