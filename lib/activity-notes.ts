import { activityHints, activityInfo, isOtherActivity, type ActivityWorkstream } from './activity-plans.ts';

/**
 * UBEC66 (client, 6 November 2026: "it should be for all"): every allowable activity shows its tinted explanation note in
 * the activity editor. Activities with "Includes" examples (activityHints) or an explanation (activityInfo) show those;
 * the rest show the short explanation below, so no activity is left without a note.
 */
const fallbackNotes: Partial<Record<ActivityWorkstream, Record<number, string>>> = {
  tlm: { 2: 'Getting the TLMs from the State to the LGEAs and on to the schools on the distribution list' },
  monitoring: {
    0: 'Tools and equipment that monitoring and supervision visits need, such as checklists, tablets and visit kits',
    1: 'Buying or maintaining vehicles, motorcycles, boats or other means of getting monitoring officers to the sites',
    2: 'Allowances for the officers on monitoring visits: enter the number of officers and the number of visits',
    3: 'A digital monitoring system or dashboard for collecting, tracking and reporting monitoring data',
    4: 'Training of supervision and monitoring officers',
  },
  gscci: {
    0: 'Greening the school grounds: planting and caring for trees, school gardens and related greening work',
    1: 'Greening and entrepreneurship in the curriculum, such as school farms and small green enterprises',
    2: 'Training teachers and building the education system’s capacity to teach greening and climate change',
    3: 'Greening activities with the communities around the schools',
    4: 'Taking part in, and preparing for, the national greening competitions',
    5: 'Setting up and running Green Clubs (climate change clubs) in schools',
    6: 'Rearing small animals and fish farming as learning and greening activities',
    7: 'Environmental and social safeguards, and waste management in schools',
    8: 'Supervising and monitoring the greening and climate change initiatives',
  },
  quality: {
    4: 'Literacy and numeracy assessment of learners at the LGEAs, aligned with HOPE-EDU',
    7: 'Transport and fuel for the CSM&E visits to schools',
    9: 'Daily monitoring of schools by SUBEB and LGEA officers',
    10: 'Producing the monitoring instruments, writing the reports and harmonising the findings',
    11: 'Renewing the server and maintaining the Quality Assurance dashboard',
  },
  ict: {
    0: 'Digital and STEM equipment, procured for schools, the SUBEB or an LGA',
    1: 'Compliance with the Nigeria Data Protection Act (NDPA) and the cybersecurity policy',
    3: 'Keeping the UBEC-SUBEB Connect link running',
    4: 'Setting up a Digital Literacy Centre or smart classroom: one per school chosen',
    5: 'Buying or renewing internet subscriptions (Starlink, mobile networks or fibre)',
    6: 'Developing a new website or maintaining the existing one',
    7: 'Digital teaching and learning content and resources for schools',
    8: 'Monitoring and verifying the ICT interventions in the schools chosen',
  },
  teachers: {
    0: 'Training teachers to teach reading and writing',
    1: 'Training School Support Officers (SSOs) and Instructional Leads (ILs) on supporting schools',
    2: 'Training head teachers and school leaders',
    3: 'Training teachers to teach numeracy',
    4: 'Training teachers in Science, Technology, Engineering, Arts and Mathematics (STEAM)',
    5: 'Training teachers to teach mental arithmetic',
    6: 'Psychosocial support and the care of children in emergencies',
    7: 'Moral regeneration and reorientation training for teachers',
    8: 'Teaching multigrade and mixed-ability classes',
    9: 'Learner-centred strategies for teaching History',
    11: 'Training teachers on the curriculum',
    12: 'Training ECCDE caregivers and teachers',
    13: 'School safety and safeguarding of learners',
    14: 'Training teachers on special needs education',
    15: 'Teaching at the Right Level (TaRL): grouping learners by level rather than by class',
    16: 'Training teachers to run school sports activities',
    17: 'Training teachers on agriculture and greening schools',
  },
  planning: { 2: 'Reviewing and tracking how the State Medium-Term Basic Education Strategic Plan (SMTBESP) is implemented' },
};
const othersNote = 'Use this for an allowable activity that is not in the list, and name it below';

export type ActivityNote = { includes?: string; info?: string };
/** What the editor's notes say about this activity: its "Includes" examples and its explanation (a fallback when it has neither). */
export function activityNote(workstream: ActivityWorkstream, activity: number): ActivityNote {
  const includes = activityHints[workstream]?.[activity], info = activityInfo[workstream]?.[activity];
  if (includes || info) return { includes, info };
  const fallback = fallbackNotes[workstream]?.[activity] ?? (isOtherActivity(workstream, activity) ? othersNote : undefined);
  return fallback ? { info: fallback } : {};
}
