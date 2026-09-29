import { z } from 'zod';
import type { ImplementedPillar } from './beap-pillars';
import { subebComponentDepartments as pillarDepartments } from './beap-pillars';
import { canViewComponent } from './subeb-access';
import { hasDepartment, normalizeDepartments, type DepartmentAccess } from './user-departments';
import type { Snapshot } from './plan-review';

// Google-Sheets-style review comments on the plan workbook (migration 028).
// A thread is a root comment on one cell (column_id set) or a whole row (column_id NULL);
// replies share the root's target. Only the state review chain uses them for now.

export const commentSheets = ['infrastructure', 'sports', 'sbmc', 'tlm', 'distribution'] as const;
export type CommentSheet = typeof commentSheets[number];
/** The component each sheet belongs to; the TLM distribution list is part of TLM. */
export const sheetPillar: Record<CommentSheet, ImplementedPillar> = { infrastructure: 'infrastructure', sports: 'sports', sbmc: 'sbmc', tlm: 'tlm', distribution: 'tlm' };
export const commentBodyLimit = 2000;

// Column ids and headers mirror components/plan-workbook/sheets.tsx (scripts/test-plan-comments.mjs checks they stay in sync).
const activityColumns = { activity: 'Allowable activity', description: 'Description' };
const activityTail = { strategy: 'Strategy', target: 'Target group', location: 'Location', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount' };
export const commentColumns: Record<CommentSheet, Record<string, string>> = {
  infrastructure: { school: 'School', lga: 'LGA', level: 'Level', location: 'Location', type: 'Project type', code: 'Code', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount', scope: 'Components', learners: 'Learners', strategy: 'Strategy', duration: 'Duration' },
  sports: { item: 'Budget item', code: 'Code', section: 'Section', activity: 'Allowable activity', quantity: 'Qty.', unitCost: 'Unit cost', amount: 'Amount', schools: 'Schools', allocated: 'Allocated qty.' },
  sbmc: { ...activityColumns, rationale: 'Rationale', approach: 'Implementation approach', ...activityTail },
  tlm: { ...activityColumns, material: 'Material type', subject: 'Subject', classes: 'Classes', ...activityTail },
  distribution: { school: 'School', lga: 'LGA', level: 'Level', location: 'Location' },
};

/**
 * Durable row references: the workbook's row.id for each sheet. All are database ids that the
 * editors update in place (they never delete and recreate a line on save):
 * infrastructure = negative infrastructure_packages.id (see lib/plan-snapshot.ts), sports = sports_budget_lines.id,
 * sbmc/tlm = activity_plan_lines.id, distribution = schools.id on the plan's tlm_distribution list.
 */
export function sheetRows(snapshot: Snapshot, sheet: CommentSheet): Map<string, string> {
  const pairs: [string, string][] =
    sheet === 'infrastructure' ? snapshot.infrastructure.map(line => [String(line.id), line.school.name]) :
    sheet === 'sports' ? snapshot.sports.map(line => [String(line.id), line.description]) :
    sheet === 'distribution' ? (snapshot.tlmDistribution ?? []).map(school => [String(school.id), school.name]) :
    (snapshot[sheet] ?? []).map(line => [String(line.id), line.description]);
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
export const displayRole = (role: string, isBeapChair?: boolean) => role === 'Director' && isBeapChair ? 'BEAP Chair' : role;

const body = z.string().trim().min(1, 'Write a comment first.').max(commentBodyLimit, `Keep comments to ${commentBodyLimit.toLocaleString()} characters or fewer.`);
export const createCommentSchema = z.union([
  z.object({ sheet: z.enum(commentSheets), rowRef: z.string().regex(/^-?[1-9]\d{0,17}$/, 'Choose a row in the workbook.'), columnId: z.string().regex(/^[a-zA-Z]{1,40}$/).nullable(), body }).strict(),
  z.object({ parentId: z.number().int().positive(), body }).strict(),
]);
export const updateCommentSchema = z.object({ id: z.number().int().positive(), action: z.enum(['resolve', 'reopen']) }).strict();

export type PlanCommentReply = { id: number; body: string; authorName: string; authorRole: string; createdAt: string; mine: boolean };
export type PlanCommentThread = PlanCommentReply & {
  pillar: ImplementedPillar; sheet: CommentSheet; rowRef: string; columnId: string | null; targetLabel: string; submissionNumber: number;
  resolvedAt: string | null; resolvedByName: string | null; orphaned: boolean; replies: PlanCommentReply[];
};
export type PlanCommentsResponse = { threads: PlanCommentThread[]; locked: boolean; abilities: Partial<Record<ImplementedPillar, CommentAbilities>> };
export const threadKey = (thread: { rowRef: string; columnId: string | null }) => `${thread.rowRef}:${thread.columnId ?? ''}`;
