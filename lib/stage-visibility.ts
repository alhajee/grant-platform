import type { QueryResult, QueryResultRow } from 'pg';
import { implementedPillars, subebComponentDepartments, type ImplementedPillar } from './beap-pillars';
import { canViewComponent } from './subeb-access';
import { hasDepartment, normalizeDepartments, type DepartmentAccess } from './user-departments';

/**
 * Stage-gated visibility: a component's details (lines, amounts, schools, documents, comments) reach a reviewer
 * only once the component has been sent to their level, and stay visible afterwards (also after a return for changes).
 * `canViewComponent` stays the role/department ceiling; this adds the workflow gate on top.
 *
 * Levels: 0 Data Entry, 1 department Director, 2 BEAP Chair, 3 Executive Chairman (and UBEC beyond).
 */
export type StageLevel = 0 | 1 | 2 | 3;
export type ReachedLevels = Record<ImplementedPillar, number>;
export type StageViewer = { role: string; department?: string | null; departments?: DepartmentAccess; isBeapChair?: boolean };
/** One `plan_review_events` row, oldest first. */
export type StageEvent = { action: string; scope: string; actorRole: string; submissionNumber: number };
type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };

const statusLevel: Record<string, number> = { draft: 0, changes_requested: 0, director_review: 1, beap_review: 2, chairman_ready: 3 };
const isPillar = (scope: string): scope is ImplementedPillar => (implementedPillars as readonly string[]).includes(scope);
const zero = (): ReachedLevels => Object.fromEntries(implementedPillars.map(pillar => [pillar, 0])) as ReachedLevels;

/**
 * The highest level each component has ever reached, replaying the review events in order (each send step and
 * return moves a component one level; the BEAP Chair's collated send moves every component it holds) and, for the
 * current working plan, the components' present review status.
 */
export function reachedLevels(events: readonly StageEvent[], reviews: readonly { pillar: string; status: string }[] = []): ReachedLevels {
  const current = zero(), reached = zero();
  const move = (pillar: ImplementedPillar, level: number) => { current[pillar] = level; reached[pillar] = Math.max(reached[pillar], level); };
  for (const event of events) {
    if (isPillar(event.scope)) {
      const pillar = event.scope;
      if (event.action === 'submit') move(pillar, 1);
      else if (event.action === 'endorse') move(pillar, 2);
      else if (event.action === 'forward') move(pillar, 3);
      // A return goes one level down: Executive Chairman to BEAP Chair, BEAP Chair to Director, Director to Data Entry.
      else if (event.action === 'request_changes') move(pillar, event.actorRole === 'Executive Chairman' ? 2 : Math.max(current[pillar] - 1, 0));
    } else if (event.scope === 'general') {
      if (event.action === 'forward') for (const pillar of implementedPillars) { if (current[pillar] === 2) move(pillar, 3); }
      // A UBEC return sends every component back to Data Entry.
      else if (event.action === 'request_changes') for (const pillar of implementedPillars) current[pillar] = 0;
    }
  }
  for (const review of reviews) if (isPillar(review.pillar)) reached[review.pillar] = Math.max(reached[review.pillar], statusLevel[review.status] ?? 0);
  return reached;
}

/** The level a component must have reached before this viewer sees its details; null when the role/department ceiling hides it. */
export function requiredLevel(user: StageViewer, pillar: ImplementedPillar): StageLevel | null {
  if (!canViewComponent({ role: user.role, departments: normalizeDepartments(user.departments ?? user.department), isBeapChair: user.isBeapChair }, pillar)) return null;
  if (user.role === 'Data Entry Staff') return 0;
  if (user.role === 'Executive Chairman') return 3;
  if (user.role === 'Director') return user.isBeapChair && !hasDepartment(user.departments ?? user.department, subebComponentDepartments[pillar]) ? 2 : 1;
  return null;
}

/** Components whose details this viewer may see, given how far each has reached. */
export function stageVisibleComponents(user: StageViewer, reached: ReachedLevels): ImplementedPillar[] {
  return implementedPillars.filter(pillar => { const need = requiredLevel(user, pillar); return need !== null && reached[pillar] >= need; });
}

const eventsSql = `SELECT plan_id AS "planId", action, scope, actor_role AS "actorRole", submission_number AS "submissionNumber" FROM plan_review_events`;
type EventRow = StageEvent & { planId: number };

/**
 * Components with visible details on one plan: the current working plan (review status and full history), or a saved
 * submission (only what had reached the viewer by that submission).
 */
export async function readStageVisibility(db: Db, user: StageViewer, planId: number, submission: number | null = null): Promise<ImplementedPillar[]> {
  const events = (await db.query<EventRow>(`${eventsSql} WHERE plan_id=$1 ${submission ? 'AND submission_number <= $2' : ''} ORDER BY id`, submission ? [planId, submission] : [planId])).rows;
  const reviews = submission ? [] : (await db.query<{ pillar: string; status: string }>('SELECT pillar, status FROM plan_pillar_reviews WHERE plan_id=$1', [planId])).rows;
  return stageVisibleComponents(user, reachedLevels(events, reviews));
}

/** Per saved submission number, the components visible in it (one events query for the whole history). */
export async function readSubmissionVisibility(db: Db, user: StageViewer, planId: number, numbers: readonly number[]): Promise<Map<number, ImplementedPillar[]>> {
  const events = (await db.query<EventRow>(`${eventsSql} WHERE plan_id=$1 ORDER BY id`, [planId])).rows;
  return new Map(numbers.map(number => [number, stageVisibleComponents(user, reachedLevels(events.filter(event => event.submissionNumber <= number)))]));
}

/** Visible components on every current working plan of a state (dashboard, Recent activity). */
export async function readStateStageVisibility(db: Db, user: StageViewer, stateCode: string, reviews?: readonly { plan_id: number; pillar: string; status: string }[]): Promise<Map<number, ImplementedPillar[]>> {
  const events = (await db.query<EventRow>(`SELECT e.plan_id AS "planId", e.action, e.scope, e.actor_role AS "actorRole", e.submission_number AS "submissionNumber" FROM plan_review_events e JOIN action_plans p ON p.id=e.plan_id WHERE p.state_code=$1 ORDER BY e.id`, [stateCode])).rows;
  const rows = reviews ?? (await db.query<{ plan_id: number; pillar: string; status: string }>('SELECT r.plan_id, r.pillar, r.status FROM plan_pillar_reviews r JOIN action_plans p ON p.id=r.plan_id WHERE p.state_code=$1', [stateCode])).rows;
  const plans = (await db.query<{ id: number }>('SELECT id FROM action_plans WHERE state_code=$1', [stateCode])).rows;
  return new Map(plans.map(({ id }) => [id, stageVisibleComponents(user, reachedLevels(events.filter(event => event.planId === id), rows.filter(row => row.plan_id === id)))]));
}

/** Refusal for a component the viewer's role could see but that has not been sent to them yet. */
export const notSentYetMessage = 'This component has not been sent to you yet. Its details appear once it reaches you.';
