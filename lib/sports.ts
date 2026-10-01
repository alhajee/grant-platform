import { z } from "zod";

// The four UBEC sports budget sections (QA UBEC18) with their indicative share
// of the sports allocation. Shares are guidance only and are not enforced.
export const sportsSections = [
  { id: "equipment", label: "Procurement of Sports Equipment", shortLabel: "Equipment", share: 60, typeLabel: "Sport", itemLabel: "Item", placeholder: "Choose a sport or type another…" },
  { id: "competitions", label: "Sports Competitions", shortLabel: "Competitions", share: 20, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose a competition…" },
  { id: "publicity", label: "Publicity & Administration", shortLabel: "Publicity & admin", share: 5, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "Choose an activity…" },
  { id: "supervision", label: "Supervision, Assessment and Verification", shortLabel: "Supervision", share: 5, typeLabel: "Sub-activity", itemLabel: "Activity / item description", placeholder: "" },
] as const;

/** Procurement: at most this many distinct sports per plan (QA UBEC19). */
export const maxEquipmentSports = 3;
type SportCatalogEntry = { name: string; items: readonly string[]; customItems: boolean };
export const sportsCatalog: readonly SportCatalogEntry[] = [
  { name: "Football", items: ["Footballs", "Goal posts", "Football nets", "Cones", "Bibs/Jerseys", "Whistles", "Corner flags"], customItems: true },
  { name: "Volleyball", items: ["Volleyballs", "Volleyball net", "Net poles", "Knee pads", "Whistles"], customItems: true },
  { name: "Basketball", items: ["Basketballs", "Basketball hoop/backboard", "Bibs/Jerseys", "Whistles"], customItems: false },
  { name: "Badminton", items: ["Badminton rackets", "Shuttlecocks", "Badminton net", "Net poles"], customItems: true },
  { name: "Handball", items: ["Handballs", "Goal posts", "Bibs/Jerseys", "Whistles"], customItems: true },
  { name: "Tennis", items: ["Tennis rackets", "Tennis balls", "Tennis net", "Net poles"], customItems: true },
  { name: "Athletics", items: ["Starting blocks", "Stopwatches", "Measuring tape", "Hurdles", "Javelins", "Discus", "Shot put", "Relay batons", "Cones"], customItems: true },
  { name: "Gymnastics", items: ["Gymnastic mats", "Balance beam", "Vaulting box", "Ribbons/hoops"], customItems: true },
  { name: "Board Games", items: ["Chess sets", "Ludo sets", "Draughts/Checkers sets", "Scrabble sets"], customItems: true },
];
/** Sub-activities per section. `share` is the indicative % of the competitions share (UBEC guidance note). */
export const sportsSubActivities: Record<"competitions" | "publicity", readonly { name: string; share?: number }[]> = {
  competitions: [{ name: "Inter School Competition", share: 5 }, { name: "Inter Local Government Competition", share: 10 }, { name: "State Finals Competition", share: 40 }, { name: "Geo-Political (Zonal) Finals", share: 25 }, { name: "National Finals", share: 10 }, { name: "Other Competitions", share: 10 }],
  publicity: [{ name: "Sensitization of Key Stakeholders" }, { name: "Electronic Media" }, { name: "Print Media" }, { name: "Social Media" }, { name: "Others" }],
};
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
    const sport = findSport(line.activityType);
    if (sport && !sport.customItems && !sport.items.some((item) => key(item) === key(line.description))) return { field: "description", message: `Choose a ${sport.name} item from the list.` };
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
