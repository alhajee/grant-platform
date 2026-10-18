/**
 * Money display: four decimal places everywhere (₦1,250.0000), the financial-systems standard the client asked for
 * (October 2026). Amounts are still stored and checked to the kobo (NUMERIC(…, 2)), so the last two digits read 00.
 * Compact figures (₦1.2M) keep their short form.
 */
export const moneyDecimals = 4;

export const nairaFormat = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: moneyDecimals, maximumFractionDigits: moneyDecimals });

/** A kobo amount as naira to four decimals, without its sign (callers word over/under themselves). */
export const formatKobo = (kobo: bigint) => {
  const absolute = kobo < 0 ? -kobo : kobo;
  return `₦${(absolute / BigInt(100)).toLocaleString('en-NG')}.${String(absolute % BigInt(100)).padStart(2, '0').padEnd(moneyDecimals, '0')}`;
};

/**
 * Short amounts (₦1.2M) with up to `digits` decimals, cut off rather than rounded, so a figure just under a
 * ceiling never reads as the ceiling (₦599,999,999.99 is ₦599.99M, not ₦600M).
 */
export const compactNairaFormat = (digits: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: digits, roundingMode: 'trunc' } as Intl.NumberFormatOptions);
