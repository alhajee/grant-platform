// UBEC268 approval letter: the fund table (policy shares; Infrastructure split into Construction, Renovation, Furniture &
// Equipment, WASH and TLMs adding up to its share), wording, reference and the PDF (unit test, no server).
// Usage: node scripts/test-approval-letter.mjs
import assert from 'node:assert/strict';
import { approvalLetter, infrastructurePercents, infrastructureSpending, itemPart, letterDate, quarterPhrase } from '../lib/approval-letter.ts';
import { approvalLetterPdf } from '../lib/approval-letter-pdf.ts';

const pkg = (kind, cost, items) => ({ unit_cost: String(cost), quantity: 1, package: { kind, result: { items } } });
const snapshot = { setup: {}, infrastructure: [
  pkg('whole', 1000, [{ key: 'classroomPri-renovate', total: 600, operation: 'Renovation' }, { key: 'toilet', total: 100 }, { key: 'dualDesk', total: 200 }, { key: 'fence', total: 100 }]),
  pkg('new', 500, []), pkg('furniture', 200, [{ key: 'furniture-0', total: 200 }])], tlm: [{ unit_cost: '300', quantity: 1 }] };

assert.equal(itemPart({ key: 'toilet-renovate' }, 'whole'), 'wash');
assert.equal(itemPart({ key: 'block-renovate-p6c', block: { kind: 'renovate' } }, 'whole'), 'renovation');
assert.equal(itemPart({ key: 'block-construct-p6c', block: { kind: 'construct' } }, 'whole'), 'construction');
assert.equal(itemPart({ key: 'anything' }, 'furniture'), 'furniture');

const parts = infrastructurePercents(infrastructureSpending(snapshot), 7500);
assert.deepEqual(parts, { construction: 22.5, renovation: 22.5, furniture: 15, wash: 3.75, tlm: 11.25 });
// Rounded to hundredths, the parts still add up to the Infrastructure share.
const thirds = infrastructurePercents({ construction: 1n, renovation: 1n, furniture: 1n, wash: 0n, tlm: 0n }, 7500);
assert.equal(Math.round(Object.values(thirds).reduce((a, b) => a + b, 0) * 100), 7500);
assert.equal(infrastructurePercents({ construction: 0n, renovation: 0n, furniture: 0n, wash: 0n, tlm: 0n }, 7500), null);

assert.equal(quarterPhrase(2026, [1, 2, 3, 4]), '1st – 4th Quarters 2026');
assert.equal(quarterPhrase(2026, null), '1st – 4th Quarters 2026');
assert.equal(quarterPhrase(2027, [2]), '2nd Quarter 2027');
assert.equal(letterDate(new Date('2026-08-24T10:00:00Z')), '24th August 2026');
assert.equal(letterDate(new Date('2026-11-22T23:30:00Z')), '23rd November 2026', 'Lagos date');

const letter = approvalLetter({ stateCode: 'AK', planYear: 2026, quarters: [1, 2, 3, 4], snapshot, year: 2026, serial: 47, issuedAt: new Date('2026-08-24T10:00:00Z') });
assert.equal(letter.reference, 'UBEC/DPP/BEAP/AK/2026/47');
assert.deepEqual(letter.addressee, ['The Executive Chairman,', 'State Universal Basic Education Board,', 'Uyo, Akwa Ibom State.']);
assert.equal(letter.title, 'APPROVAL FOR 1ST – 4TH QUARTERS 2026 ACTION PLAN');
assert.deepEqual(letter.rows.map(r => r.percent), [75, 5, 5, 5, 2, 2, 2, 2, 2]);
assert.equal(letter.rows[0].parts.length, 5);
assert.deepEqual(approvalLetter({ stateCode: 'FC', planYear: 2026, quarters: null, snapshot, year: 2026, serial: 1, issuedAt: new Date() }).addressee.slice(1), ['FCT Universal Basic Education Board,', 'Abuja.']);

const pdf = await approvalLetterPdf(letter);
assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
assert.ok(pdf.length > 50_000, 'letterhead and signature are drawn');
console.log('approval letter: ok');
