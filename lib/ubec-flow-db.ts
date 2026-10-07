import type { QueryResult, QueryResultRow } from 'pg';
import { implementedPillars, type ImplementedPillar } from './beap-pillars';
import type { Snapshot } from './plan-review';
import { activePillars, isComponentDepartment, isOversightDepartment, oversightIds, pillarDepartments, ubecRoles, type UbecRound } from './ubec';
import { componentAmount, componentItems, decisionCounts, superAdminRole, type FlowAbilities, type FlowComponent, type ItemDecision, type OfficerAssignment, type OversightReview, type UbecFlow } from './ubec-flow';

// Server-side reads and helpers for the UBEC review flow (docs/ubec-flow.md, migration 055).

export type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export type UbecViewer = { id: number; role: string; department: string | null };
export const openRoundStatuses = ['received', 'reviewing'];

/** The viewer sees every component of every round (read-only for the ES). */
export const seesEverything = (role: string) => role === ubecRoles.es || role === ubecRoles.chair || role === superAdminRole;

/**
 * SQL condition: the UBEC viewer may see component `pillar` (SQL expression; NULL = any component) of round `r`.
 * Parameters: role, user id and department placeholders (e.g. '$4', '$5', '$6').
 */
export function ubecSeesPillarSql(round: string, pillar: string, role: string, userId: string, department: string) {
  const match = `(${pillar} IS NULL OR rc.pillar=${pillar})`;
  return `(${role} IN ('${ubecRoles.es}','${ubecRoles.chair}')
    OR (${role}='${ubecRoles.director}' AND (EXISTS(SELECT 1 FROM ubec_round_components rc WHERE rc.round_id=${round}.id AND ${match} AND rc.department=${department})
      OR EXISTS(SELECT 1 FROM ubec_assignments la WHERE la.round_id=${round}.id AND (${pillar} IS NULL OR la.pillar=${pillar}) AND la.department=${department})))
    OR (${role}='${ubecRoles.oversight}' AND EXISTS(SELECT 1 FROM ubec_round_components rc WHERE rc.round_id=${round}.id AND ${match} AND rc.sent_to_oversight_at IS NOT NULL))
    OR (${role}='${ubecRoles.officer}' AND EXISTS(SELECT 1 FROM ubec_round_components rc JOIN ubec_officer_assignments oa ON oa.round_component_id=rc.id AND oa.removed_at IS NULL WHERE rc.round_id=${round}.id AND ${match} AND oa.officer_id=${userId})))`;
}

/** Rounds of a plan the viewer can open (at least one visible component), newest first. */
export async function readViewerRounds(db: Db, planId: number | string, viewer: UbecViewer) {
  return (await db.query<UbecRound>(`SELECT r.* FROM ubec_rounds r WHERE r.plan_id=$1 AND ${ubecSeesPillarSql('r', 'NULL::text', '$2::text', '$3::int', '$4::text')} ORDER BY r.number DESC`, [planId, viewer.role, viewer.id, viewer.department])).rows;
}

/** Components of `round` the viewer sees (stage-gated). */
export async function viewerPillars(db: Db, round: UbecRound, viewer: UbecViewer): Promise<ImplementedPillar[]> {
  if (seesEverything(viewer.role)) return activePillars(round.snapshot);
  const rows = (await db.query<{ pillar: ImplementedPillar }>(`SELECT p.pillar FROM unnest($5::text[]) AS p(pillar), (SELECT $1::int AS id) AS r WHERE ${ubecSeesPillarSql('r', 'p.pillar', '$2::text', '$3::int', '$4::text')}`, [round.id, viewer.role, viewer.id, viewer.department, implementedPillars])).rows;
  return implementedPillars.filter(pillar => rows.some(row => row.pillar === pillar));
}

/** The round snapshot with only the given components (every key present, empty when hidden). */
export function ubecVisibleSnapshot(snapshot: Snapshot, visible: readonly ImplementedPillar[]): Snapshot {
  const can = (pillar: ImplementedPillar) => visible.includes(pillar);
  return {
    setup: snapshot.setup,
    infrastructure: can('infrastructure') ? snapshot.infrastructure : [], infrastructureDocuments: can('infrastructure') ? snapshot.infrastructureDocuments : undefined,
    sports: can('sports') ? snapshot.sports : [], sbmc: can('sbmc') ? snapshot.sbmc ?? [] : [],
    tlm: can('tlm') ? snapshot.tlm ?? [] : [], tlmDistribution: can('tlm') ? snapshot.tlmDistribution ?? [] : [],
    monitoring: can('monitoring') ? snapshot.monitoring ?? [] : [], gscci: can('gscci') ? snapshot.gscci ?? [] : [], gscciDistribution: can('gscci') ? snapshot.gscciDistribution ?? [] : [],
    curriculum: can('curriculum') ? snapshot.curriculum ?? [] : [], curriculumDistribution: can('curriculum') ? snapshot.curriculumDistribution ?? [] : [],
    quality: can('quality') ? snapshot.quality ?? [] : [], teachers: can('teachers') ? snapshot.teachers ?? [] : [], ict: can('ict') ? snapshot.ict ?? [] : [], planning: can('planning') ? snapshot.planning ?? [] : [],
    componentDocuments: (snapshot.componentDocuments ?? []).filter(d => can(d.component)),
  };
}

