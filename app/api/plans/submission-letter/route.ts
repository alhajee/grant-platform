import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { PlanInputError, planFormData } from '@/lib/plan-upload';
import { safeFileName, validLineDocument } from '@/lib/line-document-upload';
import { statePlanOpen } from '@/lib/pillar-review';
import { ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { maxSubmissionLetterBytes, missingSubmissionLetters, submissionLetterKinds, submissionLetterTypeErrors, submissionLetterTypes } from '@/lib/submission-letter';
import { readPendingLetters } from '@/lib/submission-letter-db';

// The Executive Chairman's signature and cover letter for the next submission to UBEC (UBEC132, migration 087).
// GET ?plan=: the pending ones (Executive Chairman and BEAP Chair of the plan's state); ?plan=&id=: a download, also for
// UBEC users who see the round it was sent with. POST ?plan= (multipart: kind, file, drawn): the Executive Chairman adds
// or replaces one while the plan is with the SUBEB (a drawn signature is sent as a PNG). DELETE ?plan=&id= removes a
// pending one. Sending to UBEC (app/api/ubec/review) needs both and attaches them to the new round.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? Number(plan) : null; };
type Workspace = NonNullable<Awaited<ReturnType<typeof getWorkspaceState>>>;
type Db = Parameters<Parameters<ReturnType<typeof getPostgres>['transaction']>[0]>[0];
const isChairman = (user: Workspace) => user.role === 'Executive Chairman';
const seesPending = (user: Workspace) => isChairman(user) || (user.role === 'Director' && !!user.isBeapChair);

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    const db = getPostgres();
    const id = request.nextUrl.searchParams.get('id');
    if (id) {
      if (!z.string().uuid().safeParse(id).success) return error('Document not found', 404);
      // The state's Executive Chairman and BEAP Chair; at UBEC, anyone who sees the round the letter was sent with.
      const row = (await db.query<{ name: string; media_type: string; content: Buffer }>(`SELECT l.name,l.media_type,l.content FROM plan_submission_letters l JOIN action_plans p ON p.id=l.plan_id
        WHERE l.id=$1 AND l.plan_id=$2 AND l.removed_at IS NULL AND (
          (p.state_code=$3 AND $7::boolean) OR
          (l.ubec_round_id IS NOT NULL AND EXISTS(SELECT 1 FROM ubec_rounds r WHERE r.id=l.ubec_round_id AND ${ubecSeesPillarSql('r', 'NULL::text', '$4::text', '$6::int', '$5::text')})))`,
        [id, planId, user.stateCode, user.role, user.department, user.userId, seesPending(user)])).rows[0];
      if (!row) return error('Document not found', 404);
      const inline = request.nextUrl.searchParams.get('download') !== '1' && (row.media_type === 'application/pdf' || row.media_type.startsWith('image/'));
      return new NextResponse(new Uint8Array(row.content), { headers: { 'Content-Type': row.media_type, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
    }
    if (!seesPending(user)) return error('Only the Executive Chairman and the BEAP Chair see the submission letter', 403);
    if (!(await db.query('SELECT 1 FROM action_plans WHERE id=$1 AND state_code=$2', [planId, user.stateCode])).rowCount) return error('Plan not found', 404);
    const letters = await readPendingLetters(db, planId);
    return NextResponse.json({ letters, missing: missingSubmissionLetters(letters), canEdit: isChairman(user) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) { console.error('Submission letter read failed', cause); return error('Unable to load the signature and cover letter', 503); }
}

/** The plan locked for the Executive Chairman's write, or an error response. */
async function writablePlan(db: Db, user: Workspace, planId: number): Promise<{ plan: { id: number } } | { problem: NextResponse }> {
  if (!isChairman(user)) return { problem: error('Only the Executive Chairman signs and attaches the cover letter', 403) };
  const plan = (await db.query<{ id: number; status: string }>('SELECT id,status FROM action_plans WHERE id=$1 AND state_code=$2 FOR UPDATE', [planId, user.stateCode])).rows[0];
  if (!plan) return { problem: error('Plan not found', 404) };
  if (!statePlanOpen(plan.status)) return { problem: error('This plan is already with UBEC', 409) };
  return { plan };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if (!user) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    const form = await planFormData(request);
    const kind = z.enum(submissionLetterKinds).safeParse(form.get('kind'));
    if (!kind.success) return error('Choose the signature or the cover letter');
    const drawn = kind.data === 'signature' && form.get('drawn') === 'true';
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.size || file.size > maxSubmissionLetterBytes) return error('Choose a nonempty file up to 10 MB.');
    const name = drawn ? 'signature.png' : safeFileName(file.name), ext = name.split('.').pop()?.toLowerCase() ?? '';
    const types = submissionLetterTypes[kind.data], bytes = Buffer.from(await file.arrayBuffer());
    if (!types[ext] || !(await validLineDocument(ext, bytes))) return error(submissionLetterTypeErrors[kind.data]);
    return await getPostgres().transaction(async db => {
      const target = await writablePlan(db, user, planId);
      if ('problem' in target) return target.problem;
      // One pending file per kind: a new one replaces it.
      await db.query('UPDATE plan_submission_letters SET removed_at=NOW() WHERE plan_id=$1 AND kind=$2 AND ubec_round_id IS NULL AND removed_at IS NULL', [planId, kind.data]);
      const id = crypto.randomUUID();
      await db.query("INSERT INTO plan_submission_letters(id,plan_id,kind,name,media_type,content,size,drawn,uploaded_by,uploaded_by_name) VALUES($1,$2,$3,$4,$5,decode($6,'hex'),$7,$8,$9,$10)",
        [id, planId, kind.data, name, types[ext], bytes.toString('hex'), bytes.length, drawn, user.userId, user.name]);
      return NextResponse.json({ id, name, size: bytes.length }, { status: 201 });
    });
  } catch (cause) {
    if (cause instanceof PlanInputError) return error(cause.message, cause.status);
    console.error('Submission letter upload failed', cause); return error('Unable to save the file. Please try again.', 503);
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
      const removed = await db.query('UPDATE plan_submission_letters SET removed_at=NOW() WHERE id=$1 AND plan_id=$2 AND ubec_round_id IS NULL AND removed_at IS NULL', [id.data, planId]);
      if (!removed.rowCount) return error('Document not found', 404);
      return NextResponse.json({ ok: true });
    });
  } catch (cause) { console.error('Submission letter removal failed', cause); return error('Unable to remove the file. Please try again.', 503); }
}
