import type { ZodIssue } from 'zod';

// Field names as the form labels them, for "Fill in …" explanations.
const fieldLabels: Record<string, string> = {
  activity: 'Allowable activity', description: 'Description', quantity: 'Quantity', unitCost: 'Unit cost',
  strategy: 'Implementation strategy', targetGroup: 'Target group', rationale: 'Rationale',
  implementationApproach: 'Implementation approach', customActivity: 'Activity name', textbookClasses: 'Classes',
  textbookSubject: 'Subject', equipmentType: 'Equipment type', websiteType: 'Website type',
  subscriptionTypes: 'Subscription types', schoolIds: 'Schools',
  trainingProvider: 'Training provider', targetParticipants: 'Target participants', schoolLevels: 'School level',
  venueType: 'Venue type', quarters: 'Timeline',
};

export type SaveState = {
  busy: boolean; canEdit: boolean; failed: boolean; needsIctAllocation: boolean;
  /** Whose share of the shared Teacher Development & ICT budget must be saved first. */
  splitName?: string;
  view: 'budget' | 'distribution'; pickedSchools: number;
  /** Validation issues of the item being added or edited (empty when it is complete). */
  issues: readonly ZodIssue[];
  /** Why the item's timeline does not fit the plan's quarters. */
  timelineError?: string | null;
  budgetError: string | null;
};

/** Why the editor's save button is disabled, in plain words; null when it can be used (or is only busy). */
export function saveBlockedReason(state: SaveState): string | null {
  if (state.busy) return null;
  if (state.failed) return 'This component could not be loaded. Reload the page and try again.';
  if (!state.canEdit) return 'You can’t change this component now: it is with a reviewer or outside your departments.';
  if (state.needsIctAllocation) return `Save ${state.splitName ?? 'ICT'}’s share of the shared budget first.`;
  if (state.view === 'distribution') return state.pickedSchools ? null : 'Tick at least one school to add.';
  if (state.issues.length) {
    const fields = [...new Set(state.issues.map(issue => fieldLabels[String(issue.path[0] ?? '')] ?? issue.message))];
    const missing = fields.filter(field => !field.endsWith('.'));
    return missing.length ? `Fill in ${missing.join(', ')}.` : fields[0];
  }
  return state.timelineError || state.budgetError;
}
