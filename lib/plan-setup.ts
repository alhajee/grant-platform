import { z } from 'zod';
import { formatQuarters } from './format-quarters';
import { componentEnvelope, fromKobo, fundingComponentIds, fundingComponentLabels, fundingSourceTargets, teachersSharedEnvelope, toKobo, type EnvelopePlan, type FundingComponent, type FundingSource } from './funding-policy';

const year = z.number().int().min(2004).max(2100);
export const implementationYearError = (fundingYear: number, implementationYear: number) => Number.isInteger(fundingYear) && Number.isInteger(implementationYear) && implementationYear < fundingYear ? `Implementation year can't be earlier than the funding year (${fundingYear}).` : '';
const amount = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, 'Enter an amount below ₦10 trillion, with up to two decimal places.');
export const maxFundingSources = 20;
export const fundingSourceSchema = z.object({
  // 'all' is plan-wide funding, shared across every component by the policy shares (migration 041).
  component: z.enum(fundingSourceTargets, { errorMap: () => ({ message: 'Choose the component this funding is for.' }) }),
  funder: z.string().trim().min(1, 'Enter the funder.').max(120, 'Keep the funder name under 120 characters.'),
  amount: amount.refine(v => toKobo(v) > BigInt(0), 'Enter an amount greater than zero.'),
}).strict();
const periodAndFunding = {
  planningYear: year,
  implementationYear: year,
  quarters: z.array(z.number().int().min(1).max(4)).min(1, 'Select at least one quarter.').max(4)
    .refine(q => new Set(q).size === q.length, 'Do not repeat quarters.').transform(q=>[...q].sort()),
  stateLodgment: amount,
  fundingSources: z.array(fundingSourceSchema).max(maxFundingSources, `Add up to ${maxFundingSources} funding sources.`).default([]),
};
/** Sum of source amounts as a "123.45" string; malformed amounts count as zero (form input). */
export const sourcesSum = (sources: readonly { amount: string }[]) => fromKobo(sources.reduce((sum, s) => sum + (/^\d{1,13}(\.\d{1,2})?$/.test(s.amount) ? toKobo(s.amount) : BigInt(0)), BigInt(0)));
type PeriodAndFunding = { planningYear: number; implementationYear: number; stateLodgment: string; fundingSources: FundingSource[] };
const checkSetup = (p: PeriodAndFunding, ctx: z.RefinementCtx) => {
  const message = implementationYearError(p.planningYear, p.implementationYear);
  if (message) ctx.addIssue({code:'custom',message,path:['implementationYear']});
  if (/^\d{1,13}(\.\d{1,2})?$/.test(p.stateLodgment) && toKobo(fundingTotal(p.stateLodgment, sourcesSum(p.fundingSources))) <= BigInt(0)) ctx.addIssue({code:'custom',message:'Enter funding greater than zero.',path:['stateLodgment']});
};
// Other funding is entered per component or for all components (fundingSources); otherFunding is accepted only as zero for older clients.
export const planSetupSchema = z.object({ ...periodAndFunding, otherFunding: z.string().regex(/^0+(\.0{1,2})?$/, 'Enter other funding per component under Other funding sources.').optional() })
  .strict().superRefine(checkSetup);
export const planEditSchema = z.object({ plan: z.number().int().positive(), version: z.number().int().nonnegative(), ...periodAndFunding }).strict().superRefine(checkSetup);

export function fundingTotal(lodgment: string, other: string) {
  return fromKobo(toKobo(lodgment) * BigInt(2) + toKobo(other));
}
/** All other funding on a plan: legacy spread other_funding plus its funding sources (component and plan-wide). */
export function otherFundingTotal(setup: Pick<Partial<PlanSetup>, 'otherFunding' | 'fundingSources'>) {
  return fromKobo(toKobo(setup.otherFunding ?? '0') + toKobo(sourcesSum(setup.fundingSources ?? [])));
}
export type EnvelopeShortfall = { component: FundingComponent; ceiling: string; proposed: string };
/** Components whose ceiling an edit would lower below what their saved lines already propose. Existing overruns the edit does not worsen are allowed.
 * Infrastructure and TLM share one pool, so they are checked together and reported as 'infrastructure' (see shortfallMessage). */
export function envelopeShortfalls(before: EnvelopePlan, after: EnvelopePlan, proposed: Partial<Record<FundingComponent, string>>): EnvelopeShortfall[] {
  return fundingComponentIds.filter(component => component !== 'tlm').flatMap(component => {
    const pooled = component === 'infrastructure';
    const used = toKobo(proposed[component] ?? '0') + (pooled ? toKobo(proposed.tlm ?? '0') : BigInt(0)), next = componentEnvelope(after, component), previous = componentEnvelope(before, component);
    if (!used || next == null || used <= toKobo(next) || (previous != null && toKobo(next) >= toKobo(previous))) return [];
    return [{ component, ceiling: next, proposed: fromKobo(used) }];
  });
}
const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 });
/** Why an edit cannot shrink the shared Teacher Development and ICT envelope: it may not fall below ICT's allocation. */
export function sharedBelowIctProblem(after: EnvelopePlan) {
  const shared = teachersSharedEnvelope(after);
  if (after.ictAllocation == null || shared == null || toKobo(shared) >= toKobo(after.ictAllocation)) return null;
  return `Teacher Development & ICT would have ${naira.format(Number(shared))} available, but ICT has already been allocated ${naira.format(Number(after.ictAllocation))}. Ask ICT to reduce its allocation first or keep this funding.`;
}
export const shortfallMessage = (s: EnvelopeShortfall) => s.component === 'infrastructure'
  ? `Infrastructure and TLM would share ${naira.format(Number(s.ceiling))}, but ${naira.format(Number(s.proposed))} is already proposed. Reduce their budgets first or keep this funding.`
  : `${fundingComponentLabels[s.component]} would have ${naira.format(Number(s.ceiling))} available, but ${naira.format(Number(s.proposed))} is already proposed. Reduce its lines first or keep its funding.`;
export function beapName(state: string, year: number, quarters: number[]) {
  return `${state.replace(/ State$/, '').replace(/\s+/g,'')}-${year}-${formatQuarters(quarters)}-BEAP`;
}
export type PlanDocument = {id:string;name:string;size:number};
export type PlanSetup = {
  fundingPolicy?: import('./funding-policy').FundingPolicy;
  implementationYear: number | null; fundingQuarters: number[] | null;
  // otherFunding is legacy funding spread by the policy (0 on plans created since migration 035).
  // fundingTotal is the whole envelope: state contribution ×2 + otherFunding + every funding source.
  stateLodgment: string | null; otherFunding: string | null; fundingTotal: string | null;
  fundingSources?: FundingSource[];
  /** ICT's share of the shared Teacher Development and ICT envelope (migration 038); null until the ICT editor sets it. */
  ictAllocation?: string | null;
  beapName: string | null; documents: PlanDocument[];
};
export const maxRatFileBytes = 5 * 1024 * 1024;
export const maxRatTotalBytes = 10 * 1024 * 1024;
export const ratFileAccept = '.xlsx';
export const isRatSpreadsheet = (name: string) => name.toLowerCase().endsWith(ratFileAccept);
