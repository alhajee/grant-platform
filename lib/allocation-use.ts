import { componentEnvelope, infrastructurePoolEnvelope, isSplitMode, toKobo, type EnvelopePlan } from './funding-policy';
import { formatKobo } from './money-format';
import { activityNames, activityShareCaps, activityShareGroups, activityTitles, capActivities, type ActivityWorkstream } from './activity-plans';
import { activityCapKobo } from './activity-budget';
import { isChosen, planSelection } from './activity-selection';
import { sportsSectionBudgets, subActivityBudget, sportsSubActivities } from './sports';
import type { ImplementedPillar } from './beap-pillars';
import type { Snapshot } from './plan-review';

// Full use of allocations (UBEC79, client 26 October 2026: "all must be exhausted both ways"). A component is sent (to the
// Director, the BEAP Chair, the Executive Chairman or UBEC) only once its items use its whole allocation, and every capped
// part of it uses its whole share too: the activity shares (Curriculum 60/20/10/10, Quality Assurance, SBMC), the Sports
// sections and the Sports Competitions sub-activities. Fixed naira caps (ICT Model Smart Schools ₦30M) are ceilings, not
// shares, and are not required in full. In shared-pool mode Infrastructure and TLM together must use the whole pool.
// Governed by the Super Admin setting state_workflow_settings.full_allocation_required (migration 076, default on).

type Costed = { quantity: number; unit_cost: string };
const kobo = (lines: readonly Costed[]) => lines.reduce((sum, l) => sum + toKobo(String(l.unit_cost)) * BigInt(l.quantity), BigInt(0));
/** A share inside the component (an activity, a Sports section or sub-activity) not used in full. */
const short = (what: string, cap: bigint, used: bigint) => `${what} must use all of its ${formatKobo(cap)} before sending. Its items come to ${formatKobo(used)}, so ${formatKobo(cap - used)} is left`;
/** The component (or shared budget) not used in full. */
const shortWhole = (what: string, cap: bigint, used: bigint) => `Use the whole ${what} (${formatKobo(cap)}) before sending. The items come to ${formatKobo(used)}, so ${formatKobo(cap - used)} is left`;
const activityWorkstreams = ['sbmc', 'tlm', 'monitoring', 'gscci', 'curriculum', 'quality', 'ict', 'teachers', 'planning'] as const;

/** Each activity share (or shared group) that is not used in full, as a message, or null. Unchosen QA activities have no share. */
function activitySharesProblem(workstream: ActivityWorkstream, lines: readonly (Costed & { activity: number })[], envelope: bigint, plan: EnvelopePlan): { problem: string | null; caps: number } {
  const selection = planSelection(workstream, plan as { qualityActivities?: readonly number[] | null });
  const firsts = [...Object.keys(activityShareCaps[workstream] ?? {}).map(Number), ...(activityShareGroups[workstream] ?? []).map(g => g.activities[0])];
  let caps = 0;
  for (const activity of firsts) {
    const group = capActivities(workstream, activity);
    if (!group.some(a => isChosen(workstream, selection, a))) continue;
    caps++;
    const cap = activityCapKobo(workstream, envelope, activity, selection), used = kobo(lines.filter(l => group.includes(l.activity)));
    if (used < cap) return { problem: short(group.map(a => `‘${activityNames[workstream][a]}’`).join(' and '), cap, used), caps };
  }
  return { problem: null, caps };
}

/** Why `pillar` does not yet use its whole allocation (and every share inside it), or null. Nothing is checked before the plan has funding or the split is set. */
export function allocationUseProblem(pillar: ImplementedPillar, snapshot: Snapshot): string | null {
  const plan = snapshot.setup;
  if (!plan || plan.stateLodgment == null) return null;
  // Shared pool: Infrastructure and TLM use the pool together.
  if ((pillar === 'infrastructure' || pillar === 'tlm') && !isSplitMode(plan)) {
    const pool = infrastructurePoolEnvelope(plan), used = kobo(snapshot.infrastructure ?? []) + kobo(snapshot.tlm ?? []);
    return pool != null && used < toKobo(pool) ? shortWhole('shared Infrastructure & TLM budget', toKobo(pool), used) : null;
  }
  const envelope = componentEnvelope(plan, pillar);
  if (envelope == null) return null;
  const whole = toKobo(envelope);
  const name = pillar === 'infrastructure' ? 'Infrastructure' : pillar === 'sports' ? 'Sports, Quiz & Debate' : activityTitles[pillar as ActivityWorkstream];
  if (pillar === 'sports') {
    const lines = (snapshot.sports ?? []).map(l => ({ section: l.section, activityType: l.activity_type, kobo: toKobo(String(l.unit_cost)) * BigInt(l.quantity) }));
    for (const { section, proposed, cap } of sportsSectionBudgets(lines, whole)) {
      if (cap != null && proposed < cap) return short(`‘${section.label}’`, cap, proposed);
      for (const sub of (sportsSubActivities as Record<string, readonly { name: string; share?: number }[]>)[section.id] ?? []) {
        const budget = sub.share ? subActivityBudget(lines, whole, section.id, sub.name) : null;
        if (budget && budget.proposed < budget.cap) return short(`‘${sub.name}’`, budget.cap, budget.proposed);
      }
    }
    const used = lines.reduce((sum, l) => sum + l.kobo, BigInt(0));
    // Section caps are rounded to the kobo, so a few kobo may stay unassigned once every section is used in full.
    return used + BigInt(4) < whole ? shortWhole('Sports allocation', whole, used) : null;
  }
  if (pillar === 'infrastructure') { const used = kobo(snapshot.infrastructure ?? []); return used < whole ? shortWhole(`${name} allocation`, whole, used) : null; }
  if (!(activityWorkstreams as readonly string[]).includes(pillar)) return null;
  const lines = snapshot[pillar as ActivityWorkstream] ?? [];
  const shares = activitySharesProblem(pillar as ActivityWorkstream, lines, whole, plan);
  if (shares.problem) return shares.problem;
  const used = kobo(lines);
  return used + BigInt(shares.caps) < whole ? shortWhole(`${name} allocation`, whole, used) : null;
}
