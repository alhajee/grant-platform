// Unit test: school picker filters (LGA, DNEMIS code search). node scripts/test-school-search.mjs
import assert from 'node:assert/strict';
import { allLgas, filterSchools, lgasIn, schoolMatches } from '../lib/school-search.ts';

const schools = [
  { id: 1, name: 'Central Primary School', lga: 'Damaturu', level: 'Primary', code: '3501010001' },
  { id: 2, name: 'Government JSS', lga: 'Potiskum', level: 'JSS', code: '3502020002' },
  { id: 3, name: 'Central ECCDE Centre', lga: 'Potiskum', level: 'ECCDE', code: null },
];
assert.deepEqual(lgasIn(schools), ['Damaturu', 'Potiskum']);
assert.deepEqual(filterSchools(schools, 'all', 'Potiskum').map(s => s.id), [2, 3]);
assert.deepEqual(filterSchools(schools, 'JSS', 'Potiskum').map(s => s.id), [2]);
assert.deepEqual(filterSchools(schools, 'Primary', 'Potiskum').map(s => s.id), []);
assert.equal(filterSchools(schools, 'all', allLgas).length, 3);
assert.deepEqual(schools.filter(s => schoolMatches(s, '3502020002')).map(s => s.id), [2], 'full DNEMIS code');
assert.deepEqual(schools.filter(s => schoolMatches(s, '350101')).map(s => s.id), [1], 'part of a code');
assert.deepEqual(schools.filter(s => schoolMatches(s, 'central potiskum')).map(s => s.id), [3], 'every word must match');
assert.deepEqual(schools.filter(s => schoolMatches(s, '  ')).map(s => s.id), [1, 2, 3], 'empty search keeps all');
console.log('school search: ok');