type ComponentRow = { id: number; pillar: ImplementedPillar; department: string; stage: FlowComponent['stage']; director_comment: string; director_name: string | null; sent_to_oversight_at: Date | null; arrived_at: Date | null; released_at: Date };
const iso = (value: Date | string | null) => value === null ? null : value instanceof Date ? value.toISOString() : value;

/** Released components of a round, with their officers and oversight reviews (all components; callers filter). */
export async function readRoundComponents(db: Db, round: Pick<UbecRound, 'id' | 'snapshot'>, decisions: readonly ItemDecision[] = []) {
  const components = (await db.query<ComponentRow>('SELECT * FROM ubec_round_components WHERE round_id=$1 ORDER BY id', [round.id])).rows;
  if (!components.length) return [] as FlowComponent[];
  const ids = components.map(c => c.id);
  const officers = (await db.query<{ id: number; round_component_id: number; officer_id: number; officer_name: string; assigned_by_name: string; comment: string; created_at: Date; completed_at: Date | null; completion_note: string }>('SELECT * FROM ubec_officer_assignments WHERE round_component_id=ANY($1::int[]) AND removed_at IS NULL ORDER BY id', [ids])).rows;
  const oversight = (await db.query<{ round_component_id: number; department: OversightReview['department']; reviewer_name: string; note: string; completed_at: Date }>('SELECT * FROM ubec_oversight_reviews WHERE round_component_id=ANY($1::int[]) ORDER BY id', [ids])).rows;
  return components.map((c): FlowComponent => {
    const items = componentItems(round.snapshot, c.pillar);
    return {
      id: c.id, pillar: c.pillar, department: c.department, stage: c.stage, directorComment: c.director_comment, directorName: c.director_name,
      sentToOversightAt: iso(c.sent_to_oversight_at), arrivedAt: iso(c.arrived_at), releasedAt: iso(c.released_at)!,
      officers: officers.filter(o => o.round_component_id === c.id).map((o): OfficerAssignment => ({ id: o.id, officerId: o.officer_id, officerName: o.officer_name, assignedByName: o.assigned_by_name, comment: o.comment, createdAt: iso(o.created_at)!, completedAt: iso(o.completed_at), completionNote: o.completion_note })),
      oversight: oversight.filter(o => o.round_component_id === c.id).map(o => ({ department: o.department, reviewerName: o.reviewer_name, note: o.note, completedAt: iso(o.completed_at)! })),
      counts: decisionCounts(items, decisions.filter(d => d.pillar === c.pillar)), amount: componentAmount(round.snapshot, c.pillar),
    };
  });
}

export async function readDecisions(db: Db, roundId: number): Promise<ItemDecision[]> {
  return (await db.query<{ pillar: ImplementedPillar; row_ref: string; decision: ItemDecision['decision']; note: string; officer_name: string; decided_at: Date }>('SELECT pillar,row_ref,decision,note,officer_name,decided_at FROM ubec_item_decisions WHERE round_id=$1 ORDER BY id', [roundId])).rows
    .map(d => ({ pillar: d.pillar, rowRef: d.row_ref, decision: d.decision, note: d.note, officerName: d.officer_name, decidedAt: iso(d.decided_at)! }));
}

/** Every item of every released component is decided and none is rejected. */
export const approvableComponents = (components: readonly FlowComponent[]) => components.length > 0 && components.every(c => c.stage === 'chair' && c.counts.rejected === 0 && c.counts.undecided === 0);

/** What the viewer may do on this round now (the round must be the plan's latest). */
export function flowAbilities(viewer: UbecViewer, round: Pick<UbecRound, 'status'>, latest: boolean, components: readonly FlowComponent[]): FlowAbilities {
  const reviewing = latest && round.status === 'reviewing', chair = viewer.role === ubecRoles.chair;
  // The Super Admin assigns and removes officers on any component (sendOversight stays with the Director).
  const assigns = (c: FlowComponent) => viewer.role === superAdminRole || (viewer.role === ubecRoles.director && c.department === viewer.department);
  const ownDepartment = (c: FlowComponent) => viewer.role === ubecRoles.director && c.department === viewer.department;
  const mine = (c: FlowComponent) => viewer.role === ubecRoles.officer && c.officers.some(o => o.officerId === viewer.id && !o.completedAt);
  const atDirector = components.filter(c => reviewing && c.stage === 'director');
  return {
    release: chair && latest && round.status === 'received',
    decide: chair && reviewing && components.length > 0 && components.every(c => c.stage === 'chair'),
    assign: atDirector.filter(assigns).map(c => c.pillar),
    sendOversight: atDirector.filter(c => ownDepartment(c) && c.officers.length > 0 && c.officers.every(o => o.completedAt)).map(c => c.pillar),
    assess: atDirector.filter(mine).map(c => c.pillar),
    complete: atDirector.filter(mine).map(c => c.pillar),
    observe: components.filter(c => reviewing && c.stage === 'oversight' && viewer.role === ubecRoles.oversight && isOversightDepartment(viewer.department) && !c.oversight.some(o => o.department === viewer.department)).map(c => c.pillar),
  };
}

