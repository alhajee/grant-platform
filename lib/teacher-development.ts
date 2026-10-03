// Teacher Development (pillar 'teachers', department 'teachers', migration 040): the first section of the shared
// Teacher Development and ICT component. Pure constants, shared by the line schema, the editor, the readiness
// rules and the workbook. Kept free of imports so the node rule tests can load it directly.

/** Activities from UBEC's Teacher Professional Development form, stored by index (0-18). */
export const teacherActivityNames = [
  'Literacy Training',
  'Training on School Support Mechanism (for School Support Officers (SSOs) and Instructional Leads (ILs))',
  'Head Teachers/school leaders',
  'Numeracy Training',
  'STEAM Training',
  'Mental Arithmetic Training',
  'Psychosocial Support and Management of Children in Emergency Training',
  'Moral Regeneration and Reorientation Training',
  'Multigrade and Mixed Classroom Pedagogy Training',
  'Learner-Centred Strategy for Teaching History Training',
  'Technology-Enabled Learning Training (TELT) of Teachers',
  'Curriculum training',
  'ECCDE Training',
  'School Safety/Safeguarding',
  'Special Education Training',
  'Teaching at the Right Level (TaRL) Training',
  'Teachers training in school sport activities',
  'Teachers training on Agriculture/Greening schools',
  'Others (specify)',
] as const;
/** "Others (specify)": the line names its own training. */
export const teacherOtherActivity = 18;
/** Info hints shown beside an activity. */
export const teacherActivityInfo: Record<number, string> = {
  10: 'Digital/AI literacy, digital pedagogy; instructional multimedia content development; gamification of learning, etc.',
};

export const trainingProviders = ['Government-accredited Teacher Training Institutions', 'Special training provider approved by UBEC', 'International Development Partners'] as const;
export const targetParticipants = ['Headteachers/Principals', 'Teachers', 'Education managers'] as const;
export const trainingSchoolLevels = ['ECCDE', 'Primary', 'JSS'] as const;
export const venueTypes = ['Hall', 'Classroom'] as const;
export const minTrainingDays = 3;
export const maxTrainingDays = 365;

/** Every Teacher Development line needs at least one supporting document (PDF or Excel). */
export const teacherDocumentLabel = 'Supporting documents';
export const teacherDocumentHint = 'MoU with training providers, training list for teachers, proof of SSO, proof of Instructional Leads selection, pre-test and post-test items, budget breakdown';

export type TeacherTraining = { trainingProvider: string; targetParticipants: string; schoolLevels: string[]; trainingDays: number | null; venueType: string };
