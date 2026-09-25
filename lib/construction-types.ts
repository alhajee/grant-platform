import { z } from "zod";

export const roomFields = [
  { key: "classrooms", label: "Classrooms", singular: "classroom", plural: "classrooms" },
  { key: "playroomsLabs", label: "Playrooms / labs", singular: "playroom/lab", plural: "playrooms/labs" },
  { key: "libraries", label: "Libraries", singular: "library", plural: "libraries" },
  { key: "toilets", label: "Toilets", singular: "toilet", plural: "toilets" },
  { key: "officesStores", label: "Offices / stores", singular: "office/store", plural: "offices/stores" },
] as const;

export type RoomKey = typeof roomFields[number]["key"];
export type RoomCounts = Record<RoomKey, number>;
export type ConstructionType = {
  id: string;
  name: string;
  duration: number;
  unitCost: number;
} & Record<RoomKey, number | null>;

const count = z.number().int("Use whole numbers.").min(0, "Counts cannot be negative.").max(1000, "Use a count of 1,000 or less.");
export const constructionTypeSchema = z.object({
  classrooms: count,
  playroomsLabs: count,
  libraries: count,
  toilets: count,
  officesStores: count,
  duration: z.number().int().min(1, "Enter a duration of at least one week.").max(520),
  unitCost: z.number().positive("Enter a unit cost greater than zero.").max(999999999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.01, "Use no more than two decimal places."),
}).refine((value) => roomFields.some(({ key }) => value[key] > 0), { message: "Enter at least one room or facility.", path: ["classrooms"] });

export function constructionTypeName(counts: RoomCounts) {
  return roomFields.filter(({ key }) => counts[key] > 0)
    .map(({ key, singular, plural }) => `${counts[key]} ${counts[key] === 1 ? singular : plural}`)
    .join(" · ");
}

export function matchesRoomCounts(type: ConstructionType, counts: RoomCounts) {
  return roomFields.every(({ key }) => type[key] === counts[key]);
}
