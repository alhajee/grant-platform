import type { ImplementedPillar } from '@/lib/beap-pillars';

export type Officer = { id: number; name: string; email: string };
export type DepartmentComponent = { pillar: ImplementedPillar; name: string; defaults: number[] };
export type Department = {
  department: string; name: string; short: string; components: DepartmentComponent[];
  defaultLimit: number; limit: number; custom: boolean; active: number; warning: string | null; officers: Officer[];
};
export type ReleasedPlan = { planId: number; state: string; period: string; round: number; releasedAt: string | null; atDirector: number; released: number };
export type OfficerSettings = { departments: Department[]; plans: ReleasedPlan[] };
export type OfficerDraft = { limits: Record<string, string>; defaults: Record<string, number[]> };
export type OfficerChanges = { limits: { department: string; limit: number | null }[]; defaults: { pillar: ImplementedPillar; officerIds: number[] }[] };

export const minLimit = 1, maxLimit = 50;

export const draftOf = (settings: OfficerSettings): OfficerDraft => ({
  limits: Object.fromEntries(settings.departments.map(d => [d.department, String(d.limit)])),
  defaults: Object.fromEntries(settings.departments.flatMap(d => d.components.map(c => [c.pillar, c.defaults]))),
});

export const sameIds = (a: readonly number[], b: readonly number[]): boolean => {
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((id, i) => id === y[i]);
};

export const validLimit = (value: string): boolean => /^\d{1,2}$/.test(value) && Number(value) >= minLimit && Number(value) <= maxLimit;

/** The PUT body: only limits and defaults that differ from what is saved (a limit back at its default is sent as null). */
export function changesOf(saved: OfficerSettings, draft: OfficerDraft): OfficerChanges {
  const limits = saved.departments.filter(d => draft.limits[d.department] !== String(d.limit))
    .map(d => ({ department: d.department, limit: Number(draft.limits[d.department]) === d.defaultLimit ? null : Number(draft.limits[d.department]) }));
  const defaults = saved.departments.flatMap(d => d.components).filter(c => !sameIds(draft.defaults[c.pillar] ?? [], c.defaults))
    .map(c => ({ pillar: c.pillar, officerIds: draft.defaults[c.pillar] ?? [] }));
  return { limits, defaults };
}

/** "UBEC Assessment Officer – Sports" reads as "Sports"; a person's name is kept as it is. */
export function officerLabel(name: string): string {
  const short = name.replace(/^UBEC\s+Assessment\s+Officer\s*[–—-]\s*/i, '').trim();
  return short || name;
}

export function initialsOf(label: string): string {
  const words = label.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}
