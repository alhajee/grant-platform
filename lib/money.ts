/**
 * Money arithmetic (UBEC238, client 6 November 2026: unit costs to four decimals, e.g. ₦1,250.0202).
 *
 * Every amount is worked in exact integer **minor units** of 1/10,000 naira (MONEY_SCALE), as a BigInt, so
 * quantity × unit cost and every total, cap and comparison is exact at four decimals. Unit costs (activity lines,
 * Sports lines, Infrastructure items, the Procurement price list) take up to four decimals and are stored as
 * NUMERIC(…, 4) (migration 093). Funding figures (state contribution, funding sources, budget splits, Debate) are still
 * typed to the kobo, and allocations derived from them (policy shares, activity and section caps, rescaled splits) stay
 * rounded to the kobo, so earlier plans keep exactly the same ceilings.
 */
export const moneyDecimals = 4;
/** Minor units per naira: the single source of truth for the money scale. */
export const MONEY_SCALE = BigInt(10000);
/** MONEY_SCALE as a number, for the few places that work in safe integers (display sums, level shares). */
export const MONEY_SCALE_NUMBER = 10000;
/** Minor units per kobo: allocations and caps are rounded to whole kobo. */
export const MINOR_PER_KOBO = BigInt(100);
const zero = BigInt(0);

/**
 * A naira amount ("1250.0202", "1250.5", "-3", 1.0202) as minor units. Digits past the fourth decimal are cut off
 * (validation refuses them before they get here). Accepts the 2-decimal strings of earlier snapshots unchanged.
 */
export function toMinor(amount: string | number): bigint {
  if (typeof amount === 'number' && !Number.isFinite(amount)) return zero;
  const text = typeof amount === 'number' ? amount.toFixed(moneyDecimals) : String(amount).trim();
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const value = BigInt(whole || '0') * MONEY_SCALE + BigInt(fraction.padEnd(moneyDecimals, '0').slice(0, moneyDecimals) || '0');
  return negative ? -value : value;
}

/**
 * Minor units as a plain naira string for the database and APIs: two decimals when the amount is whole kobo
 * ("1250.50", as before), else four ("1.0202").
 */
export function fromMinor(minor: bigint): string {
  const absolute = minor < zero ? -minor : minor;
  const fraction = String(absolute % MONEY_SCALE).padStart(moneyDecimals, '0');
  return `${minor < zero ? '-' : ''}${absolute / MONEY_SCALE}.${fraction.endsWith('00') ? fraction.slice(0, 2) : fraction}`;
}

/** Minor units as a number (exact up to about ₦900 billion), for display sums. */
export const minorOfNumber = (naira: number) => Math.round(naira * MONEY_SCALE_NUMBER);

/** quantity × unit cost in minor units, exact. */
export const lineMinor = (unitCost: string | number, quantity: number | string) => { const count = Math.trunc(Number(quantity)); return Number.isFinite(count) ? toMinor(unitCost) * BigInt(count) : zero; };

/** Minor units to naira as a number (for charts and display only). */
export const minorToNaira = (minor: bigint | number) => Number(minor) / MONEY_SCALE_NUMBER;

/** True when a typed number has at most four decimals (1.0202 yes, 1.02025 no). */
export const hasMoneyDecimals = (value: number) => Number.isFinite(value) && Number(value.toFixed(moneyDecimals)) === value;
/** The largest unit cost a line takes: 15 significant digits keep four decimals exact in a JavaScript number. */
export const maxUnitCost = 99_999_999_999.9999;
export const moneyDecimalsMessage = 'Use at most four decimal places';

/** A typed money string with at most four decimals ("1250", "1250.0202"). */
export const moneyStringPattern = /^\d{1,13}(\.\d{1,4})?$/;

/** True when quantity × unit cost stays a safe integer of minor units (about ₦900 billion a line), so display sums stay exact. */
export const lineTotalIsSafe = (unitCost: number, quantity: number) => Number.isSafeInteger(minorOfNumber(unitCost) * quantity);

/** `minor` (whole kobo) × numerator ÷ denominator, rounded half up to the kobo, as minor units. Used for allocations and caps. */
export function shareToKobo(minor: bigint, numerator: bigint, denominator: bigint): bigint {
  const kobo = minor / MINOR_PER_KOBO;
  return (kobo * numerator + denominator / BigInt(2)) / denominator * MINOR_PER_KOBO;
}
