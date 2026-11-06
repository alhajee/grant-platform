// Bug sheet 16 (6 November 2026), unit test, no server:
// UBEC227 SBMC activities from the client's document (order, wording, compulsory monitoring, no 5% cap, retired data collection);
// UBEC229 required proforma invoice on items that buy goods; UBEC223 quantity from the schools chosen; UBEC66 a note for every activity.
// Usage: node scripts/test-activity-rules-nov.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const cache = new Map(), requireModule = createRequire(import.meta.url);
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  cache.set(path, loaded.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => id.startsWith('.') ? load(resolve(dirname(path), id.endsWith('.ts') ? id : id + '.ts')) : requireModule(id), loaded, loaded.exports);
  return loaded.exports;
}
const plans = load('lib/activity-plans.ts');
const extras = load('lib/activity-extras.ts');
const readiness = load('lib/component-readiness.ts');
const { activityNote } = load('lib/activity-notes.ts');
const { priceListActivities } = load('lib/procurement.ts');
const { allocationUseProblem } = load('lib/allocation-use.ts');
const { activityBudgetProblem } = load('lib/activity-budget.ts');
const options = { documentsRequired: false };

// UBEC227: the document's order, names and rules.
const sbmcOrder = plans.selectableActivityIndexes.sbmc.map(i => plans.activityNames.sbmc[i]);
assert.deepEqual(sbmcOrder, ['School/Centre Improvement Programme (SBMC-SIP/CBMC-CIP)', 'Annual School Grant', 'Out-of-School Children (OOSC) interventions', 'Capacity building and training', 'Advocacy and sensitisation', 'Community engagement and stakeholders’ coordination', 'Stakeholder engagement', 'Enrolment campaign/drive and post-enrolment follow-up', 'Establishment/support of non-formal learning centres', 'Media engagement', 'Advocacy and sensitisation tools', 'Learner support and retention interventions', 'Monitoring, tracking and accountability', 'Social mobilisation in IDP camps and emergency settings', 'Provision of working tools and materials', 'Others (specify)']);
assert.equal(plans.activityNames.sbmc[13], 'Community-based data collection and reporting', 'index 13 keeps its name so earlier lines still read');
assert.ok(!plans.selectableActivityIndexes.sbmc.includes(13), 'data collection is no longer offered');
assert.ok(extras.isRetiredActivity('sbmc', 13));
assert.match(plans.activityInfo.sbmc[0], /re-engage and support OOSC/);
assert.ok(!/5%/.test(plans.activityInfo.sbmc[12]), 'no 5% wording');
assert.equal(plans.activityShare('sbmc', 12), undefined, 'monitoring has no 5% cap');
assert.equal(plans.activityHints.sbmc, undefined, 'SBMC explanations moved to activityInfo');
assert.deepEqual(extras.compulsoryFor('sbmc'), [12]);
assert.ok(readiness.hasReadinessRules('sbmc'));
const sbmcLine = (activity, id = activity + 1) => ({ id, activity, description: `Item ${id}`, documents: [] });
assert.match(readiness.componentReadinessProblem('sbmc', [sbmcLine(2)], null, options) ?? '', /compulsory activity before sending: Monitoring, tracking and accountability/);
assert.equal(readiness.componentReadinessProblem('sbmc', [sbmcLine(2), sbmcLine(12)], null, options), null);
assert.match(readiness.componentReadinessProblem('sbmc', [sbmcLine(13), sbmcLine(12)], null, options) ?? '', /Community-based data collection and reporting.*no longer an allowable activity/);
assert.equal(readiness.requiredFirstProblem('sbmc', [], 2), null, 'SBMC items can be added in any order');
assert.match(readiness.requiredFirstProblem('planning', [], 1) ?? '', /required activities first/i, 'Planning keeps required activities first');
const sbmcSchema = { workstream: 'sbmc', description: 'x', rationale: 'r', implementationApproach: 'a', quantity: 1, unitCost: 10, strategy: 'NCB', targetGroup: 'Schools' };
assert.equal(plans.activityLineSchema.safeParse({ ...sbmcSchema, activity: 13 }).success, false, 'no new lines on the retired activity');
assert.equal(plans.activityLineSchema.safeParse({ ...sbmcSchema, activity: 12 }).success, true);
// Monitoring above 5% is fine now; SBMC still has to match its allocation exactly (sbmcBudgetProblem, unchanged).
const plan = { stateLodgment: '1000000', otherFunding: '0', fundingSources: [], fundingPolicy: { shares: { infrastructure: 7500, sports: 500, sbmc: 500, monitoring: 0, gscci: 0, curriculum: 0, quality: 0, teachers: 1000, planning: 0 } }, ictAllocation: null };
assert.equal(activityBudgetProblem('sbmc', [{ activity: 12, kobo: BigInt(9_000_000) }], plan), null, 'no activity cap on SBMC monitoring');
assert.equal(allocationUseProblem('sbmc', { setup: plan, sbmc: [{ activity: 2, quantity: 1, unit_cost: '50000.00' }, { activity: 12, quantity: 1, unit_cost: '50000.00' }] }), null, 'full use no longer asks for 5% on monitoring');

