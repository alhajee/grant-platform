import { z } from 'zod';

// Integer basis points avoid floating-point ambiguity when checking totals.
const share = z.number().int().min(0).max(10000);
export const allocationSchema = z.object({
  shares: z.object({ infrastructure: share, quality: share, teachers: share, sbmc: share, sports: share, monitoring: share, curriculum: share, planning: share, gscci: share }).strict(),
  tlmWithinInfrastructure: share,
}).strict().refine(value => Object.values(value.shares).reduce((a,b)=>a+b,0) === 10000, 'Component allocations must total 100%.');
export type Allocation = z.infer<typeof allocationSchema>;
export type FundingPolicy = { id: number; allocation: Allocation; createdAt: string; createdBy: string };
export const defaultAllocation: Allocation = {shares:{infrastructure:7500,quality:500,teachers:500,sbmc:500,sports:200,monitoring:200,curriculum:200,planning:200,gscci:200},tlmWithinInfrastructure:2000};
export const percent = (basisPoints: number) => new Intl.NumberFormat('en', {maximumFractionDigits:4}).format(basisPoints/100);
export function infrastructureSplit(allocation: Allocation) {
  const tlm=allocation.shares.infrastructure*allocation.tlmWithinInfrastructure/10000;
  return {tlm,infrastructure:allocation.shares.infrastructure-tlm};
}
// Round TLM once to the nearest kobo; Infrastructure receives the remainder.
export function allocatedAmount(envelope: string, componentShare: number, withinShare=10000) {
  const [whole,fraction='']=envelope.split('.');
  const cents=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
  const component=(cents*BigInt(componentShare)+BigInt(5000))/BigInt(10000);
  const result=(component*BigInt(withinShare)+BigInt(5000))/BigInt(10000);
  return `${result/BigInt(100)}.${String(result%BigInt(100)).padStart(2,'0')}`;
}
