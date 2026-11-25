// Explicit .ts so the Node test scripts can load this file directly. A leaf module: no imports from the components.
import { z } from 'zod';

/**
 * Implementation (procurement) strategies of the activity components (client list, October 2026; Infrastructure keeps
 * its own). Stored values stay short and stable; `strategyLabels` gives the names shown. The retired ones stay valid on
 * lines that already use them, but cannot be chosen again (the save route refuses a change to one).
 */
// UBEC159 (28 October 2026): ICB, Non-Consultancy and Non-Applicable added. Non-Applicable lines say what is used instead
// (e.g. E-payment/cash transfer, direct payment to vendor), stored as "Non-Applicable: <what>" (`withStrategyDetail`).
export const implementationStrategies = ['ICB', 'NCB', 'Request for quotation', 'Market survey', 'Single source/Direct contracting', 'Prequalification', 'Quality and cost based', 'Consultant Qualification', 'Least cost', 'Non-Consultancy', 'Non-Applicable'] as const;
export const nonApplicableStrategy = 'Non-Applicable';
export const maxStrategyDetailLength = 100;
const nonApplicablePrefix = `${nonApplicableStrategy}: `;
/** "Non-Applicable: E-payment" → { strategy: 'Non-Applicable', detail: 'E-payment' }; any other value has no detail. */
export const splitStrategy = (value: string) => value.startsWith(nonApplicablePrefix) ? { strategy: nonApplicableStrategy, detail: value.slice(nonApplicablePrefix.length) } : { strategy: value, detail: '' };
export const withStrategyDetail = (strategy: string, detail: string) => strategy === nonApplicableStrategy && detail.trim() ? `${nonApplicablePrefix}${detail.trim().slice(0, maxStrategyDetailLength)}` : strategy;
export const isNonApplicable = (value: string) => splitStrategy(value).strategy === nonApplicableStrategy;
export const retiredStrategies = ['E-payment/Cash transfer', 'Credit School account', 'Credit SBMC school account', 'Credit staff concern account', 'Direct payment to vendor'] as const;
export const strategyLabels: Record<string, string> = {
  ICB: 'ICB (International Competitive Bidding)', NCB: 'NCB (National Competitive Bidding)', 'Request for quotation': 'Request for Quotation', 'Market survey': 'Market Survey (Shopping)',
  'Single source/Direct contracting': 'Single Source/Direct Contracting',
};
export const strategyLabel = (value: string) => { const { strategy, detail } = splitStrategy(value); return detail ? `${strategy} (${detail})` : strategyLabels[value] ?? value; };
export const isRetiredStrategy = (value: string) => (retiredStrategies as readonly string[]).includes(value);
/** A stored strategy: a listed one, a retired one (kept on older lines), '' or "Non-Applicable: <what is used instead>". */
export const strategyValueSchema = z.union([z.enum(implementationStrategies), z.enum(retiredStrategies), z.literal(''), z.string().regex(new RegExp(`^${nonApplicableStrategy}: \\S.{0,${maxStrategyDetailLength - 1}}$`), 'Say what is used instead (up to 100 characters)')]);
