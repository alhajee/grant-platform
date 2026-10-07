import { z } from 'zod';

// Integer basis points avoid floating-point ambiguity when checking totals.
const share = z.number().int().min(0).max(10000);
export const allocationSchema = z.object({
  shares: z.object({ infrastructure: share, quality: share, teachers: share, sbmc: share, sports: share, monitoring: share, curriculum: share, planning: share, gscci: share }).strict(),
  // Retired: TLM and Infrastructure now share the whole infrastructure share (infrastructurePoolEnvelope). Older policy rows may carry it; it is ignored.
  tlmWithinInfrastructure: share.optional(),
}).strict().refine(value => Object.values(value.shares).reduce((a,b)=>a+b,0) === 10000, 'Component allocations must total 100%.');
export type Allocation = z.infer<typeof allocationSchema>;
export type FundingPolicy = { id: number; allocation: Allocation; createdAt: string; createdBy: string };
export const defaultAllocation: Allocation = {shares:{infrastructure:7500,quality:500,teachers:500,sbmc:500,sports:200,monitoring:200,curriculum:200,planning:200,gscci:200}};
export const percent = (basisPoints: number) => new Intl.NumberFormat('en', {maximumFractionDigits:4}).format(basisPoints/100);
// A share of an envelope, rounded once to the nearest kobo (withinShare is an optional second share of that).
export function allocatedAmount(envelope: string, componentShare: number, withinShare=10000) {
  const [whole,fraction='']=envelope.split('.');
  const cents=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
  const component=(cents*BigInt(componentShare)+BigInt(5000))/BigInt(10000);
  const result=(component*BigInt(withinShare)+BigInt(5000))/BigInt(10000);
  return `${result/BigInt(100)}.${String(result%BigInt(100)).padStart(2,'0')}`;
}

// Components that can receive their own other funding (UBEC04/05). TLM has no policy share: it shares the infrastructure pool.
export const fundingComponentIds = ['infrastructure','tlm','quality','teachers','sbmc','sports','monitoring','curriculum','planning','gscci'] as const satisfies readonly import('./beap-pillars').PillarId[];
export type FundingComponent = typeof fundingComponentIds[number];
export const fundingComponentLabels: Record<FundingComponent,string> = {infrastructure:'Infrastructure',tlm:'TLM',quality:'Quality Assurance',teachers:'Teacher Development & ICT',sbmc:'SBMC',sports:'Sports',monitoring:'Supervision & Monitoring',curriculum:'Curriculum',planning:'Planning, Research & Statistics',gscci:'Greening, Climate & Safeguarding'};
/** A funding source for every component (migration 041): shared across components by the policy shares, like the state contribution. */
export const planWideFunding = 'all' as const;
/** What a funding source can be for: one component, or 'all' (plan-wide, listed first). */
export const fundingSourceTargets = [planWideFunding, ...fundingComponentIds] as const;
export type FundingSourceTarget = typeof fundingSourceTargets[number];
export const fundingSourceLabels: Record<FundingSourceTarget, string> = { all: 'All components', ...fundingComponentLabels };
export type FundingSource = { id?: number; component: FundingSourceTarget; funder: string; amount: string };
/** The plan fields the envelope helpers read; every plan loaded with planFields/planSetupFields has them. */
export type EnvelopePlan = {
  stateLodgment?: string | null; otherFunding?: string | null; fundingPolicy?: FundingPolicy | null; fundingSources?: readonly FundingSource[] | null; ictAllocation?: string | null;
  /** TLM's amount of the Infrastructure & TLM pool (migration 051); Infrastructure keeps the rest. Null until set. Ignored in shared_pool mode. */
  tlmAllocation?: string | null;
  /** The platform's Infrastructure & TLM mode when the plan was read (GLOBAL setting, migration 051). Missing (older snapshots) means shared_pool. */
  infrastructureTlmMode?: InfrastructureTlmMode | null;
};
/** How Infrastructure and TLM use their shared pool (Super Admin, platform-wide; migration 051). */
export const infrastructureTlmModes = ['split', 'shared_pool'] as const;
export type InfrastructureTlmMode = typeof infrastructureTlmModes[number];
/** True when Infrastructure and TLM each have their own part of the pool (action_plans.tlm_allocation). */
export const isSplitMode = (plan: EnvelopePlan) => plan.infrastructureTlmMode === 'split';
/** Ceilings: every funding component plus ICT, which takes its allocation out of the shared Teacher Development and ICT envelope. */
export type EnvelopeComponent = FundingComponent | 'ict';

export const toKobo = (amount: string) => { const [whole, fraction = ''] = amount.split('.'); return BigInt(whole || '0') * BigInt(100) + BigInt(fraction.padEnd(2, '0').slice(0, 2)); };
export const fromKobo = (kobo: bigint) => `${kobo < 0 ? '-' : ''}${(kobo < 0 ? -kobo : kobo) / BigInt(100)}.${String((kobo < 0 ? -kobo : kobo) % BigInt(100)).padStart(2, '0')}`;
/** Sum of funding sources, optionally for one target (a component or 'all'), as a "123.45" string. */
export function sourcesTotal(sources: readonly FundingSource[] | null | undefined, component?: FundingSourceTarget) {
  return fromKobo((sources ?? []).filter(s => !component || s.component === component).reduce((sum, s) => sum + toKobo(s.amount), BigInt(0)));
}
/**
 * Envelope spread by the policy shares: state contribution ×2, any legacy (pre-035) other funding and every
 * plan-wide ('all') funding source. Null until funding is set.
 */
