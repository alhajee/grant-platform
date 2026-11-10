// Unit test (UBEC248): matching an uploaded school list by DNEMIS code and name. node scripts/test-distribution-upload.mjs
import assert from 'node:assert/strict';
import { matchUploadRows, namesAgree, normalCode, normalName } from '../lib/distribution-upload.ts';

const schools = [
  { id: 1, name: 'Central Primary School, Damaturu', lga: 'Damaturu', level: 'Primary', code: '3501010001' },
  { id: 2, name: 'Government J.S.S. Potiskum', lga: 'Potiskum', level: 'JSS', code: '3502020002' },
  { id: 3, name: 'St. Mary’s & Joseph ECCDE', lga: 'Potiskum', level: 'ECCDE', code: '3502020003' },
  { id: 4, name: 'No Code School', lga: 'Potiskum', level: 'Primary', code: null },
];

assert.equal(normalCode(' 3501 010001 '), '3501010001');
assert.equal(normalCode('3501010001.0'), '3501010001', 'a number cell read as text');
assert.equal(normalName('Govt. J.S.S,  Potiskum'), 'govtjsspotiskum');
assert.ok(namesAgree('central primary school damaturu', 'Central Primary School, Damaturu'), 'case, comma and spaces ignored');
assert.ok(namesAgree('GOVERNMENT JSS POTISKUM', 'Government J.S.S. Potiskum'), 'full stops ignored');
assert.ok(namesAgree("St Mary's and Joseph ECCDE", 'St. Mary’s & Joseph ECCDE'), '& reads and; quotes ignored');
assert.ok(!namesAgree('Central Primary School', 'Central Primary School, Damaturu'), 'a different name');

const rows = [
  { row: 2, code: '3501010001', name: 'Central Primary School Damaturu' },
  { row: 3, code: '3502020002', name: 'Government JSS Potiskum' },
  { row: 4, code: '3502020003', name: 'Some Other School' },
  { row: 5, code: '9999999999', name: 'Unknown School' },
  { row: 6, code: '', name: 'No Code School' },
  { row: 7, code: '3501010001', name: 'Central Primary School Damaturu' },
  { row: 8, code: '', name: '' },
];
const result = matchUploadRows(rows, schools, new Set([2]));
assert.deepEqual(result.matched.map(m => [m.row, m.school.id]), [[2, 1]]);
assert.deepEqual(result.listed.map(m => [m.row, m.school.id]), [[3, 2]], 'already on the list');
assert.deepEqual(result.mismatched.map(m => [m.row, m.school.name]), [[4, 'St. Mary’s & Joseph ECCDE']], 'shows the register name');
assert.deepEqual(result.unknown.map(m => m.row), [5]);
assert.deepEqual(result.noCode.map(m => m.row), [6], 'a name alone is not enough');
assert.deepEqual(result.duplicates.map(m => [m.row, m.firstRow]), [[7, 2]]);
const total = Object.values(result).reduce((sum, list) => sum + list.length, 0);
assert.equal(total, 6, 'blank rows are skipped');
assert.deepEqual(matchUploadRows([], schools, new Set()).matched, []);
console.log('distribution upload matching: ok');
