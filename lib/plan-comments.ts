import { z } from 'zod';
import type { ImplementedPillar } from './beap-pillars';
import { subebComponentDepartments as pillarDepartments } from './beap-pillars';
import { canViewComponent } from './subeb-access';
import { hasDepartment, normalizeDepartments, type DepartmentAccess } from './user-departments';
import type { Snapshot } from './plan-review';
import { qualityIctActivityNames } from './activity-extras';

// Google-Sheets-style review comments on the plan workbook (migration 028).
// A thread is a root comment on one cell (column_id set) or a whole row (column_id NULL);
// replies share the root's target. scope 'state' threads belong to the SUBEB review chain; scope 'ubec'
// threads are written at UBEC on a submitted round and reach the state only when the UBEC ES shares them
// on return (migration 029, lib/ubec-comments.ts).

export const commentSheets = ['infrastructure', 'sports', 'sbmc', 'tlm', 'distribution', 'monitoring', 'gscci', 'gscciDistribution', 'curriculum', 'curriculumDistribution', 'quality', 'ict', 'teachers', 'planning'] as const;
export type CommentSheet = typeof commentSheets[number];
/** The component each sheet belongs to; each distribution list is part of its component (TLM, GSCCI, Curriculum). */
export const sheetPillar: Record<CommentSheet, ImplementedPillar> = { infrastructure: 'infrastructure', sports: 'sports', sbmc: 'sbmc', tlm: 'tlm', distribution: 'tlm', monitoring: 'monitoring', gscci: 'gscci', gscciDistribution: 'gscci', curriculum: 'curriculum', curriculumDistribution: 'curriculum', quality: 'quality', ict: 'ict', teachers: 'teachers', planning: 'planning' };
export const commentBodyLimit = 2000;
export const commentScopes = ['state', 'ubec'] as const;
export type CommentScope = typeof commentScopes[number];
/** Authors of UBEC comments; everyone else writing on a UBEC thread is a SUBEB user replying to it. */
export const ubecAuthorRoles = ['UBEC Executive Secretary', 'UBEC Department Reviewer'] as const;

