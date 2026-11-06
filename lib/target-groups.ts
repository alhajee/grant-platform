import { z } from 'zod';

/** The target groups an activity line or a Sports budget line (UBEC219) may name. */
export const targetGroups = ['National level', 'State level', 'LGA level', 'Community level', 'Schools', 'All Learners', 'All Learners and Teachers', 'ECCDE Learners', 'Primary School Learners', 'JSS Learners', 'Teachers', 'ECCDE Learners and Teachers', 'Primary School Learners and Teachers', 'JSS Learners and Teachers'] as const;
/** Several target groups (17 October 2026) are stored together in the line's one text field, in list order: "Schools, Teachers". */
export const targetGroupSeparator = ', ';
export const splitTargetGroups = (value: string) => value.split(targetGroupSeparator).map(group => group.trim()).filter(Boolean);
export const joinTargetGroups = (groups: readonly string[]) => targetGroups.filter(group => groups.includes(group)).join(targetGroupSeparator);
const isTargetGroup = (group: string): group is typeof targetGroups[number] => (targetGroups as readonly string[]).includes(group);
// An array or a joined string (one group for older clients); each must be listed. '' is left to the line rules ("Choose the target group").
export const targetGroupField = z.union([z.array(z.string()), z.string()]).default('')
  .transform(value => Array.isArray(value) ? value.map(group => group.trim()) : splitTargetGroups(value.trim()))
  .refine(groups => groups.every(isTargetGroup), 'Choose target groups from the list')
  .transform(joinTargetGroups);
