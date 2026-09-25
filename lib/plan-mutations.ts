import type { Client } from 'pg';
import { NextResponse } from 'next/server';
import { getPostgres } from '@/lib/postgres';
import { type ActionPlan } from '@/lib/action-plans';
import type { getWorkspaceState } from '@/lib/workspace-state';
import { canEditPillar } from './subeb-access';
import type { ImplementedPillar } from './beap-pillars';
import { readPillarReviews, mayEditPillar } from './pillar-review';

// Content writes and review transitions acquire the same row lock. A write
// that races with submission can never change an already-submitted version.
export async function mutatePlan(workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>, plan: ActionPlan, pillar: ImplementedPillar, run: (db: Client) => Promise<NextResponse>) {
  if (!['Data Entry Staff','Director'].includes(workspace.role)) return NextResponse.json({ error: 'Only the assigned officer or Director can edit this pillar.' }, { status: 403 });
  return getPostgres().transaction(async db => {
    const user = (await db.query('SELECT role,department,active FROM users WHERE id=$1 AND session_version=$2 FOR SHARE', [workspace.userId, workspace.sessionVersion])).rows[0];
    if (!user?.active || !canEditPillar(user.role, user.department, pillar)) return NextResponse.json({ error: 'This pillar is not assigned to your department.' }, { status: 403 });
    const current = (await db.query('SELECT status FROM action_plans WHERE id = $1 AND state_code = $2 FOR UPDATE', [plan.id, workspace.stateCode])).rows[0];
    if (!current) return NextResponse.json({ error: 'Action plan not found.' }, { status: 404 });
    if (!mayEditPillar(user.role, user.department, pillar, current.status, await readPillarReviews(db, plan.id))) return NextResponse.json({ error: 'This pillar is read-only at its current review stage.' }, { status: 409 });
    const response = await run(db);
    if (response.status < 400) await db.query('UPDATE action_plans SET version = version + 1 WHERE id = $1', [plan.id]);
    return response;
  });
}