/** The full flow of one round as this viewer may see it. */
export async function readFlow(db: Db, round: UbecRound, latest: boolean, viewer: UbecViewer, visible: readonly ImplementedPillar[]): Promise<UbecFlow> {
  const allDecisions = await readDecisions(db, round.id);
  const all = await readRoundComponents(db, round, allDecisions);
  const components = all.filter(c => visible.includes(c.pillar));
  const previous = (await db.query<{ id: number }>('SELECT id FROM ubec_rounds WHERE plan_id=$1 AND number<$2 ORDER BY number DESC LIMIT 1', [round.plan_id, round.number])).rows[0];
  const previousDecisions = previous ? (await readDecisions(db, previous.id)).filter(d => visible.includes(d.pillar)) : [];
  const officerDepartments = viewer.role === superAdminRole ? [...new Set(components.map(c => c.department))] : viewer.role === ubecRoles.director && isComponentDepartment(viewer.department) ? [viewer.department] : [];
  const departmentOfficers = officerDepartments.length
    ? (await db.query<{ id: number; name: string; email: string; open: number; department: string }>(`SELECT u.id, u.full_name AS name, u.email, u.department,
        (SELECT COUNT(*)::int FROM ubec_officer_assignments oa JOIN ubec_round_components rc ON rc.id=oa.round_component_id JOIN ubec_rounds r ON r.id=rc.round_id
          WHERE oa.officer_id=u.id AND oa.removed_at IS NULL AND oa.completed_at IS NULL AND r.status='reviewing') AS open
        FROM users u WHERE u.role=$1 AND u.department=ANY($2::text[]) AND u.active ORDER BY u.full_name`, [ubecRoles.officer, officerDepartments])).rows
    : [];
  return {
    releasedAt: iso(round.released_at ?? null), releasedByName: round.released_by_name ?? null, releaseComment: round.release_comment ?? '',
    components, decisions: allDecisions.filter(d => visible.includes(d.pillar)), previousDecisions,
    abilities: viewer.role === ubecRoles.es ? flowAbilities({ ...viewer, role: '' }, round, latest, components) : flowAbilities(viewer, round, latest, all.filter(c => visible.includes(c.pillar))),
    officers: departmentOfficers,
    allArrived: all.length > 0 && all.every(c => c.stage === 'chair'), approvable: approvableComponents(all),
  };
}

// --- writes ---------------------------------------------------------------------------------------------

export type Actor = { id: number; role: string; department: string | null; full_name: string; email: string };
/** The acting user, re-read under a share lock (a changed role or signed-out session is refused). */
export async function readActor(db: Db, session: { userId: number; sessionVersion: number }) {
  return (await db.query<Actor>('SELECT id, role, department, full_name, email FROM users WHERE id=$1 AND active AND session_version=$2 FOR SHARE', [session.userId, session.sessionVersion])).rows[0];
}

export async function addUbecEvent(db: Db, event: { roundId: number; planId: number | string; action: string; actor: Actor; comment?: string; pillar?: ImplementedPillar | null }) {
  return (await db.query<{ id: number }>('INSERT INTO ubec_events(round_id,plan_id,action,actor,actor_id,comment,pillar) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [event.roundId, event.planId, event.action, event.actor.full_name, event.actor.id, event.comment ?? '', event.pillar ?? null])).rows[0].id;
}
type Recipients = { role: string; departments?: readonly string[] } | { userIds: readonly number[] };
/** Bell notifications for UBEC users (never the actor themselves). */
export async function notifyUbec(db: Db, planId: number | string, eventId: number, actorId: number, ...targets: Recipients[]) {
  for (const target of targets) {
    if ('userIds' in target) { if (target.userIds.length) await db.query('INSERT INTO plan_notifications(plan_id,user_id,ubec_event_id) SELECT $1,id,$2 FROM users WHERE id=ANY($3::int[]) AND active AND id<>$4 ON CONFLICT DO NOTHING', [planId, eventId, target.userIds, actorId]); continue; }
    await db.query(`INSERT INTO plan_notifications(plan_id,user_id,ubec_event_id) SELECT $1,id,$2 FROM users WHERE role=$3 AND active AND id<>$4 ${target.departments ? 'AND department=ANY($5::text[])' : ''} ON CONFLICT DO NOTHING`,
      target.departments ? [planId, eventId, target.role, actorId, target.departments] : [planId, eventId, target.role, actorId]);
  }
}

/** Released components for a round: one per populated component, owned by its UBEC department. */
export const releaseRows = (snapshot: Snapshot) => activePillars(snapshot).map(pillar => ({ pillar, department: pillarDepartments[pillar] }));
export { oversightIds };
