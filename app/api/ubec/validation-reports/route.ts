import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { implementedPillars } from '@/lib/beap-pillars';
import { ubecRoles } from '@/lib/ubec';
import { componentName, needsValidationReport } from '@/lib/ubec-flow';
import { readActor, ubecSeesPillarSql } from '@/lib/ubec-flow-db';
import { PlanInputError, planFormData } from '@/lib/plan-upload';
import { safeFileName, supportingDocumentTypeError, supportingDocumentTypes, validLineDocument } from '@/lib/line-document-upload';

// Validation Reports (migration 069): an Assessment Officer uploads one or more for Infrastructure before completing
// their assessment. Upload and removal only by that officer while the component is with its Director; downloads by
// anyone who can see the component in that round (ubecSeesPillarSql), like the other UBEC documents.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const maxBytes = 10 * 1024 * 1024, maxPerOfficer = 10;
const planParam = (request: NextRequest) => { const plan = request.nextUrl.searchParams.get('plan'); return plan && /^[1-9]\d{0,9}$/.test(plan) ? plan : null; };

/** The officer's open assignment on a component at the Director stage of the plan's latest round, or an error. */
async function openAssignment(db: Parameters<Parameters<ReturnType<typeof getPostgres>['transaction']>[0]>[0], planId: string, roundId: number, pillar: string, officerId: number) {
  if (!(await db.query('SELECT 1 FROM action_plans WHERE id=$1 FOR SHARE', [planId])).rowCount) return { problem: error('Plan not found', 404) };
  const round = (await db.query<{ id: number; status: string }>('SELECT id,status FROM ubec_rounds WHERE id=$1 AND plan_id=$2', [roundId, planId])).rows[0];
  const latest = (await db.query<{ id: number }>('SELECT id FROM ubec_rounds WHERE plan_id=$1 ORDER BY number DESC LIMIT 1', [planId])).rows[0];
  if (!round) return { problem: error('Submission not found', 404) };
  if (latest?.id !== round.id || round.status !== 'reviewing') return { problem: error('This submission is no longer open for review', 409) };
  const component = (await db.query<{ id: number; stage: string }>('SELECT id,stage FROM ubec_round_components WHERE round_id=$1 AND pillar=$2 FOR UPDATE', [round.id, pillar])).rows[0];
  if (!component) return { problem: error('This component was not released for review', 404) };
  if (component.stage !== 'director') return { problem: error('This component has already been sent to the Oversight Departments', 409) };
  const assignment = (await db.query<{ completed_at: Date | null }>('SELECT completed_at FROM ubec_officer_assignments WHERE round_component_id=$1 AND officer_id=$2 AND removed_at IS NULL', [component.id, officerId])).rows[0];
  if (!assignment) return { problem: error('This component is not assigned to you', 403) };
  if (assignment.completed_at) return { problem: error('You have already completed this assessment', 409) };
  return { componentId: component.id };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const planId = planParam(request);
    if (!planId) return error('Choose a valid plan');
    const form = await planFormData(request);
    const fields = z.object({ roundId: z.coerce.number().int().positive(), pillar: z.enum(implementedPillars) }).safeParse({ roundId: form.get('roundId'), pillar: form.get('pillar') });
    if (!fields.success) return error('Invalid upload request');
    if (!needsValidationReport(fields.data.pillar)) return error(`${componentName(fields.data.pillar)} does not take a Validation Report`);
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.size || file.size > maxBytes) return error('Choose a nonempty file up to 10 MB.');
    const name = safeFileName(file.name), ext = name.split('.').pop()?.toLowerCase() ?? '';
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!supportingDocumentTypes[ext] || !(await validLineDocument(ext, bytes))) return error(supportingDocumentTypeError);
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return error('Session expired', 401);
      if (actor.role !== ubecRoles.officer) return error('Only the assigned Assessment Officer uploads the Validation Report', 403);
      const open = await openAssignment(db, planId, fields.data.roundId, fields.data.pillar, actor.id);
      if (open.problem) return open.problem;
      const count = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM ubec_validation_reports WHERE round_component_id=$1 AND officer_id=$2 AND removed_at IS NULL', [open.componentId, actor.id])).rows[0].n;
      if (count >= maxPerOfficer) return error(`Attach up to ${maxPerOfficer} files`, 409);
      const id = crypto.randomUUID();
      await db.query("INSERT INTO ubec_validation_reports(id,round_component_id,officer_id,officer_name,name,media_type,content,size) VALUES($1,$2,$3,$4,$5,$6,decode($7,'hex'),$8)", [id, open.componentId, actor.id, actor.full_name, name, supportingDocumentTypes[ext], bytes.toString('hex'), bytes.length]);
      return NextResponse.json({ id, name, size: bytes.length });
    });
  } catch (cause) {
    if (cause instanceof PlanInputError) return error(cause.message, cause.status);
    console.error('Validation report upload failed', cause); return error('Unable to upload the report. Please try again.', 503);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const planId = planParam(request), id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('id'));
    if (!planId || !id.success) return error('Report not found', 404);
    return await getPostgres().transaction(async db => {
      const actor = await readActor(db, session);
      if (!actor) return error('Session expired', 401);
      const report = (await db.query<{ round_id: number; pillar: string; officer_id: number }>('SELECT rc.round_id,rc.pillar,v.officer_id FROM ubec_validation_reports v JOIN ubec_round_components rc ON rc.id=v.round_component_id JOIN ubec_rounds r ON r.id=rc.round_id WHERE v.id=$1 AND r.plan_id=$2 AND v.removed_at IS NULL', [id.data, planId])).rows[0];
      if (!report || report.officer_id !== actor.id) return error('Report not found', 404);
      const open = await openAssignment(db, planId, report.round_id, report.pillar, actor.id);
      if (open.problem) return open.problem;
      await db.query('UPDATE ubec_validation_reports SET removed_at=NOW() WHERE id=$1', [id.data]);
      return NextResponse.json({ ok: true });
    });
  } catch (cause) {
    console.error('Validation report removal failed', cause); return error('Unable to remove the report. Please try again.', 503);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getWorkspaceState(request);
    if (!session) return error('Sign in to continue', 401);
    const planId = planParam(request), id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('id'));
    if (!planId || !id.success) return error('Report not found', 404);
    const db = getPostgres();
    const actor = await readActor(db, session);
    if (!actor) return error('Session expired', 401);
    const row = (await db.query<{ name: string; media_type: string; content: Buffer }>(`SELECT v.name,v.media_type,v.content FROM ubec_validation_reports v JOIN ubec_round_components c ON c.id=v.round_component_id JOIN ubec_rounds r ON r.id=c.round_id
      WHERE v.id=$1 AND r.plan_id=$2 AND v.removed_at IS NULL AND (${ubecSeesPillarSql('r', 'c.pillar', '$3::text', '$4::int', '$5::text')})`, [id.data, planId, actor.role, actor.id, actor.department ?? ''])).rows[0];
    if (!row) return error('Report not found', 404);
    const inline = request.nextUrl.searchParams.get('download') !== '1' && (row.media_type === 'application/pdf' || row.media_type.startsWith('image/'));
    return new NextResponse(new Uint8Array(row.content), { headers: { 'Content-Type': row.media_type, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (cause) {
    console.error('Validation report download failed', cause); return error('Unable to download the report', 503);
  }
}
