import { levelMapping } from './level-mapping.ts';
import { formatKobo } from './money-format.ts';
import type { Snapshot } from './plan-review';

// UBEC231 / V2 UBEC05 (client, November 2026): ECCDE must get at least 15% of the plan's proposed budget before the BEAP
// Chair sends anything to the Executive Chairman. Counted over the whole working plan with levelMapping (lib/level-mapping.ts,
// "Spending by school level"), so infrastructure at ECCDE schools, ECCDE distribution schools, ECCDE textbook classes,
// ECCDE training levels and lines targeting ECCDE learners all count. Super Admin switch: lib/eccde-share-setting.ts.

/** The required ECCDE share in basis points (15%). */
export const eccdeShareBasisPoints = 1500;
export const eccdeSharePercent = eccdeShareBasisPoints / 100;
export type EccdeShare = { eccde: number; total: number; percent: number; required: number; /** Kobo still needed (0 once met). */ shortKobo: number; met: boolean };

const percentOf = (part: bigint, whole: bigint) => whole > BigInt(0) ? Number(part * BigInt(1000) / whole) / 10 : 0;

/** The plan's ECCDE spending against the 15% rule (naira figures, percent to one decimal, rounded down). */
export function eccdeShare(snapshot: Snapshot): EccdeShare {
  const mapping = levelMapping(snapshot);
  const eccde = BigInt(Math.round(mapping.eccde * 100)), total = BigInt(Math.round(mapping.total * 100));
  // ECCDE ≥ 15% of the total, in whole kobo: eccde × 10000 ≥ total × 1500.
  const needed = (total * BigInt(eccdeShareBasisPoints) + BigInt(9999)) / BigInt(10000);
  const short = needed > eccde ? needed - eccde : BigInt(0);
  return { eccde: mapping.eccde, total: mapping.total, percent: percentOf(eccde, total), required: eccdeSharePercent, shortKobo: Number(short), met: short === BigInt(0) };
}

/** Why the plan cannot go to the Executive Chairman yet because of its ECCDE share, or null (also while nothing is proposed). */
export function eccdeShareProblem(snapshot: Snapshot): string | null {
  const share = eccdeShare(snapshot);
  if (share.total <= 0 || share.met) return null;
  return `ECCDE must be at least ${eccdeSharePercent}% of the plan before it goes to the Executive Chairman: it is ${formatKobo(BigInt(Math.round(share.eccde * 100)))} (${share.percent}%), ${formatKobo(BigInt(share.shortKobo))} short. Allocate more to ECCDE schools or ECCDE learners.`;
}
