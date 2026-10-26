import type { QueryResult, QueryResultRow } from 'pg';
import { observationProblem, type ObservationRequest, type ObservationStatus } from './observation-requests';

// Server reads for observation requests (migration 075, lib/observation-requests.ts).
type Db = { query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
const iso = (value: Date | string | null) => value === null ? null : value instanceof Date ? value.toISOString() : value;

/** Every request on the plan, newest first, with each department's reply. */
export async function readObservationRequests(db: Db, planId: number): Promise<ObservationRequest[]> {
  const rows = (await db.query<{ id: number; created_at: Date; requested_by_name: string; comment: string; submission_number: number; departments: { department: string; completed_at: string | null; completed_by_name: string | null; note: string }[] }>(
    `SELECT r.id, r.created_at, r.requested_by_name, r.comment, r.submission_number,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('department', d.department, 'completed_at', d.completed_at, 'completed_by_name', d.completed_by_name, 'note', d.note)
         ORDER BY array_position(ARRAY['audit','procurement','finance'], d.department)) FROM plan_observation_departments d WHERE d.request_id = r.id), '[]'::jsonb) AS departments
     FROM plan_observation_requests r WHERE r.plan_id = $1 ORDER BY r.id DESC`, [planId])).rows;
  return rows.map(r => ({ id: r.id, createdAt: String(iso(r.created_at)), requestedByName: r.requested_by_name, comment: r.comment, submissionNumber: r.submission_number,
    departments: r.departments.map(d => ({ department: d.department as ObservationRequest['departments'][number]['department'], completedAt: d.completed_at, completedByName: d.completed_by_name, note: d.note })) }));
}

export async function openObservationCount(db: Db, planId: number) {
  return (await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM plan_comments WHERE plan_id=$1 AND scope='observation' AND parent_id IS NULL AND resolved_at IS NULL", [planId])).rows[0].n;
}

export async function readObservationStatus(db: Db, planId: number): Promise<ObservationStatus> {
  const requests = await readObservationRequests(db, planId), openComments = await openObservationCount(db, planId);
  return { requests, openComments, problem: observationProblem(requests, openComments) };
}
