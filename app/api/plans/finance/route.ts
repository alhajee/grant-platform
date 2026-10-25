import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { PlanInputError, planFormData } from '@/lib/plan-upload';
import { safeFileName, supportingDocumentTypeError, supportingDocumentTypes, validLineDocument } from '@/lib/line-document-upload';
import type { Db as Queryable } from '@/lib/ubec-flow-db';
import { financeDocumentKinds, financeDocumentLabels, isStateFinance, missingFinanceDocuments, seesStateFinance, seesUbecFinance, type FinanceDocument, type FinanceDocuments } from '@/lib/finance-documents';

// Finance documents of a plan (UBEC130, migration 073). GET lists them (or downloads one with ?id=) for SUBEB Finance,
// the BEAP Chair and the Executive Chairman of the plan's state, and at UBEC for the Finance Oversight Director and
// Finance Assessment Officers once the plan has reached UBEC. POST uploads one (multipart: kind, file; it replaces the
// live file of that kind) or submits them to the BEAP Chair ({ action: 'submit' }, all three needed). DELETE ?id=
// removes one. Writes: SUBEB Finance only, same origin, at any stage: the documents are not part of the plan's
// snapshot, so Finance can still add them after the plan has gone to UBEC (UBEC Finance then sees them).
type Db = Parameters<Parameters<ReturnType<typeof getPostgres>['transaction']>[0]>[0];
type Workspace = NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
type PlanRow = { id: number; state_code: string; status: string; submission_number: number; finance_submitted_at: Date | null; finance_submitted_by_name: string | null };
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const maxBytes = 10 * 1024 * 1024;
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? plan : null; };
const iso = (value: Date | string | null) => value === null ? null : value instanceof Date ? value.toISOString() : value;

