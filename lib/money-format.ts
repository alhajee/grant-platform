import { MONEY_SCALE, moneyDecimals } from './money.ts';

/**
 * Money display: four decimal places everywhere (₦1,250.0202), the financial-systems standard the client asked for
 * (October 2026). Amounts are worked in exact minor units of 1/10,000 naira (lib/money.ts, UBEC238); unit costs keep
 * four decimals, funding figures are whole kobo (the last two digits read 00). Compact figures (₦1.2M) keep their short form.
 */
export { moneyDecimals };

export const nairaFormat = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: moneyDecimals, maximumFractionDigits: moneyDecimals });

/** A minor amount as naira to four decimals, without its sign (callers word over/under themselves). */
export const formatMinor = (minor: bigint) => {
  const absolute = minor < BigInt(0) ? -minor : minor;
  return `₦${(absolute / MONEY_SCALE).toLocaleString('en-NG')}.${String(absolute % MONEY_SCALE).padStart(moneyDecimals, '0')}`;
};

/**
 * Short amounts (₦1.2M) with up to `digits` decimals, cut off rather than rounded, so a figure just under a
 * ceiling never reads as the ceiling (₦599,999,999.99 is ₦599.99M, not ₦600M).
 */
export const compactNairaFormat = (digits: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: digits, roundingMode: 'trunc' } as Intl.NumberFormatOptions);
