import assert from 'node:assert/strict';
import { compactNairaFormat, formatMinor, nairaFormat } from '../lib/money-format.ts';
import { MONEY_SCALE, fromMinor, hasMoneyDecimals, lineMinor, minorToNaira, moneyDecimalsMessage, shareToKobo, toMinor } from '../lib/money.ts';
import { allocatedAmount } from '../lib/funding-policy.ts';
import { activityLineSchema } from '../lib/activity-plans.ts';
import { sportsLineSchema, sportsLineTotal } from '../lib/sports.ts';
import { calculateInfrastructure, packageSchema } from '../lib/infrastructure-model.ts';

// Full amounts: four decimals (October 2026).
assert.equal(nairaFormat.format(1250), '₦1,250.0000');
assert.equal(nairaFormat.format(1250.0202), '₦1,250.0202');

// UBEC238: money is worked in minor units of 1/10,000 naira.
assert.equal(MONEY_SCALE, 10000n);
assert.equal(toMinor('1250.0202'), 12500202n);
assert.equal(toMinor('1234.56'), 12345600n, 'two-decimal strings of earlier snapshots still parse');
assert.equal(toMinor(1.0202), 10202n);
assert.equal(toMinor('-3.5'), -35000n);
assert.equal(fromMinor(12345600n), '1234.56', 'whole kobo keeps the two-decimal form');
assert.equal(fromMinor(30606n), '3.0606');
assert.equal(fromMinor(-30606n), '-3.0606');
assert.equal(formatMinor(12345600n), '₦1,234.5600');
assert.equal(formatMinor(12500202n), '₦1,250.0202');
assert.equal(lineMinor('1.0202', 3), 30606n, '3 × ₦1.0202 = ₦3.0606 exactly');
assert.equal(lineMinor(0.1, 3), 3000n, 'no floating-point drift: 3 × ₦0.10 = ₦0.30');
assert.equal(minorToNaira(lineMinor(1.0202, 3)), 3.0606);
assert.equal(hasMoneyDecimals(1.0202), true);
assert.equal(hasMoneyDecimals(1.02025), false);
assert.equal(hasMoneyDecimals(99999999999.9999), true);
// Allocations stay rounded to the kobo, exactly as before.
assert.equal(allocatedAmount('1000.01', 500), '50.00');
assert.equal(allocatedAmount('20000.00', 7500), '15000.00');
assert.equal(shareToKobo(toMinor('100.00'), 1n, 3n), toMinor('33.33'));

// Unit costs take four decimals; a fifth is refused.
const activity = (unitCost) => activityLineSchema.safeParse({ workstream: 'planning', activity: 1, description: 'Item', strategy: 'NCB', targetGroup: 'Teachers', quantity: 3, unitCost });
assert.equal(activity(1.0202).success, true, activity(1.0202).error?.message);
assert.equal(activity(1.02025).error?.issues.find(i => i.path[0] === 'unitCost')?.message, moneyDecimalsMessage);
assert.equal(moneyDecimalsMessage, 'Use at most four decimal places');
const sports = (unitCost) => sportsLineSchema.safeParse({ section: 'equipment', activityType: 'Football', description: 'Balls', targetGroup: 'Schools', quantity: 3, unitCost });
assert.equal(sports(1.0202).success, true, sports(1.0202).error?.message);
assert.equal(sportsLineTotal({ unitCost: 1.0202, quantity: 3 }), 3.0606);
assert.equal(sports(1.02025).error?.issues[0].message, moneyDecimalsMessage);

// Infrastructure furniture items: unit cost to four decimals, totalled exactly.
const furniture = { kind: 'furniture', schoolId: 1, components: ['Primary'], furniture: [{ description: 'Dual desk', quantity: 3, cost: 1.0202 }, { description: 'Chair', quantity: 7, cost: 0.1 }] };
const parsed = packageSchema.safeParse(furniture);
assert.equal(parsed.success, true, parsed.error?.message);
const result = calculateInfrastructure(parsed.data, { enrolment: 100 });
assert.equal(result.items[0].total, 3.0606);
assert.equal(result.total, 3.7606);
assert.equal(packageSchema.safeParse({ ...furniture, furniture: [{ description: 'Desk', quantity: 1, cost: 1.02025 }] }).error?.issues[0].message, moneyDecimalsMessage);

// Short amounts never round up: ₦599,999,999.99 must not read as the ₦600M ceiling.
assert.equal(compactNairaFormat(2).format(599999999.99), '₦599.99M');
assert.equal(compactNairaFormat(1).format(599999999.99), '₦599.9M');
assert.equal(compactNairaFormat(2).format(600000000), '₦600M');
assert.equal(compactNairaFormat(1).format(1999), '₦1.9K');
assert.equal(compactNairaFormat(2).format(0), '₦0');

console.log('PASS: four-decimal amounts and unit costs, exact minor-unit totals, kobo-rounded allocations; compact amounts are cut off, never rounded up.');
