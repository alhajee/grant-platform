import assert from 'node:assert/strict';
import { compactNairaFormat, formatKobo, nairaFormat } from '../lib/money-format.ts';

// Full amounts: four decimals (October 2026).
assert.equal(nairaFormat.format(1250), '₦1,250.0000');
assert.equal(formatKobo(123456n), '₦1,234.5600');

// Short amounts never round up: ₦599,999,999.99 must not read as the ₦600M ceiling.
assert.equal(compactNairaFormat(2).format(599999999.99), '₦599.99M');
assert.equal(compactNairaFormat(1).format(599999999.99), '₦599.9M');
assert.equal(compactNairaFormat(2).format(600000000), '₦600M');
assert.equal(compactNairaFormat(1).format(1999), '₦1.9K');
assert.equal(compactNairaFormat(2).format(0), '₦0');

console.log('PASS: four-decimal full amounts; compact amounts are cut off, never rounded up.');