/** The plan if the viewer may see its Finance documents (state side: own state; UBEC Finance: plans with a UBEC round). */
async function viewablePlan(db: Queryable, user: Workspace, planId: string, lock = false): Promise<PlanRow | null> {
  const plan = (await db.query<PlanRow>(`SELECT id,state_code,status,submission_number,finance_submitted_at,finance_submitted_by_name FROM action_plans WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [planId])).rows[0];
  if (!plan) return null;
  if (seesUbecFinance(user)) return (await db.query('SELECT 1 FROM ubec_rounds WHERE plan_id=$1 LIMIT 1', [planId])).rowCount ? plan : null;
  return plan.state_code === user.stateCode && seesStateFinance(user) ? plan : null;
}

async function listDocuments(db: Queryable, planId: number): Promise<FinanceDocument[]> {
  return (await db.query<{ id: string; kind: FinanceDocument['kind']; name: string; size: number; uploaded_by_name: string; created_at: Date }>('SELECT id,kind,name,size,uploaded_by_name,created_at FROM plan_finance_documents WHERE plan_id=$1 AND removed_at IS NULL ORDER BY created_at', [planId])).rows
    .map(d => ({ id: d.id, kind: d.kind, name: d.name, size: d.size, uploadedByName: d.uploaded_by_name, createdAt: iso(d.created_at)! }));
}

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    const db = getPostgres();
    const plan = await viewablePlan(db, user, planId);
    if (!plan) return error('Only Finance, the BEAP Chair and the Executive Chairman see these documents', 403);
    const id = request.nextUrl.searchParams.get('id');
    if (id) {
      if (!z.string().uuid().safeParse(id).success) return error('Document not found', 404);
      const row = (await db.query<{ name: string; media_type: string; content: Buffer }>('SELECT name,media_type,content FROM plan_finance_documents WHERE id=$1 AND plan_id=$2 AND removed_at IS NULL', [id, plan.id])).rows[0];
      if (!row) return error('Document not found', 404);
      const inline = request.nextUrl.searchParams.get('download') !== '1' && (row.media_type === 'application/pdf' || row.media_type.startsWith('image/'));
      return new NextResponse(new Uint8Array(row.content), { headers: { 'Content-Type': row.media_type, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const documents = await listDocuments(db, plan.id);
    const body: FinanceDocuments = { documents, submittedAt: iso(plan.finance_submitted_at), submittedByName: plan.finance_submitted_by_name, canEdit: isStateFinance(user) && plan.state_code === user.stateCode, missing: missingFinanceDocuments(documents) };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error('Finance documents read failed', cause); return error('Unable to load the Finance documents', 503); }
}

/** The plan locked for a Finance write, or an error response. */
async function writablePlan(db: Db, user: Workspace, planId: string): Promise<{ plan: PlanRow } | { problem: NextResponse }> {
  if (!isStateFinance(user)) return { problem: error('Only the Finance department uploads these documents', 403) };
  const plan = await viewablePlan(db, user, planId, true);
  if (!plan) return { problem: error('Plan not found', 404) };
  return { plan };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    if (request.headers.get('content-type')?.includes('application/json')) {
      const parsed = z.object({ action: z.literal('submit') }).strict().safeParse(await request.json().catch(() => null));
      if (!parsed.success) return error('Invalid request');
      return await getPostgres().transaction(async db => {
        const target = await writablePlan(db, user, planId);
        if ('problem' in target) return target.problem;
        const missing = missingFinanceDocuments(await listDocuments(db, target.plan.id));
        if (missing.length) return error(`Upload the ${missing.join(', ')} first`, 409);
        await db.query('UPDATE action_plans SET finance_submitted_at=NOW(),finance_submitted_by_name=$1 WHERE id=$2', [user.name, target.plan.id]);
        // Recorded in the review history and announced to the state's BEAP Chair.
        const event = (await db.query<{ id: number }>("INSERT INTO plan_review_events(plan_id,submission_number,action,actor_name,actor_email,actor_role,comment,scope) VALUES($1,$2,'finance_submit',$3,$4,$5,$6,'general') RETURNING id",
          [target.plan.id, target.plan.submission_number, user.name, user.email, user.role, financeDocumentKinds.map(k => financeDocumentLabels[k]).join(', ')])).rows[0];
        await db.query("INSERT INTO plan_notifications(plan_id,user_id,event_id) SELECT $1,id,$2 FROM users WHERE state_code=$3 AND role='Director' AND is_beap_chair AND active AND id<>$4", [target.plan.id, event.id, target.plan.state_code, user.userId]);
        return NextResponse.json({ submitted: true });
      });
    }
    const form = await planFormData(request);
    const kind = z.enum(financeDocumentKinds).safeParse(form.get('kind'));
    if (!kind.success) return error('Choose which Finance document this is');
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.size || file.size > maxBytes) return error('Choose a nonempty file up to 10 MB.');
    const name = safeFileName(file.name), ext = name.split('.').pop()?.toLowerCase() ?? '';
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!supportingDocumentTypes[ext] || !(await validLineDocument(ext, bytes))) return error(supportingDocumentTypeError);
    return await getPostgres().transaction(async db => {
      const target = await writablePlan(db, user, planId);
      if ('problem' in target) return target.problem;
      // One live file per kind: a new upload replaces it, and a change after submitting needs submitting again.
      await db.query('UPDATE plan_finance_documents SET removed_at=NOW() WHERE plan_id=$1 AND kind=$2 AND removed_at IS NULL', [target.plan.id, kind.data]);
      const id = crypto.randomUUID();
      await db.query("INSERT INTO plan_finance_documents(id,plan_id,kind,name,media_type,content,size,uploaded_by,uploaded_by_name) VALUES($1,$2,$3,$4,$5,decode($6,'hex'),$7,$8,$9)", [id, target.plan.id, kind.data, name, supportingDocumentTypes[ext], bytes.toString('hex'), bytes.length, user.userId, user.name]);
      await db.query('UPDATE action_plans SET finance_submitted_at=NULL,finance_submitted_by_name=NULL WHERE id=$1', [target.plan.id]);
      return NextResponse.json({ id, name, size: bytes.length });
    });
  } catch (cause) {
    if (cause instanceof PlanInputError) return error(cause.message, cause.status);
    console.error('Finance document write failed', cause); return error('Unable to save the Finance document. Please try again.', 503);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const planId = planParam(request), id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('id'));
    if (!planId || !id.success) return error('Document not found', 404);
    return await getPostgres().transaction(async db => {
      const target = await writablePlan(db, user, planId);
      if ('problem' in target) return target.problem;
      const removed = await db.query('UPDATE plan_finance_documents SET removed_at=NOW() WHERE id=$1 AND plan_id=$2 AND removed_at IS NULL', [id.data, target.plan.id]);
      if (!removed.rowCount) return error('Document not found', 404);
      await db.query('UPDATE action_plans SET finance_submitted_at=NULL,finance_submitted_by_name=NULL WHERE id=$1', [target.plan.id]);
      return NextResponse.json({ ok: true });
    });
  } catch (cause) { console.error('Finance document removal failed', cause); return error('Unable to remove the Finance document. Please try again.', 503); }
}
