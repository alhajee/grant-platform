import { z } from 'zod';

// Platform rules the client changes often (19 November 2026, migration 105): the Super Admin turns each on or off on
// Admin > Settings > Requirements instead of waiting for a code change. Stored as JSON on the GLOBAL settings row
// (state_workflow_settings.platform_rules); a missing key keeps its default, so the defaults are the rules as they were.
// Server reads: lib/platform-rules-db.ts. Client code receives them from the APIs that need them.

export const platformRulesSchema = z.object({
  /** Infrastructure: each school's Bill of Quantities before a package is saved and at every send step (UBEC170). */
  boqRequired: z.boolean(),
  /** New Construction drawings for each school (UBEC230). */
  drawingsRequired: z.boolean(),
  /** New Construction land documents: land availability and C of O / R of O / Community Agreement (UBEC83/126). */
  landDocumentsRequired: z.boolean(),
  /** Teacher Development lines: Budget Breakdown and Training List of Participants (UBEC209). */
  teacherDocumentsRequired: z.boolean(),
  /** Proforma invoice on goods from the price-list activities (UBEC229). */
  proformaRequired: z.boolean(),
  /** SUBEB Finance's three documents before the Executive Chairman sends to UBEC (UBEC217). */
  financeHoldsUbec: z.boolean(),
  /** The Executive Chairman's signature and cover letter on Send to UBEC (UBEC132). */
  submissionLetterRequired: z.boolean(),
  /** A RAT rejected by UBEC Planning holds approval (UBEC205). */
  ratRejectionHoldsApproval: z.boolean(),
  /** Open comments by the Oversight Departments hold approval (UBEC56/95). */
  oversightCommentsHoldApproval: z.boolean(),
  /** Infrastructure Assessment Officers upload a Validation Report before Complete assessment (UBEC140; optional since 19 November 2026). */
  validationReportRequired: z.boolean(),
  /** The least share of the plan ECCDE needs when the ECCDE share rule is on (UBEC231), in percent. */
  eccdePercent: z.number().min(1).max(100).multipleOf(0.5),
});
export type PlatformRules = z.infer<typeof platformRulesSchema>;
export type PlatformRuleSwitch = Exclude<keyof PlatformRules, 'eccdePercent'>;

export const defaultPlatformRules: PlatformRules = {
  boqRequired: true, drawingsRequired: true, landDocumentsRequired: true, teacherDocumentsRequired: true, proformaRequired: true,
  financeHoldsUbec: true, submissionLetterRequired: true,
  ratRejectionHoldsApproval: true, oversightCommentsHoldApproval: true, validationReportRequired: false,
  eccdePercent: 15,
};

/** Stored JSON (or anything) to the full rules: each valid key is kept, the rest take their defaults. */
export function withRuleDefaults(stored: unknown): PlatformRules {
  const source = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  const shape = platformRulesSchema.shape;
  return Object.fromEntries((Object.keys(defaultPlatformRules) as (keyof PlatformRules)[]).map(key => {
    const parsed = shape[key].safeParse(source[key]);
    return [key, parsed.success ? parsed.data : defaultPlatformRules[key]];
  })) as PlatformRules;
}

/** A PUT body: any subset of the rules. */
export const platformRulesPatchSchema = platformRulesSchema.partial().strict();
