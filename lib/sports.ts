import { z } from "zod";
// Explicit .ts so the Node test scripts can load this file directly.
import { componentEnvelope, toMinor, type EnvelopePlan } from "./funding-policy.ts";
import { lineQuartersSchema } from "./line-quarters.ts";
import { lineDatesShape } from "./line-dates.ts";
import { formatMinor, nairaFormat } from "./money-format.ts";
import { targetGroupField } from "./target-groups.ts";
import { MONEY_SCALE, hasMoneyDecimals, lineMinor, lineTotalIsSafe, maxUnitCost, minorToNaira, moneyDecimalsMessage, shareToKobo } from "./money.ts";

// The four UBEC sports budget sections (QA UBEC18) with their share of the sports
// allocation. Each share is a cap: a section's lines may not exceed share × the sports envelope.
export const sportsSections = [
  { id: "equipment", label: "Procurement & Training of PHE Officers", shortLabel: "Procurement & PHE training", share: 60, typeLabel: "Sport", itemLabel: "Item", placeholder: "Choose a sport or type another…" },
  { id: "competitions", label: "Sports Competitions", shortLabel: "Competitions", share: 30, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose a competition…" },
  { id: "publicity", label: "Publicity & Administration", shortLabel: "Publicity & admin", share: 5, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose an activity…" },
  { id: "supervision", label: "Supervision, Assessment and Verification", shortLabel: "Supervision", share: 5, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose a sub-activity…" },
  // UBEC167 (migration 084): no share; its cap is the amount the SUBEB set aside for Debate (`debateAllocation`).
  { id: "debate", label: "Debate", shortLabel: "Debate", share: 0, typeLabel: "Programme component", itemLabel: "Activity / item description", placeholder: "Choose a programme component…" },
] as const;

/**
 * UBEC167: Debate lines saved before V2 UBEC07 carry this activity type (it stays valid on them); the section's cap is the
 * plan's Debate amount.
 */
export const debateActivity = "Debate";
/**
 * V2 UBEC07 (bug sheet 18, Debate Items Breakdown): every new Debate line chooses one of these programme components. Shares
 * are of the Debate amount: `max` caps it (save and send), `min` must be reached at send while the Debate amount is above ₦0,
 * `recommended` is a guide. Full use needs the Debate amount used in full, not each recommended share.
 */
export const debateSubActivities = [
  { name: "BESLP Resources and Materials", min: 25, recommended: 30, max: 35 },
  { name: "Literary Competitions", min: 35, recommended: 40, max: 45 },
  { name: "Capacity Building", min: 15, recommended: 20, max: 25 },
  { name: "Verification, Assessment, Reporting and Administration", min: 5, recommended: 10, max: 10 },
] as const;
export type DebateSubActivity = typeof debateSubActivities[number];
export const findDebateSubActivity = (name: string | undefined) => debateSubActivities.find((item) => item.name === name?.trim());
export const debateNotSet = "Set how much of the Sports allocation goes to Debate first (₦0 if none)";
/** The plan's Debate amount in minor units, or null until set. */
export const debateMinor = (plan: { debateAllocation?: string | null } | null | undefined) => plan?.debateAllocation == null ? null : toMinor(plan.debateAllocation);

/** Procurement: at most this many distinct sports per plan (QA UBEC19). */
export const maxEquipmentSports = 3;
/** Suggestions only: any sport (up to the limit) and any item can be typed, since no list can be complete. */
type SportCatalogEntry = { name: string; items: readonly string[] };
export const sportsCatalog: readonly SportCatalogEntry[] = [
  { name: "Football", items: ["Footballs", "Goal posts", "Football nets", "Cones", "Bibs/Jerseys", "Whistles", "Corner flags"] },
  { name: "Volleyball", items: ["Volleyballs", "Volleyball net", "Net poles", "Knee pads", "Whistles"] },
  { name: "Basketball", items: ["Basketballs", "Basketball hoop/backboard", "Bibs/Jerseys", "Whistles"] },
  { name: "Badminton", items: ["Badminton rackets", "Shuttlecocks", "Badminton net", "Net poles"] },
  { name: "Handball", items: ["Handballs", "Goal posts", "Bibs/Jerseys", "Whistles"] },
  { name: "Tennis", items: ["Tennis rackets", "Tennis balls", "Tennis net", "Net poles"] },
  { name: "Athletics", items: ["Starting blocks", "Stopwatches", "Measuring tape", "Hurdles", "Javelins", "Discus", "Shot put", "Relay batons", "Cones"] },
  { name: "Gymnastics", items: ["Gymnastic mats", "Balance beam", "Vaulting box", "Ribbons/hoops"] },
  { name: "Board Games", items: ["Chess sets", "Ludo sets", "Draughts/Checkers sets", "Scrabble sets"] },
];
/**
 * Sub-activities per section. `share` is a cap: the sub-activity's % of its section's cap (competitions; Debate: its maximum
 * share of the Debate amount, with `min` and `recommended` from debateSubActivities).
 */
export type SportsSubActivity = { name: string; share?: number; min?: number; recommended?: number };
export const sportsSubActivities: Record<"competitions" | "publicity" | "supervision" | "debate", readonly SportsSubActivity[]> = {
  competitions: [{ name: "Inter School Competition", share: 5 }, { name: "Inter Local Government Competition", share: 10 }, { name: "State Finals Competition", share: 40 }, { name: "Geo-Political (Zonal) Finals", share: 25 }, { name: "National Finals", share: 10 }, { name: "Other Competitions", share: 10 }],
  publicity: [{ name: "Sensitization of Key Stakeholders" }, { name: "Electronic Media" }, { name: "Print Media" }, { name: "Social Media" }, { name: "Others" }],
  // UBEC166: chosen before the activity / item description. No shares.
  supervision: [{ name: "Supervision" }, { name: "Assessment" }, { name: "Verification" }],
  debate: debateSubActivities.map(({ name, min, recommended, max }) => ({ name, share: max, min, recommended })),
};
/** The "Other Competitions" and "Others" sub-activities: the description names the activity. */
export const isOtherSubActivity = (name: string) => /^others?\b/i.test(name.trim());
/**
 * Procurement & Training of PHE Officers (UBEC121): a line is either procurement (a sport and an item) or training, which
 * carries this activity type with a description, quantity and unit cost. Training is not a sport (no limit) and is not an
 * equipment item allocated to schools.
 */
export const pheTrainingActivity = "Training of PHE Officers";
export const isPheTraining = (line: { section: string; activityType: string }) => line.section === "equipment" && line.activityType.trim().toLowerCase() === pheTrainingActivity.toLowerCase();
/** Supervision lines saved before UBEC166 carry the section name as their activity type; it stays valid for them. */
export const supervisionActivity = "Supervision, Assessment and Verification";

const key = (value: string) => value.trim().toLowerCase();
export const findSport = (name: string) => sportsCatalog.find((sport) => key(sport.name) === key(name));
/** Distinct procurement sports already in the plan, ignoring one line (the one being edited). */
export function equipmentSports(lines: readonly { id?: number; section: string; activityType: string }[], exceptId?: number) {
  return [...new Map(lines.filter((line) => line.section === "equipment" && !isPheTraining(line) && line.id !== exceptId).map((line) => [key(line.activityType), line.activityType.trim()])).values()];
}
/** Returns an error for the field that breaks a catalogue rule, or null. */
export function sportsCatalogError(line: { section: SportsSection; activityType: string; description: string }, others: readonly { id?: number; section: string; activityType: string }[], exceptId?: number): { field: "activityType" | "description"; message: string } | null {
  if (line.section === "equipment") {
    if (isPheTraining(line)) return null;
    const used = equipmentSports(others, exceptId);
    if (!used.some((sport) => key(sport) === key(line.activityType)) && used.length >= maxEquipmentSports) return { field: "activityType", message: `You can select up to ${maxEquipmentSports} sports (${used.join(", ")}). Add items to one of these sports instead.` };
    return null;
  }
  if (line.section === "competitions" || line.section === "publicity" || line.section === "supervision" || line.section === "debate") {
    if (line.section === "supervision" && line.activityType.trim() === supervisionActivity) return null;
    if (!sportsSubActivities[line.section].some((item) => item.name === line.activityType.trim())) return { field: "activityType", message: "Choose a sub-activity from the list" };
  }
  return null;
}

export type SportsSection = typeof sportsSections[number]["id"];
export type SportsSchool = { id: number; name: string; lga: string; level: string; location: "Rural" | "Urban"; /** DNEMIS school code */ code?: string | null };
export type SportsLine = { id: number; code: string; section: SportsSection; activityType: string; description: string; quantity: number; unitCost: number;
  /** UBEC219 (migration 091): target groups joined ("Schools, Teachers"); '' on lines saved before. */
  targetGroup: string;
  /** Timeline: implementation quarters within the plan's quarters (migration 050). */
  quarters: number[];
  /** Expected start and due dates (migration 059, YYYY-MM-DD); null on lines saved before. */
  startDate?: string | null; dueDate?: string | null;
  /** The client key the row was created with (migration 058), null for older rows. */
  clientKey?: string | null;
  /** UBEC244 (migration 095): the price-list item picked, null when typed. */
  priceItemId?: number | null };
export type SportsAllocation = { id: number; schoolId: number; lineId: number; quantity: number; longitude: string; latitude: string; clientKey?: string | null; name: string; lga: string; level: string; location: "Rural" | "Urban" };
export type SportsPlan = { lines: SportsLine[]; allocations: SportsAllocation[]; schools: SportsSchool[]; /** UBEC74: the PHE officer training schools. */ trainingSchools?: SportsSchool[] };

const id = z.number().int().positive();
const quantity = z.number().int("Use a whole number").min(1, "Enter a quantity of at least 1").max(1000000, "Use a quantity of 1,000,000 or less");
export const sportsLineSchema = z.object({
  section: z.enum(["equipment", "competitions", "publicity", "supervision", "debate"]),
  activityType: z.string().trim().min(1, "Choose a sport or sub-activity").max(160),
  description: z.string().trim().min(1, "Enter an item or activity description").max(1000),
  /** UBEC219: one or more target groups, required on every save (lines saved before keep '' until edited). */
  targetGroup: targetGroupField.refine((value) => value !== "", "Choose the target group"),
  quantity,
  /** UBEC238: up to four decimals (₦1,250.0202), kept exactly (NUMERIC(16, 4), migration 093). */
  unitCost: z.number().positive("Enter a unit cost greater than zero").max(maxUnitCost, "Enter a unit cost below ₦100 billion")
    .refine(hasMoneyDecimals, moneyDecimalsMessage),
  /** UBEC244 (migration 095): the Procurement price-list item picked for an item bought; the unit cost is its price. */
  priceItemId: z.number().int().positive().nullable().default(null),
  /** Timeline (migration 050); omitted = the plan's quarters. */
  quarters: lineQuartersSchema.optional(),
  /** Expected start and due dates inside the timeline (migration 059); omitted = kept or the whole timeline. */
  ...lineDatesShape,
}).refine((line) => lineTotalIsSafe(line.unitCost, line.quantity), { path: ["unitCost"], message: "This line total is too large" })
  // Supervision lines keep the sub-activity chosen (UBEC166); one not on the list takes the section name, as before.
  .transform((line) => line.section === "supervision" && !sportsSubActivities.supervision.some((item) => item.name === line.activityType) ? { ...line, activityType: supervisionActivity } : line);

const coordinate = (limit: number) => z.string().trim().max(30).default("").refine((value) => value === "" || (/^-?\d+(\.\d+)?$/.test(value) && Math.abs(Number(value)) <= limit), `Enter a coordinate between -${limit} and ${limit}.`);
export const sportsAllocationSchema = z.object({
  schoolId: id,
  lineId: id,
  quantity,
  longitude: coordinate(180),
  latitude: coordinate(90),
});

export function sportsLineTotal(line: Pick<SportsLine, "quantity" | "unitCost">) {
  return minorToNaira(lineMinor(line.unitCost, line.quantity));
}

export function sportsBudget(lines: SportsLine[]) {
  return minorToNaira(lines.reduce((sum, line) => sum + lineMinor(line.unitCost, line.quantity), BigInt(0)));
}

export const sportsMoney = nairaFormat;
/** A sports line's cost in minor units (editor lines carry unitCost, snapshot lines unit_cost). */
// Snapshot lines come from to_jsonb, so their numeric unit_cost may arrive as a JSON number.
export const sportsLineMinor = (line: { unitCost?: number; unit_cost?: string | number; quantity: number }) => {
  const cost = line.unit_cost ?? line.unitCost ?? 0;
  return lineMinor(cost, line.quantity);
};
/** The sports funding envelope in minor units, or null until the plan has funding. */
export function sportsEnvelopeMinor(plan: EnvelopePlan) {
  const envelope = componentEnvelope(plan, "sports");
  return envelope == null ? null : toMinor(envelope);
}
/** A section's cap: its share of the sports envelope, rounded to the kobo (minor units, lib/money.ts). */
export const sportsSectionCapMinor = (envelope: bigint, share: number) => shareToKobo(envelope, BigInt(Math.round(share * 100)), BigInt(10000));

export type SportsBudgetLine = { section: string; minor: bigint; activityType?: string };
/** A sub-activity's share of its section's cap, or null when it has none (publicity, equipment, supervision). */
export function subActivityShare(section: string, activityType: string | undefined): number | null {
  const list = (sportsSubActivities as Record<string, readonly SportsSubActivity[]>)[section];
  return list?.find((item) => item.name === activityType)?.share ?? null;
}
/** A sub-activity's cap: its share of the section's cap, rounded to the kobo. */
export const subActivityCapMinor = (sectionCap: bigint, share: number) => sportsSectionCapMinor(sectionCap, share);
/** The cap, proposed total and share of one sub-activity (null when it has no share or the plan has no funding). */
export function subActivityBudget(lines: readonly SportsBudgetLine[], envelope: bigint | null, section: string, activityType: string | undefined, debate: bigint | null = null) {
  const share = subActivityShare(section, activityType), sectionShare = sportsSections.find((item) => item.id === section)?.share;
  if (share == null || sectionShare == null || envelope == null) return null;
  // V2 UBEC07: a Debate sub-activity's share is of the Debate amount (none until it is set).
  const sectionCap = section === "debate" ? debate : sportsSectionCapMinor(sharedSportsMinor(envelope, debate), sectionShare);
  if (sectionCap == null) return null;
  const cap = subActivityCapMinor(sectionCap, share);
  const proposed = lines.filter((line) => line.section === section && line.activityType === activityType).reduce((sum, line) => sum + line.minor, BigInt(0));
  return { share, cap, proposed };
}
export type SportsSectionBudget = { section: typeof sportsSections[number]; proposed: bigint; cap: bigint | null };
/** The part of the Sports allocation the section shares apply to: the whole of it less the Debate amount (UBEC167). */
export const sharedSportsMinor = (envelope: bigint, debate: bigint | null) => envelope > (debate ?? BigInt(0)) ? envelope - (debate ?? BigInt(0)) : BigInt(0);
/** Proposed total and cap of every section (cap null until the plan has funding). Debate's cap is its amount (0 until set). */
export function sportsSectionBudgets(lines: readonly SportsBudgetLine[], envelope: bigint | null, debate: bigint | null = null): SportsSectionBudget[] {
  return sportsSections.map((section) => ({
    section,
    proposed: lines.filter((line) => line.section === section.id).reduce((sum, line) => sum + line.minor, BigInt(0)),
    cap: envelope == null ? null : section.id === "debate" ? debate ?? BigInt(0) : sportsSectionCapMinor(sharedSportsMinor(envelope, debate), section.share),
  }));
}
/**
 * Why these sports lines break the budget, or null: the whole sports envelope first, then each section's cap
 * (share × envelope). No limit until the plan has funding. `only` limits the section check to one section.
 */
export function sportsBudgetProblem(lines: readonly SportsBudgetLine[], plan: EnvelopePlan, only?: string, onlyActivity?: string): string | null {
  return sportsCapProblem(lines, sportsEnvelopeMinor(plan), only, onlyActivity, debateMinor(plan));
}
/** sportsBudgetProblem with the envelope already known (minor units, null = no funding yet), as the editor has it. */
export function sportsCapProblem(lines: readonly SportsBudgetLine[], envelope: bigint | null, only?: string, onlyActivity?: string, debate: bigint | null = null): string | null {
  if (envelope == null) return null;
  const total = lines.reduce((sum, line) => sum + line.minor, BigInt(0));
  if (total > envelope) return `You have exceeded the Sports allocation (${formatMinor(envelope)}) by ${formatMinor(total - envelope)}. Reduce the budget to continue.`;
  if (debate != null && debate > envelope) return `The Debate amount (${formatMinor(debate)}) is more than the Sports allocation (${formatMinor(envelope)}). Lower it to continue.`;
  for (const { section, proposed, cap } of sportsSectionBudgets(lines, envelope, debate)) {
    if (only && section.id !== only) continue;
    // `only` is set when the lines include an item being added or changed (the editor and the save API).
    const pending = Boolean(only);
    if (section.id === "debate") {
      if (debate == null && proposed > BigInt(0)) return debateNotSet;
      if (cap != null && proposed > cap) return `Debate can use up to ${formatMinor(cap)} (the amount set aside for Debate). ${pending ? "With this item it would come to" : "Its items come to"} ${formatMinor(proposed)}, which is ${formatMinor(proposed - cap)} over.${pending ? "" : " Reduce them to continue."}`;
      // V2 UBEC07: each programme component may use at most its maximum share of the Debate amount.
      const debateActivities = only ? [onlyActivity] : [...new Set(lines.filter((line) => line.section === "debate").map((line) => line.activityType))];
      for (const activity of debateActivities) {
        const budget = subActivityBudget(lines, envelope, "debate", activity, debate);
        if (budget && budget.proposed > budget.cap) return `‘${activity}’ can use up to ${formatMinor(budget.cap)} (${budget.share}% of the Debate amount). ${pending ? "With this item it would come to" : "Its items come to"} ${formatMinor(budget.proposed)}, which is ${formatMinor(budget.proposed - budget.cap)} over.${pending ? "" : " Reduce them to continue."}`;
      }
      continue;
    }
    if (cap != null && proposed > cap) return `‘${section.label}’ can use up to ${formatMinor(cap)} (${section.share}% of the Sports allocation). ${pending ? "With this item it would come to" : "Its items come to"} ${formatMinor(proposed)}, which is ${formatMinor(proposed - cap)} over.${pending ? "" : " Reduce them to continue."}`;
    // Each sub-activity with a share (Sports Competitions) is capped at that share of the section's cap.
    const activities = only ? [onlyActivity] : [...new Set(lines.filter((line) => line.section === section.id).map((line) => line.activityType))];
    for (const activity of activities) {
      const budget = subActivityBudget(lines, envelope, section.id, activity, debate);
      if (budget && budget.proposed > budget.cap) return `‘${activity}’ can use up to ${formatMinor(budget.cap)} (${budget.share}% of ${section.label}). ${pending ? "With this item it would come to" : "Its items come to"} ${formatMinor(budget.proposed)}, which is ${formatMinor(budget.proposed - budget.cap)} over.${pending ? "" : " Reduce them to continue."}`;
    }
  }
  return null;
}
/** V2 UBEC07: a Debate programme component's minimum, recommended and maximum share of the Debate amount, to the kobo. */
export function debateSubActivityRange(debate: bigint, item: DebateSubActivity): { min: bigint; recommended: bigint; max: bigint } {
  return { min: sportsSectionCapMinor(debate, item.min), recommended: sportsSectionCapMinor(debate, item.recommended), max: sportsSectionCapMinor(debate, item.max) };
}
/**
 * V2 UBEC07: at send, each Debate programme component reaches its minimum share of the Debate amount (a shortfall under ₦1
 * is allowed, as for full use, UBEC172). Not checked while the Debate amount is unset or ₦0, nor for plans whose Debate lines
 * all predate the programme components (activity type "Debate"); once any line uses one, earlier "Debate" lines count towards
 * the Debate amount but towards no component.
 */
export function debateMinimumProblem(lines: readonly SportsBudgetLine[], debate: bigint | null): string | null {
  if (debate == null || debate <= BigInt(0)) return null;
  const debateLines = lines.filter((line) => line.section === "debate");
  if (!debateLines.some((line) => findDebateSubActivity(line.activityType))) return null;
  for (const item of debateSubActivities) {
    const { min } = debateSubActivityRange(debate, item);
    const used = debateLines.filter((line) => line.activityType?.trim() === item.name).reduce((sum, line) => sum + line.minor, BigInt(0));
    if (min - used >= MONEY_SCALE) return `‘${item.name}’ needs at least ${formatMinor(min)} (${item.min}% of the Debate amount) before sending. Its items come to ${formatMinor(used)}, so ${formatMinor(min - used)} more is needed`;
  }
  return null;
}
/**
 * sportsBudgetProblem for snapshot lines (unit_cost strings), used by every send step. UBEC167: the Debate amount must be
 * answered first (₦0 if none); snapshots taken before migration 084 have no `debateAllocation` field and are not asked.
 */
type SnapshotSportsLine = { section: string; unit_cost: string | number; quantity: number; activity_type?: string; description?: string; allocations?: readonly { quantity: number }[] };
const snapshotBudgetLines = (lines: readonly SnapshotSportsLine[] | undefined): SportsBudgetLine[] => (lines ?? []).map((line) => ({ section: line.section, minor: sportsLineMinor(line), activityType: line.activity_type }));
export const sportsSnapshotProblem = (lines: readonly SnapshotSportsLine[] | undefined, plan: EnvelopePlan | null | undefined) =>
  !plan ? null : "debateAllocation" in plan && plan.debateAllocation == null ? `${debateNotSet}, then send Sports, Quiz & Debate` : sportsBudgetProblem(snapshotBudgetLines(lines), plan)
    ?? debateMinimumProblem(snapshotBudgetLines(lines), debateMinor(plan))
    ?? sportsAllocationProblem((lines ?? []).flatMap((line) => line.allocations ? [{ section: line.section, activityType: line.activity_type ?? "", description: line.description ?? "", quantity: Number(line.quantity), allocated: line.allocations.reduce((sum, a) => sum + Number(a.quantity), 0) }] : []));

/** An equipment item (procurement, not PHE training) with the quantity given to beneficiary schools so far. */
export type SportsItemAllocation = { section: string; activityType: string; description: string; quantity: number; allocated: number };
/** UBEC224: equipment items not yet given out in full to beneficiary schools (Training of PHE Officers lines are not given out). */
export const unallocatedSportsItems = (items: readonly SportsItemAllocation[]) => items.filter((item) => item.section === "equipment" && !isPheTraining(item) && item.allocated < item.quantity);
/** "“Match balls” (4 of 10 allocated)" for each item, the first few named. */
export function unallocatedSportsList(items: readonly SportsItemAllocation[], limit = 3) {
  const named = items.slice(0, limit).map((item) => `“${item.description.trim() || item.activityType}” (${item.allocated.toLocaleString("en-NG")} of ${item.quantity.toLocaleString("en-NG")} allocated)`);
  return items.length > limit ? `${named.join(", ")} and ${items.length - limit} more` : named.join(", ");
}
/**
 * UBEC224: every equipment item must be given out in full to beneficiary schools before Sports, Quiz & Debate is sent, at
 * every send step (with sportsSnapshotProblem). Null when all are allocated.
 */
export function sportsAllocationProblem(items: readonly SportsItemAllocation[]): string | null {
  const open = unallocatedSportsItems(items);
  return open.length ? `Allocate every equipment item to beneficiary schools before sending: ${unallocatedSportsList(open)}` : null;
}
