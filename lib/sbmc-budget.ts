import { componentEnvelope, fundingComponentLabels, toMinor, type EnvelopePlan, type FundingComponent } from './funding-policy';
import { formatMinor } from './money-format';

export const budgetMinor = toMinor;
const naira = formatMinor;
/** Checks a component's proposed total (minor units, lib/money.ts) against its ceiling (policy share + its own funding sources). */
export function componentBudgetProblem(total: bigint, plan: EnvelopePlan, component: FundingComponent, exact = false) {
  const label = fundingComponentLabels[component];
  const ceiling = componentEnvelope(plan, component);
  if (ceiling == null) return `Set the plan funding before allocating the ${label} budget`;
  const difference = total - budgetMinor(ceiling);
  const amount = naira(difference < 0 ? -difference : difference);
  if (difference > 0) return `You have exceeded your allocated amount by ${amount}. Reduce the budget to continue.`;
  if (exact && difference < 0) return `You still have ${amount} to allocate. The proposed ${label} budget must exactly match its allocated amount before sending for review.`;
  return null;
}
export const sbmcBudgetProblem = (total: bigint, plan: EnvelopePlan, exact = false) => componentBudgetProblem(total, plan, 'sbmc', exact);
