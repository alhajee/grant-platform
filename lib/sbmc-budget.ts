import { componentEnvelope, fundingComponentLabels, toKobo, type EnvelopePlan, type FundingComponent } from './funding-policy';

export const budgetKobo = toKobo;
const naira = (kobo: bigint) => `₦${(kobo / BigInt(100)).toLocaleString('en-NG')}.${String(kobo % BigInt(100)).padStart(2, '0')}`;
/** Checks a component's proposed total (kobo) against its ceiling (policy share + its own funding sources). */
export function componentBudgetProblem(total: bigint, plan: EnvelopePlan, component: FundingComponent, exact = false) {
  const label = fundingComponentLabels[component];
  const ceiling = componentEnvelope(plan, component);
  if (ceiling == null) return `Set the plan funding before allocating the ${label} budget.`;
  const difference = total - budgetKobo(ceiling);
  const amount = naira(difference < 0 ? -difference : difference);
  if (difference > 0) return `You have exceeded your allocated amount by ${amount}. Reduce the budget to continue.`;
  if (exact && difference < 0) return `You still have ${amount} to allocate. The proposed ${label} budget must exactly match its allocated amount before sending for review.`;
  return null;
}
export const sbmcBudgetProblem = (total: bigint, plan: EnvelopePlan, exact = false) => componentBudgetProblem(total, plan, 'sbmc', exact);
