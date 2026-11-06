// UBEC234: the plan's schools list (lib/plan-schools.ts): intervened (Infrastructure) and beneficiary schools with what
// touches each, matching the school totals of lib/plan-summary.ts (unit test, no server).
// Usage: node scripts/test-plan-schools.mjs
import assert from 'node:assert/strict';
import { mergePlanSchools, planSchools, planSchoolsCsv } from '../lib/plan-schools.ts';
// lib/plan-summary.ts counts the same six schools (it imports without extensions, so it is not loaded here).

const school = (name, level = 'Primary', lga = 'Damaturu') => ({ id: name.length, name, lga, level, location: 'Urban' });
const line = (extra = {}) => ({ id: 1, unit_cost: '100', quantity: 1, ...extra });
const snapshot = {
  infrastructure: [line({ school: school('Alpha'), construction: { name: 'Whole School Renovation/Expansion' } }), line({ school: school('Alpha'), construction: { name: 'Furniture/Equipment' } })],
  sports: [line({ allocations: [{ quantity: 2, school: school('Bravo', 'JSS') }, { quantity: 1, school: school('Alpha') }] })],
  pheDistribution: [school('Charlie')],
  tlmDistribution: [school('Bravo', 'JSS'), school('Delta, "North"', 'ECCDE')],
  curriculumDistribution: [school('Bravo', 'JSS')],
  gscciDistribution: [school('Echo')],
  ict: [line({ schools: [school('Echo'), school('Foxtrot')] })],
  sbmc: [line()],
};

const list = planSchools(snapshot);
assert.equal(list.length, 6, 'the list matches the plan total');
assert.deepEqual(list.map(s => s.name), ['Alpha', 'Bravo', 'Charlie', 'Delta, "North"', 'Echo', 'Foxtrot'], 'intervened first, then by name');
const alpha = list[0];
assert.equal(alpha.intervened, true);
assert.deepEqual(alpha.uses.map(u => u.label), ['Infrastructure · Whole School Renovation/Expansion', 'Infrastructure · Furniture/Equipment', 'Sports allocation']);
assert.deepEqual(list.find(s => s.name === 'Bravo').uses.map(u => u.label), ['TLM distribution', 'Curriculum distribution', 'Sports allocation']);
assert.deepEqual(list.find(s => s.name === 'Charlie').uses.map(u => u.label), ['PHE training']);
assert.deepEqual(list.find(s => s.name === 'Echo').uses.map(u => u.label), ['Greening distribution', 'ICT item']);
assert.equal(list.filter(s => s.intervened).length, 1);
console.log('✓ every school once, intervened first, with each intervention, matching the plan total');

// Same name in another LGA or level is another school, as in the totals.
assert.equal(planSchools({ infrastructure: [], sports: [], tlmDistribution: [school('Alpha'), school('Alpha', 'JSS'), school('Alpha', 'Primary', 'Fika')] }).length, 3);
assert.deepEqual(planSchools({ infrastructure: [], sports: [] }), []);
console.log('✓ schools are matched by name, LGA and level; an empty plan has none');

const merged = mergePlanSchools([list, planSchools({ infrastructure: [line({ school: school('Bravo', 'JSS'), construction: { name: 'New Construction' } })], sports: [] })]);
assert.equal(merged.length, list.length);
const bravo = merged.find(s => s.name === 'Bravo');
assert.equal(bravo.intervened, true); assert.equal(bravo.uses.at(-1).label, 'Infrastructure · New Construction');
assert.deepEqual(merged.slice(0, 2).map(s => s.name), ['Alpha', 'Bravo']);
console.log('✓ several plans merge into one list, a school intervened in any plan counting as intervened');

const csv = planSchoolsCsv(list).split('\n');
assert.equal(csv[0], 'School,LGA,Level,Group,Interventions');
assert.equal(csv[1], 'Alpha,Damaturu,Primary,Intervened,Infrastructure · Whole School Renovation/Expansion; Infrastructure · Furniture/Equipment; Sports allocation');
assert.ok(csv.includes('"Delta, ""North""",Damaturu,ECCDE,Beneficiary,TLM distribution'));
console.log('✓ CSV download quotes names with commas and quotes');
console.log('\nPASS: plan schools list');
