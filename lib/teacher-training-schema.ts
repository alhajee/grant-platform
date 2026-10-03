import { z } from 'zod';
import { maxTrainingDays, minTrainingDays, targetParticipants, trainingProviders, trainingSchoolLevels, venueTypes } from './teacher-development.ts';

// The Teacher Development line fields (migration 040), spread into the shared activity line schema
// (lib/activity-plans.ts). Other workstreams must leave them empty.
export const teacherTrainingShape = {
  trainingProvider: z.string().max(120).default(''),
  targetParticipants: z.string().max(120).default(''),
  schoolLevels: z.array(z.enum(trainingSchoolLevels)).max(trainingSchoolLevels.length).default([]),
  trainingDays: z.number().int('Enter whole training days.').min(0).max(maxTrainingDays, `Training can last up to ${maxTrainingDays} days.`).nullable().default(null),
  venueType: z.string().max(60).default(''),
};

type TrainingValues = { workstream: string; trainingProvider: string; targetParticipants: string; schoolLevels: readonly string[]; trainingDays: number | null; venueType: string };
type Issue = { path: string[]; message: string };
const oneOf = (options: readonly string[], value: string) => options.includes(value);

/** Validation issues for the training fields: all required on Teacher Development lines, none allowed elsewhere. */
export function teacherTrainingIssues(v: TrainingValues): Issue[] {
  if (v.workstream !== 'teachers') {
    const used = v.trainingProvider || v.targetParticipants || v.schoolLevels.length || v.trainingDays != null || v.venueType;
    return used ? [{ path: ['trainingProvider'], message: 'Training details only apply to Teacher Development.' }] : [];
  }
  const issues: Issue[] = [];
  if (!oneOf(trainingProviders, v.trainingProvider)) issues.push({ path: ['trainingProvider'], message: 'Choose the training provider.' });
  if (!oneOf(targetParticipants, v.targetParticipants)) issues.push({ path: ['targetParticipants'], message: 'Choose the target participants.' });
  if (!v.schoolLevels.length) issues.push({ path: ['schoolLevels'], message: 'Choose at least one school level.' });
  if (new Set(v.schoolLevels).size !== v.schoolLevels.length) issues.push({ path: ['schoolLevels'], message: 'Choose each school level once.' });
  if (v.trainingDays == null) issues.push({ path: ['trainingDays'], message: 'Enter the number of training days.' });
  else if (v.trainingDays < minTrainingDays) issues.push({ path: ['trainingDays'], message: `Training must last at least ${minTrainingDays} days.` });
  if (!oneOf(venueTypes, v.venueType)) issues.push({ path: ['venueType'], message: 'Choose the venue type.' });
  return issues;
}