// UBEC229: a required proforma invoice on every item that buys goods, whatever the Supporting documents setting.
for (const [workstream, activities] of Object.entries(priceListActivities)) for (const activity of activities) {
  const slots = extras.lineDocumentSlots(workstream, activity);
  assert.equal(slots[0].kind, 'proforma', `${workstream} ${activity} takes a proforma invoice`);
  assert.equal(extras.slotRequired(slots[0], false), true, 'required even while supporting documents are optional');
  assert.equal(extras.missingLineDocument(workstream, activity, [], false)?.kind, 'proforma');
  assert.equal(extras.missingLineDocument(workstream, activity, [{ kind: 'proforma' }], false), null);
}
assert.deepEqual(extras.lineDocumentSlots('tlm', 5).map(s => s.kind), ['proforma', 'boq', 'sample'], 'TLM: proforma beside BOQ and sample');
assert.deepEqual(extras.lineDocumentSlots('ict', 0).map(s => s.kind), ['proforma', 'document'], 'ICT procurement keeps its specification document');
assert.deepEqual(extras.lineDocumentSlots('monitoring', 2).map(s => s.kind), ['document'], 'allowances buy no goods');
assert.deepEqual(extras.lineDocumentSlots('gscci', 0), [], 'Greening keeps its own item lists');
assert.deepEqual(extras.lineDocumentSlots('teachers', 0).map(s => s.kind), ['budget', 'participants', 'document']);
for (const workstream of ['monitoring', 'curriculum', 'sbmc', 'tlm', 'quality', 'ict', 'planning']) assert.ok(readiness.hasReadinessRules(workstream), `${workstream} is checked at every send step`);
const mon = { id: 7, activity: 0, description: 'Visit kits', documents: [] };
assert.equal(readiness.componentReadinessProblem('monitoring', [mon], null, options), 'Upload the proforma invoice for “Visit kits” before sending');
assert.equal(readiness.componentReadinessProblem('monitoring', [{ ...mon, documents: [{ kind: 'proforma' }] }], null, options), null);
assert.equal(readiness.componentReadinessProblem('curriculum', [{ id: 3, activity: 1, description: 'Training', documents: [] }], null, options), null, 'services need none');

// UBEC223: the quantity follows the schools chosen (ICT 2, 4, 8), or the items given to each school (ICT 0 for schools).
assert.equal(extras.schoolDrivenQuantity('ict', 2, '', [1, 2, 3], {}), 3);
assert.equal(extras.schoolDrivenQuantity('ict', 8, '', [1, 2], {}), 2);
assert.equal(extras.schoolDrivenQuantity('ict', 0, 'school', [1, 2], { 1: 4, 2: 5 }), 9);
assert.equal(extras.schoolDrivenQuantity('ict', 0, 'subeb', [], {}), null, 'SUBEB procurement types its quantity');
assert.equal(extras.schoolDrivenQuantity('ict', 1, '', [], {}), null);
const ictLine = { workstream: 'ict', description: 'x', quantity: 2, unitCost: 10, strategy: 'NCB', targetGroup: 'Schools' };
const refused = plans.activityLineSchema.safeParse({ ...ictLine, activity: 8, schoolIds: [1, 2, 3] });
assert.equal(refused.success, false);
assert.match(refused.error.issues.map(i => i.message).join(' '), /One per school: the quantity is the number of schools chosen \(3\)/);
assert.equal(plans.activityLineSchema.safeParse({ ...ictLine, activity: 8, quantity: 3, schoolIds: [1, 2, 3] }).success, true);
const items = plans.activityLineSchema.safeParse({ ...ictLine, activity: 0, beneficiary: 'school', quantity: 5, schoolIds: [1, 2], schoolQuantities: { 1: 2, 2: 2 } });
assert.match(items.error.issues.map(i => i.message).join(' '), /Share all 5 items across the schools: 4 allocated/);

// UBEC66: every activity of every activity component has a tinted note.
for (const workstream of plans.activityWorkstreams) for (const activity of plans.selectableActivityIndexes[workstream]) {
  const note = activityNote(workstream, activity);
  assert.ok(note.includes || note.info, `${workstream} ${activity} (${plans.activityNames[workstream][activity]}) has a note`);
}
console.log('Activity rules (UBEC227, UBEC229, UBEC223, UBEC66) passed');
