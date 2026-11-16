import { z } from 'zod';

/** UBEC261: display choices saved to the account (users.ui_preferences, migration 103), so they follow the person. */
export const uiPreferencesSchema = z.object({
  assessLayout: z.enum(['list', 'grid']),
  assessText: z.enum(['normal', 'large']),
}).partial().strict();
export type UiPreferences = z.infer<typeof uiPreferencesSchema>;

/** Reads a stored value, keeping only known keys with valid values (older or unknown keys are ignored). */
export function readUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== 'object') return {};
  const known = Object.fromEntries(Object.entries(value).filter(([key]) => key in uiPreferencesSchema.shape));
  const parsed = uiPreferencesSchema.safeParse(known);
  if (parsed.success) return parsed.data;
  const kept: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(uiPreferencesSchema.shape)) {
    const one = field.safeParse(known[key]);
    if (one.success && one.data !== undefined) kept[key] = one.data;
  }
  return kept as UiPreferences;
}
