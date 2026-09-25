import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coversPlanningYear, normalizeStateCode, summarizePlans, needsDecision } from '../lib/national-analytics.ts';

assert.equal(coversPlanningYear(2025, 2027, 2026), true);
assert.equal(coversPlanningYear(2025, 2027, 2025), true);
assert.equal(coversPlanningYear(2025, 2027, 2027), true);
assert.equal(coversPlanningYear(2025, 2027, 2028), false);
assert.equal(coversPlanningYear(2025, 2027, null), true);
assert.equal(normalizeStateCode('NG-YO'), 'YO');
assert.equal(normalizeStateCode('FCT'), 'FC');
const items = [
  { budget: 100, schools: ['YO-school-a','YO-school-b'], status: 'received', completed: 0, pending: 0 },
  { budget: 250, schools: ['YO-school-a'], status: 'reviewing', completed: 2, pending: 0 },
  { budget: 50, schools: ['KN-school-a'], status: 'returned', completed: 2, pending: 0 },
];
assert.deepEqual(summarizePlans(items), { plans: 3, budget: 400, schools: 3, received: 1, reviewing: 1, returned: 1, approved: 0 });
assert.equal(summarizePlans([]).budget, 0);
assert.equal(needsDecision(items[0]), false);
assert.equal(needsDecision(items[1]), true);
assert.equal(needsDecision(items[2]), false);
assert.equal(needsDecision({ ...items[1], pending: 1 }), false);
const states = JSON.parse(readFileSync(new URL('../lib/nigeria-map.json', import.meta.url)));
assert.equal(states.length, 37);
assert.equal(new Set(states.map(s => s.code)).size, 37);
assert.ok(states.some(s => s.code === 'FC'));
assert.ok(states.every(s => s.name && s.d.startsWith('M') && s.d.endsWith('Z')));
console.log('National analytics: year ranges, school deduplication, attention rules and all 37 map regions passed.');
