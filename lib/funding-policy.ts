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

// Components that can receive their own other funding (UBEC04/05). TLM sits inside the infrastructure share.
export const fundingComponentIds = ['infrastructure','tlm','quality','teachers','sbmc','sports','monitoring','curriculum','planning','gscci'] as const satisfies readonly import('./beap-pillars').PillarId[];
export type FundingComponent = typeof fundingComponentIds[number];
export const fundingComponentLabels: Record<FundingComponent,string> = {infrastructure:'Infrastructure',tlm:'TLM',quality:'Quality Assurance',teachers:'Teacher Development & ICT',sbmc:'SBMC',sports:'Sports',monitoring:'Supervision & Monitoring',curriculum:'Curriculum',planning:'Planning, EMIS & Data',gscci:'Greening, Climate & Safeguarding'};
export type FundingSource = { id?: number; component: FundingComponent; funder: string; amount: string };
/** The plan fields the envelope helpers read; every plan loaded with planFields/planSetupFields has them. */
export type EnvelopePlan = { stateLodgment?: string | null; otherFunding?: string | null; fundingPolicy?: FundingPolicy | null; fundingSources?: readonly FundingSource[] | null };

export const toKobo = (amount: string) => { const [whole, fraction = ''] = amount.split('.'); return BigInt(whole || '0') * BigInt(100) + BigInt(fraction.padEnd(2, '0').slice(0, 2)); };
export const fromKobo = (kobo: bigint) => `${kobo < 0 ? '-' : ''}${(kobo < 0 ? -kobo : kobo) / BigInt(100)}.${String((kobo < 0 ? -kobo : kobo) % BigInt(100)).padStart(2, '0')}`;
/** Sum of funding sources, optionally for one component, as a "123.45" string. */
export function sourcesTotal(sources: readonly FundingSource[] | null | undefined, component?: FundingComponent) {
  return fromKobo((sources ?? []).filter(s => !component || s.component === component).reduce((sum, s) => sum + toKobo(s.amount), BigInt(0)));
}
/** Envelope spread by the policy shares: state contribution ×2 plus any legacy (pre-035) other funding. Null until funding is set. */
export function sharedEnvelope(plan: EnvelopePlan) {
  if (plan.stateLodgment == null) return null;
  return fromKobo(toKobo(plan.stateLodgment) * BigInt(2) + toKobo(plan.otherFunding ?? '0'));
}
/**
 * Budget ceiling of one component, in naira as a "123.45" string, or null until the plan funding is set.
 *   ceiling = component's policy share of sharedEnvelope(plan) + sum of the plan's funding sources for that component.
 * TLM gets tlmWithinInfrastructure of the infrastructure share (rounded once); Infrastructure gets the remainder.
 * 'teachers' is the shared Teacher Development and ICT allocation. Other components are unaffected by a source.
 * Example: componentEnvelope(plan, 'monitoring'), with `plan` from resolveActionPlan/planFields or a snapshot's setup.
 */
export function componentEnvelope(plan: EnvelopePlan, component: FundingComponent) {
  const shared = sharedEnvelope(plan);
  if (shared == null) return null;
  const allocation = plan.fundingPolicy?.allocation ?? defaultAllocation;
  const tlm = toKobo(allocatedAmount(shared, allocation.shares.infrastructure, allocation.tlmWithinInfrastructure));
  const share = component === 'tlm' ? tlm : component === 'infrastructure' ? toKobo(allocatedAmount(shared, allocation.shares.infrastructure)) - tlm : toKobo(allocatedAmount(shared, allocation.shares[component]));
  return fromKobo(share + toKobo(sourcesTotal(plan.fundingSources, component)));
}
/** componentEnvelope for every component, or null until the plan funding is set. */
export function componentEnvelopes(plan: EnvelopePlan) {
  if (sharedEnvelope(plan) == null) return null;
  return Object.fromEntries(fundingComponentIds.map(id => [id, componentEnvelope(plan, id)!])) as Record<FundingComponent, string>;
}
