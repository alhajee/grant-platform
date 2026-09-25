import { z } from "zod";

// These are the four budget sections in the 2025 BEAP Sports Development sheet.
// Sport and activity names are supplied by the state, not a seeded catalogue.
export const sportsSections = [
  { id: "equipment", label: "Sports equipment", typeLabel: "Sport / game", placeholder: "Enter or choose a sport…" },
  { id: "competitions", label: "Sports competitions", typeLabel: "Competition type", placeholder: "Enter or choose a competition…" },
  { id: "publicity", label: "Publicity & administration", typeLabel: "Publicity / administration type", placeholder: "Enter or choose a type…" },
  { id: "supervision", label: "Supervision, assessment & verification", typeLabel: "Supervision / activity type", placeholder: "Enter or choose an activity…" },
] as const;

export type SportsSection = typeof sportsSections[number]["id"];
export type SportsSchool = { id: number; name: string; lga: string; level: string; location: "Rural" | "Urban" };
export type SportsLine = { id: number; code: string; section: SportsSection; activityType: string; description: string; quantity: number; unitCost: number };
export type SportsAllocation = { id: number; schoolId: number; lineId: number; quantity: number; longitude: string; latitude: string; name: string; lga: string; level: string; location: "Rural" | "Urban" };
export type SportsPlan = { lines: SportsLine[]; allocations: SportsAllocation[]; schools: SportsSchool[] };

const id = z.number().int().positive();
const quantity = z.number().int("Use a whole number.").min(1, "Enter a quantity of at least 1.").max(1000000, "Use a quantity of 1,000,000 or less.");
export const sportsLineSchema = z.object({
  section: z.enum(["equipment", "competitions", "publicity", "supervision"]),
  activityType: z.string().trim().min(1, "Enter a sport or activity type.").max(160),
  description: z.string().trim().min(1, "Enter an item or activity description.").max(1000),
  quantity,
  unitCost: z.number().positive("Enter a unit cost greater than zero.").max(999999999999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.01, "Use no more than two decimal places."),
}).refine((line) => Number.isSafeInteger(Math.round(line.unitCost * 100) * line.quantity), { path: ["unitCost"], message: "This line total is too large." });

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