// Column ids and headers mirror components/plan-workbook/sheets.tsx (scripts/test-plan-comments.mjs checks they stay in sync).
const activityColumns = { activity: 'Allowable activity', description: 'Description' };
const activityTail = { strategy: 'Strategy', target: 'Target group', timeline: 'Timeline', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount' };
export const commentColumns: Record<CommentSheet, Record<string, string>> = {
  infrastructure: { school: 'School', lga: 'LGA', level: 'Level', location: 'Location', type: 'Project type', code: 'Code', timeline: 'Timeline', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount', scope: 'Components', learners: 'Learners', strategy: 'Strategy', duration: 'Duration' },
  sports: { item: 'Budget item', code: 'Code', section: 'Section', activity: 'Sport / sub-activity', timeline: 'Timeline', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount', schools: 'Schools', allocated: 'Allocated qty.' },
  sbmc: { ...activityColumns, rationale: 'Rationale', approach: 'Implementation approach', ...activityTail },
  tlm: { ...activityColumns, material: 'Material type', subject: 'Subject', classes: 'Classes', ...activityTail },
  distribution: { school: 'School', lga: 'LGA', level: 'Level', location: 'Location', learners: 'Learners', allocation: 'Allocation' },
  monitoring: { ...activityColumns, ...activityTail },
  gscci: { ...activityColumns, ...activityTail },
  gscciDistribution: { school: 'School', lga: 'LGA', level: 'Level', location: 'Location', learners: 'Learners', allocation: 'Allocation' },
  curriculum: { ...activityColumns, share: 'Activity share', ...activityTail },
  curriculumDistribution: { school: 'School', lga: 'LGA', level: 'Level', location: 'Location', learners: 'Learners', allocation: 'Allocation' },
  quality: { ...activityColumns, equipment: 'Equipment type', ...activityTail },
  ict: { ...activityColumns, details: 'Details', schools: 'Schools', documents: 'Documents', ...activityTail },
  teachers: { activity: 'Allowable activity', provider: 'Training provider', participants: 'Target participants', levels: 'School level', days: 'Training days', venue: 'Venue', timeline: 'Timeline', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount' },
  planning: { ...activityColumns, ...activityTail },
};

/**
 * Durable row references: the workbook's row.id for each sheet. All are database ids that the
 * editors update in place (they never delete and recreate a line on save):
 * infrastructure = negative infrastructure_packages.id (see lib/plan-snapshot.ts), sports = sports_budget_lines.id,
 * sbmc/tlm/monitoring/gscci/curriculum/quality/ict/teachers/planning = activity_plan_lines.id, distribution/gscciDistribution/curriculumDistribution = schools.id on the
 * plan's tlm_distribution list for that workstream.
 */
export function sheetRows(snapshot: Snapshot, sheet: CommentSheet): Map<string, string> {
  const pairs: [string, string][] =
    sheet === 'infrastructure' ? snapshot.infrastructure.map(line => [String(line.id), line.school.name]) :
    sheet === 'sports' ? snapshot.sports.map(line => [String(line.id), line.description]) :
    sheet === 'distribution' ? (snapshot.tlmDistribution ?? []).map(school => [String(school.id), school.name]) :
    sheet === 'gscciDistribution' ? (snapshot.gscciDistribution ?? []).map(school => [String(school.id), school.name]) :
    sheet === 'curriculumDistribution' ? (snapshot.curriculumDistribution ?? []).map(school => [String(school.id), school.name]) :
    // Teacher Development descriptions are optional, so its rows fall back to the activity name.
    (snapshot[sheet] ?? []).map(line => [String(line.id), line.description || line.custom_activity || qualityIctActivityNames[sheet]?.[line.activity] || `Line ${line.id}`]);
  return new Map(pairs);
}
export const targetLabel = (sheet: CommentSheet, columnId: string | null, rowLabel: string) =>
  `${columnId ? commentColumns[sheet][columnId] : 'Row'} · ${rowLabel}`.slice(0, 300);

type Viewer = { role: string; department?: string | null; departments?: DepartmentAccess; isBeapChair?: boolean };
const departments = (user: Viewer) => user.departments ?? user.department;
export const isStateReviewer = (user: Viewer) => user.role === 'Director' || user.role === 'Executive Chairman';

/** The reviewer who currently holds the component and may start new threads on it. */
export function holdsComponent(user: Viewer, pillar: ImplementedPillar, status: string) {
  if (status === 'director_review') return user.role === 'Director' && !user.isBeapChair && hasDepartment(departments(user), pillarDepartments[pillar]);
  if (status === 'beap_review') return user.role === 'Director' && user.isBeapChair === true;
  if (status === 'chairman_ready') return user.role === 'Executive Chairman';
  return false;
}
export type CommentAbilities = { start: boolean; reply: boolean; resolveAny: boolean; reopen: boolean };
/** What a viewer may do on a component's threads at its current review stage (the plan must also be open). */
export function commentAbilities(user: Viewer, pillar: ImplementedPillar, status: string): CommentAbilities {
  const view = canViewComponent({ role: user.role, departments: normalizeDepartments(departments(user)), isBeapChair: user.isBeapChair }, pillar);
  const holder = view && holdsComponent(user, pillar, status);
  const staff = user.role === 'Data Entry Staff' && hasDepartment(departments(user), pillarDepartments[pillar]);
  return { start: holder, reply: view, resolveAny: view && (staff || holder), reopen: view && isStateReviewer(user) };
}
/**
 * What a SUBEB user may do on a UBEC thread the UBEC ES has shared: anyone who can view the component
 * replies; that department's Data Entry Staff and the reviewer holding the component resolve; nobody at
 * the state starts or reopens UBEC threads (the plan must also be open).
 */
export function sharedUbecAbilities(user: Viewer, pillar: ImplementedPillar, status: string): CommentAbilities {
  const own = commentAbilities(user, pillar, status);
  const staff = user.role === 'Data Entry Staff' && hasDepartment(departments(user), pillarDepartments[pillar]);
  return { start: false, reply: own.reply, resolveAny: own.reply && (staff || own.start), reopen: false };
}
/** UBEC abilities on one component of an open round: the ES on every component, a reviewer on the ones assigned to their department. */
export function ubecAbilities(assigned: boolean, open: boolean): CommentAbilities {
  const can = assigned && open;
  return { start: can, reply: can, resolveAny: can, reopen: can };
}
export const displayRole = (role: string, isBeapChair?: boolean) => role === 'Director' && isBeapChair ? 'BEAP Chair' : role;

const body = z.string().trim().min(1, 'Write a comment first.').max(commentBodyLimit, `Keep comments to ${commentBodyLimit.toLocaleString()} characters or fewer.`);
export const createCommentSchema = z.union([
  z.object({ sheet: z.enum(commentSheets), rowRef: z.string().regex(/^-?[1-9]\d{0,17}$/, 'Choose a row in the workbook.'), columnId: z.string().regex(/^[a-zA-Z]{1,40}$/).nullable(), body }).strict(),
  z.object({ parentId: z.number().int().positive(), body }).strict(),
]);
export const updateCommentSchema = z.object({ id: z.number().int().positive(), action: z.enum(['resolve', 'reopen']) }).strict();
/** UBEC threads the ES ticks in the return dialog (app/api/ubec/review/route.ts). */
export const shareCommentIdsSchema = z.array(z.number().int().positive()).max(500).refine(ids => new Set(ids).size === ids.length, 'Choose each comment once.');

export type PlanCommentReply = { id: number; body: string; authorName: string; authorRole: string; createdAt: string; mine: boolean };
export type PlanCommentThread = PlanCommentReply & {
  pillar: ImplementedPillar; sheet: CommentSheet; rowRef: string; columnId: string | null; targetLabel: string; submissionNumber: number;
  resolvedAt: string | null; resolvedByName: string | null; orphaned: boolean; replies: PlanCommentReply[];
  scope: CommentScope;
  /** UBEC threads only: whether (and by whom) the ES shared it with the SUBEB, and the UBEC submission it was written on. */
  sharedAt?: string | null; sharedByName?: string | null; roundNumber?: number;
};
export type PlanCommentsResponse = {
  threads: PlanCommentThread[]; locked: boolean; abilities: Partial<Record<ImplementedPillar, CommentAbilities>>;
  /** Abilities on the other scope's threads (state view: shared UBEC threads). */
  otherAbilities?: Partial<Record<ImplementedPillar, CommentAbilities>>;
  scope?: CommentScope;
};
export const threadKey = (thread: { rowRef: string; columnId: string | null }) => `${thread.rowRef}:${thread.columnId ?? ''}`;
