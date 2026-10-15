"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** "All" or one school level (ECCDE, Primary, JSS…) */
export type SchoolLevelChoice = string;
export const allLevels: SchoolLevelChoice = "all";

const levelOrder = ["ECCDE", "Primary", "JSS", "SSS"];
const count = new Intl.NumberFormat("en-NG");

type Levelled = { level: string };

/** The schools of the chosen level ("all" keeps every school) */
export function filterByLevel<T extends Levelled>(schools: readonly T[], level: SchoolLevelChoice): T[] {
  return level === allLevels ? [...schools] : schools.filter(school => school.level === level);
}

/** The levels present in a school list, in school order (ECCDE, Primary, JSS, then any others) */
export function levelsIn(schools: readonly Levelled[]): string[] {
  const found = [...new Set(schools.map(school => school.level).filter(Boolean))];
  const rank = (level: string) => { const index = levelOrder.indexOf(level); return index < 0 ? levelOrder.length : index; };
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

interface SchoolLevelFilterProps {
  schools: readonly Levelled[];
  value: SchoolLevelChoice;
  onChange: (level: SchoolLevelChoice) => void;
  disabled?: boolean;
  label?: string;
}

/** School-type filter (All / ECCDE / Primary / JSS) shown above a school search, with the count for each type */
export function SchoolLevelFilter({ schools, value, onChange, disabled, label = "Filter schools by type" }: SchoolLevelFilterProps) {
  const levels = levelsIn(schools);
  if (levels.length < 2) return null;
  const tally = (level: string) => schools.filter(school => school.level === level).length;
  return <ToggleGroup type="single" variant="outline" size="sm" spacing={2} className="school-level-filter flex-wrap justify-start" aria-label={label} value={value} disabled={disabled} onValueChange={next => onChange(next || allLevels)}>
    <ToggleGroupItem value={allLevels} aria-label={`All school types, ${count.format(schools.length)} schools`}>All <span className="text-muted-foreground tabular-nums">{count.format(schools.length)}</span></ToggleGroupItem>
    {levels.map(level => <ToggleGroupItem key={level} value={level} aria-label={`${level}, ${count.format(tally(level))} schools`}>{level} <span className="text-muted-foreground tabular-nums">{count.format(tally(level))}</span></ToggleGroupItem>)}
  </ToggleGroup>;
}