export function sharedEnvelope(plan: EnvelopePlan) {
  if (plan.stateLodgment == null) return null;
  return fromKobo(toKobo(plan.stateLodgment) * BigInt(2) + toKobo(plan.otherFunding ?? '0') + toKobo(sourcesTotal(plan.fundingSources, planWideFunding)));
}
/**
 * Budget ceiling of one component, in naira as a "123.45" string, or null until the plan funding is set.
 *   ceiling = component's policy share of sharedEnvelope(plan) (which includes plan-wide 'all' sources) + sum of the plan's funding sources for that component.
 * Infrastructure and TLM share one pool (infrastructurePoolEnvelope). In split mode 'tlm' is plan.tlmAllocation and
 * 'infrastructure' is the pool less it (both null until the split is set). In shared_pool mode each one's ceiling is the
 * whole pool and their totals together may not exceed it (infrastructurePoolProblem in lib/infrastructure-pool.ts).
 * 'teachers' is the shared Teacher Development and ICT envelope (teachersSharedEnvelope) less ICT's allocation, and
 * 'ict' is that allocation (plan.ictAllocation, null until the ICT editor sets it). Other components are unaffected by a source.
 * Example: componentEnvelope(plan, 'monitoring'), with `plan` from resolveActionPlan/planFields or a snapshot's setup.
 */
export function componentEnvelope(plan: EnvelopePlan, component: EnvelopeComponent) {
  if (component === 'ict') return sharedEnvelope(plan) == null || plan.ictAllocation == null ? null : fromKobo(toKobo(plan.ictAllocation));
  if ((component === 'tlm' || component === 'infrastructure') && isSplitMode(plan)) {
    const pool = infrastructurePoolEnvelope(plan);
    if (pool == null || plan.tlmAllocation == null) return null;
    return component === 'tlm' ? fromKobo(toKobo(plan.tlmAllocation)) : fromKobo(toKobo(pool) - toKobo(plan.tlmAllocation));
  }
  const ceiling = fundingEnvelope(plan, component);
  if (ceiling == null || component !== 'teachers') return ceiling;
  return fromKobo(toKobo(ceiling) - toKobo(plan.ictAllocation ?? '0'));
}
/** The whole Teacher Development and ICT envelope (policy share plus 'teachers' funding sources) that ICT and Teacher Development share. */
export const teachersSharedEnvelope = (plan: EnvelopePlan) => fundingEnvelope(plan, 'teachers');
/**
 * The one pool Infrastructure and TLM draw from: the whole infrastructure policy share of sharedEnvelope plus every
 * 'infrastructure' and 'tlm' funding source. Null until the plan funding is set.
 */
export function infrastructurePoolEnvelope(plan: EnvelopePlan) {
  const shared = sharedEnvelope(plan);
  if (shared == null) return null;
  const share = toKobo(allocatedAmount(shared, policyAllocation(plan).shares.infrastructure));
  return fromKobo(share + toKobo(sourcesTotal(plan.fundingSources, 'infrastructure')) + toKobo(sourcesTotal(plan.fundingSources, 'tlm')));
}
const policyAllocation = (plan: EnvelopePlan) => plan.fundingPolicy?.allocation ?? defaultAllocation;
type PolicyShareKey = keyof Allocation['shares'];
/** The funding-policy share key a component draws from: TLM uses Infrastructure's, ICT uses Teacher Development's. */
export const policyShareKey = (component: EnvelopeComponent): PolicyShareKey => component === 'tlm' ? 'infrastructure' : component === 'ict' ? 'teachers' : component;
/** The component's funding-policy share in basis points, from the plan's pinned policy (shared by TLM/Infrastructure and ICT/Teacher Development). */
export const policyShare = (plan: EnvelopePlan, component: EnvelopeComponent) => policyAllocation(plan).shares[policyShareKey(component)];
function fundingEnvelope(plan: EnvelopePlan, component: FundingComponent) {
  if (component === 'infrastructure' || component === 'tlm') return infrastructurePoolEnvelope(plan);
  const shared = sharedEnvelope(plan);
  if (shared == null) return null;
  const share = toKobo(allocatedAmount(shared, policyAllocation(plan).shares[component]));
  return fromKobo(share + toKobo(sourcesTotal(plan.fundingSources, component)));
}
/** componentEnvelope for every component, or null until the plan funding is set. */
export function componentEnvelopes(plan: EnvelopePlan) {
  if (sharedEnvelope(plan) == null) return null;
  return Object.fromEntries(fundingComponentIds.map(id => [id, componentEnvelope(plan, id)!])) as Record<FundingComponent, string>;
}
