import { z } from "zod";
// Explicit .ts so the Node test scripts can load this file directly.
import { componentEnvelope, toKobo, type EnvelopePlan } from "./funding-policy.ts";

// The four UBEC sports budget sections (QA UBEC18) with their share of the sports
// allocation. Each share is a cap: a section's lines may not exceed share × the sports envelope.
export const sportsSections = [
  { id: "equipment", label: "Procurement & Training of PHE Officers", shortLabel: "Procurement & PHE training", share: 60, typeLabel: "Sport", itemLabel: "Item", placeholder: "Choose a sport or type another…" },
  { id: "competitions", label: "Sports Competitions", shortLabel: "Competitions", share: 30, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose a competition…" },
  { id: "publicity", label: "Publicity & Administration", shortLabel: "Publicity & admin", share: 5, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose an activity…" },
  { id: "supervision", label: "Supervision, Assessment and Verification", shortLabel: "Supervision", share: 5, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "" },
] as const;

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
/** Sub-activities per section. `share` is UBEC's suggested % of the competitions share (guidance note, not a cap). */
export const sportsSubActivities: Record<"competitions" | "publicity", readonly { name: string; share?: number }[]> = {
  competitions: [{ name: "Inter School Competition", share: 5 }, { name: "Inter Local Government Competition", share: 10 }, { name: "State Finals Competition", share: 40 }, { name: "Geo-Political (Zonal) Finals", share: 25 }, { name: "National Finals", share: 10 }, { name: "Other Competitions", share: 10 }],
  publicity: [{ name: "Sensitization of Key Stakeholders" }, { name: "Electronic Media" }, { name: "Print Media" }, { name: "Social Media" }, { name: "Others" }],
};
/** The "Other Competitions" and "Others" sub-activities: the description names the activity. */
export const isOtherSubActivity = (name: string) => /^others?\b/i.test(name.trim());
/** Supervision has no sub-activity list; its lines carry the section name as their activity type. */
export const supervisionActivity = "Supervision, Assessment and Verification";

const key = (value: string) => value.trim().toLowerCase();
export const findSport = (name: string) => sportsCatalog.find((sport) => key(sport.name) === key(name));
/** Distinct procurement sports already in the plan, ignoring one line (the one being edited). */
export function equipmentSports(lines: readonly { id?: number; section: string; activityType: string }[], exceptId?: number) {
  return [...new Map(lines.filter((line) => line.section === "equipment" && line.id !== exceptId).map((line) => [key(line.activityType), line.activityType.trim()])).values()];
}
/** Returns an error for the field that breaks a catalogue rule, or null. */
export function sportsCatalogError(line: { section: SportsSection; activityType: string; description: string }, others: readonly { id?: number; section: string; activityType: string }[], exceptId?: number): { field: "activityType" | "description"; message: string } | null {
  if (line.section === "equipment") {
    const used = equipmentSports(others, exceptId);
    if (!used.some((sport) => key(sport) === key(line.activityType)) && used.length >= maxEquipmentSports) return { field: "activityType", message: `You can select up to ${maxEquipmentSports} sports (${used.join(", ")}). Add items to one of these sports instead.` };
    return null;
  }
  if (line.section === "competitions" || line.section === "publicity") {
    if (!sportsSubActivities[line.section].some((item) => item.name === line.activityType.trim())) return { field: "activityType", message: "Choose a sub-activity from the list." };
  }
  return null;
}

export type SportsSection = typeof sportsSections[number]["id"];
export type SportsSchool = { id: number; name: string; lga: string; level: string; location: "Rural" | "Urban" };
export type SportsLine = { id: number; code: string; section: SportsSection; activityType: string; description: string; quantity: number; unitCost: number };
export type SportsAllocation = { id: number; schoolId: number; lineId: number; quantity: number; longitude: string; latitude: string; name: string; lga: string; level: string; location: "Rural" | "Urban" };
export type SportsPlan = { lines: SportsLine[]; allocations: SportsAllocation[]; schools: SportsSchool[] };

const id = z.number().int().positive();
const quantity = z.number().int("Use a whole number.").min(1, "Enter a quantity of at least 1.").max(1000000, "Use a quantity of 1,000,000 or less.");
export const sportsLineSchema = z.object({
  section: z.enum(["equipment", "competitions", "publicity", "supervision"]),
  activityType: z.string().trim().min(1, "Choose a sport or sub-activity.").max(160),
  description: z.string().trim().min(1, "Enter an item or activity description.").max(1000),
  quantity,
  unitCost: z.number().positive("Enter a unit cost greater than zero.").max(999999999999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.01, "Use no more than two decimal places."),
}).refine((line) => Number.isSafeInteger(Math.round(line.unitCost * 100) * line.quantity), { path: ["unitCost"], message: "This line total is too large." })
  .transform((line) => line.section === "supervision" ? { ...line, activityType: supervisionActivity } : line);

const coordinate = (limit: number) => z.string().trim().max(30).default("").refine((value) => value === "" || (/^-?\d+(\.\d+)?$/.test(value) && Math.abs(Number(value)) <= limit), `Enter a coordinate between -${limit} and ${limit}.`);
export const sportsAllocationSchema = z.object({
  schoolId: id,
  lineId: id,
  quantity,
  longitude: coordinate(180),
  latitude: coordinate(90),
});

export function sportsLineTotal(line: Pick<SportsLine, "quantity" | "unitCost">) {
  return Math.round(line.unitCost * 100) * line.quantity / 100;
}

export function sportsBudget(lines: SportsLine[]) {
  return lines.reduce((sum, line) => sum + Math.round(line.unitCost * 100) * line.quantity, 0) / 100;
}

export const sportsMoney = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatKobo = (kobo: bigint) => {
  const absolute = kobo < 0 ? -kobo : kobo;
  return `₦${(absolute / BigInt(100)).toLocaleString("en-NG")}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
};
/** A sports line's cost in kobo (editor lines carry unitCost, snapshot lines unit_cost). */
// Snapshot lines come from to_jsonb, so their numeric unit_cost may arrive as a JSON number.
export const sportsLineKobo = (line: { unitCost?: number; unit_cost?: string | number; quantity: number }) => {
  const cost = line.unit_cost ?? line.unitCost ?? 0;
  return toKobo(typeof cost === "number" ? cost.toFixed(2) : cost) * BigInt(line.quantity);
};
/** The sports funding envelope in kobo, or null until the plan has funding. */
export function sportsEnvelopeKobo(plan: EnvelopePlan) {
  const envelope = componentEnvelope(plan, "sports");
  return envelope == null ? null : toKobo(envelope);
}
/** A section's cap: its share of the sports envelope, rounded to the kobo. */
export const sportsSectionCapKobo = (envelope: bigint, share: number) => (envelope * BigInt(Math.round(share * 100)) + BigInt(5000)) / BigInt(10000);

export type SportsBudgetLine = { section: string; kobo: bigint };
export type SportsSectionBudget = { section: typeof sportsSections[number]; proposed: bigint; cap: bigint | null };
/** Proposed total and cap of every section (cap null until the plan has funding). */
export function sportsSectionBudgets(lines: readonly SportsBudgetLine[], envelope: bigint | null): SportsSectionBudget[] {
  return sportsSections.map((section) => ({
    section,
    proposed: lines.filter((line) => line.section === section.id).reduce((sum, line) => sum + line.kobo, BigInt(0)),
    cap: envelope == null ? null : sportsSectionCapKobo(envelope, section.share),
  }));
}
/**
 * Why these sports lines break the budget, or null: the whole sports envelope first, then each section's cap
 * (share × envelope). No limit until the plan has funding. `only` limits the section check to one section.
 */
export function sportsBudgetProblem(lines: readonly SportsBudgetLine[], plan: EnvelopePlan, only?: string): string | null {
  return sportsCapProblem(lines, sportsEnvelopeKobo(plan), only);
}
/** sportsBudgetProblem with the envelope already known (kobo, null = no funding yet), as the editor has it. */
export function sportsCapProblem(lines: readonly SportsBudgetLine[], envelope: bigint | null, only?: string): string | null {
  if (envelope == null) return null;
  const total = lines.reduce((sum, line) => sum + line.kobo, BigInt(0));
  if (total > envelope) return `You have exceeded the Sports allocation (${formatKobo(envelope)}) by ${formatKobo(total - envelope)}. Reduce the budget to continue.`;
  for (const { section, proposed, cap } of sportsSectionBudgets(lines, envelope)) {
    if (only && section.id !== only) continue;
    if (cap != null && proposed > cap) return `${section.label} may use up to ${section.share}% of the sports allocation (${formatKobo(cap)}). Its lines come to ${formatKobo(proposed)}, ${formatKobo(proposed - cap)} over. Reduce them to continue.`;
  }
  return null;
}
/** sportsBudgetProblem for snapshot lines (unit_cost strings), used by every send step. */
export const sportsSnapshotProblem = (lines: readonly { section: string; unit_cost: string | number; quantity: number }[] | undefined, plan: EnvelopePlan | null | undefined) =>
  plan ? sportsBudgetProblem((lines ?? []).map((line) => ({ section: line.section, kobo: sportsLineKobo(line) })), plan) : null;
