import { allocatedAmount, defaultAllocation, type FundingPolicy } from './funding-policy';

export const budgetKobo = (amount: string) => {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
};
export function sbmcBudgetProblem(total: bigint, setup: { fundingTotal?: string | null; fundingPolicy?: FundingPolicy }, exact = false) {
  if (setup.fundingTotal == null) return 'Set the plan funding before allocating the SBMC budget.';
  const allocation = allocatedAmount(setup.fundingTotal, (setup.fundingPolicy?.allocation ?? defaultAllocation).shares.sbmc);
  const difference = total - budgetKobo(allocation);
  const absolute = difference < 0 ? -difference : difference;
  const amount = `₦${(absolute / BigInt(100)).toLocaleString('en-NG')}.${String(absolute % BigInt(100)).padStart(2, '0')}`;
  if (difference > 0) return `You have exceeded your allocated amount by ${amount}. Reduce the budget to continue.`;
  if (exact && difference < 0) return `You still have ${amount} to allocate. The proposed SBMC budget must exactly match its allocated amount before sending for review.`;
  return null;
}
