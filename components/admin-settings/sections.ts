import { FileCheckIcon, PlugZapIcon, SchoolIcon, UsersRoundIcon, WalletIcon, WorkflowIcon, type LucideIcon } from 'lucide-react';

export const settingsSections = ['workflow', 'documents', 'budget', 'officers', 'schools', 'dnemis'] as const;
export type SettingsSection = typeof settingsSections[number];

export const sectionGroups: { label: string; items: { id: SettingsSection; label: string; icon: LucideIcon }[] }[] = [
  { label: 'Plans', items: [
    { id: 'workflow', label: 'SUBEB workflow', icon: WorkflowIcon },
    { id: 'documents', label: 'Supporting documents', icon: FileCheckIcon },
    { id: 'budget', label: 'Infrastructure & TLM budget', icon: WalletIcon },
  ] },
  { label: 'UBEC', items: [{ id: 'officers', label: 'Assessment Officers', icon: UsersRoundIcon }] },
  { label: 'Data', items: [
    { id: 'schools', label: 'School register source', icon: SchoolIcon },
    { id: 'dnemis', label: 'DNEMIS integration', icon: PlugZapIcon },
  ] },
];

const legacy: Record<string, SettingsSection> = { 'ubec-officers': 'officers', integrations: 'dnemis', workflow: 'workflow', 'school-register': 'schools' };
const storageKey = 'beapms:admin:settings-section';

export const isSection = (value: string | null | undefined): value is SettingsSection => (settingsSections as readonly string[]).includes(value ?? '');

/** `?section=` or the hash (also the old `?tab=integrations` and `#ubec-officers` links), else the last section used. */
export function sectionFromUrl(search: URLSearchParams, hash: string): SettingsSection | null {
  const wanted = search.get('section') ?? hash.replace(/^#/, '');
  if (isSection(wanted)) return wanted;
  return legacy[wanted] ?? legacy[search.get('tab') ?? ''] ?? null;
}

export function rememberedSection(): SettingsSection | null {
  try { const value = window.localStorage.getItem(storageKey); return isSection(value) ? value : null; } catch { return null; }
}

export function rememberSection(section: SettingsSection): void {
  try { window.localStorage.setItem(storageKey, section); } catch { /* private mode: nothing to remember */ }
}
