import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { mutatePlan } from '@/lib/plan-mutations';
import { canViewComponent } from '@/lib/subeb-access';
import { planFormData, PlanInputError } from '@/lib/plan-upload';
import { lineDocumentLabel, lineDocumentWorkstreams, maxLineDocumentBytes, maxLineDocuments, type LineDocumentWorkstream } from '@/lib/activity-extras';
import { lineDocumentTypeError, lineDocumentTypes, safeFileName, validLineDocument } from '@/lib/line-document-upload';

// Documents attached to one Quality Assurance or ICT budget line (activity_line_documents, migration 038).
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const component = z.enum(lineDocumentWorkstreams);
const lineId = z.coerce.number().int().positive();

export async function POST(req: NextRequest) {
  try {
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to upload documents.', 401);
    const plan = await resolveActionPlan(req, user.stateCode); if (!plan) return error('Plan not found.', 404);
    const form = await planFormData(req), workstream = component.safeParse(form.get('workstream')), line = lineId.safeParse(form.get('lineId'));
    if (!workstream.success || !line.success) return error('Choose the budget line for this document.');
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.size || file.size > maxLineDocumentBytes) return error('Choose a nonempty file up to 5 MB.');
    const name = safeFileName(file.name), ext = name.split('.').pop()?.toLowerCase() ?? '';
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!lineDocumentTypes[ext] || !(await validLineDocument(ext, bytes))) return error(lineDocumentTypeError);
    return await mutatePlan(user, plan, workstream.data, async db => {
      const target = (await db.query<{ activity: number }>('SELECT activity FROM activity_plan_lines WHERE id=$1 AND plan_id=$2 AND workstream=$3', [line.data, plan.id, workstream.data])).rows[0];
      if (!target) return error('Budget line not found.', 404);
      if (!lineDocumentLabel(workstream.data, target.activity)) return error('This activity does not take documents.');
      const count = (await db.query('SELECT COUNT(*)::int AS count FROM activity_line_documents WHERE line_id=$1 AND removed_at IS NULL', [line.data])).rows[0].count;
      if (count >= maxLineDocuments) return error(`This budget line has reached its ${maxLineDocuments}-document limit.`);
      const id = crypto.randomUUID();
      await db.query("INSERT INTO activity_line_documents(id,plan_id,line_id,component,name,media_type,content,size) VALUES($1,$2,$3,$4,$5,$6,decode($7,'hex'),$8)", [id, plan.id, line.data, workstream.data, name, lineDocumentTypes[ext], bytes.toString('hex'), bytes.length]);
      return NextResponse.json({ id, name, size: bytes.length });
    });
  } catch (cause) { if (cause instanceof PlanInputError) return error(cause.message, cause.status); console.error(cause); return error('Unable to upload the document.', 503); }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to remove documents.', 401);
    const plan = await resolveActionPlan(req, user.stateCode); if (!plan) return error('Plan not found.', 404);
    const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get('id')), workstream = component.safeParse(req.nextUrl.searchParams.get('workstream'));
    if (!id.success || !workstream.success) return error('Document not found.', 404);
    return await mutatePlan(user, plan, workstream.data, async db => {
      const removed = await db.query('UPDATE activity_line_documents SET removed_at=NOW() WHERE id=$1 AND plan_id=$2 AND component=$3 AND removed_at IS NULL', [id.data, plan.id, workstream.data]);
      return removed.rowCount ? NextResponse.json({ ok: true }) : error('Document not found.', 404);
    });
  } catch (cause) { console.error(cause); return error('Unable to remove the document.', 503); }
}

// State users who can view the component; the UBEC ES for documents in a UBEC submission; UBEC reviewers assigned that component.
export async function GET(req: NextRequest) {
  try {
    const user = await getWorkspaceState(req); if (!user) return error('Sign in to download.', 401);
    const id = z.string().uuid().safeParse(req.nextUrl.searchParams.get('id')); if (!id.success) return error('Document not found.', 404);
    const db = getPostgres();
    const doc = (await db.query<{ name: string; media_type: string; content: Buffer; component: LineDocumentWorkstream; state_code: string; plan_id: number }>('SELECT d.name,d.media_type,d.content,d.component,p.state_code,p.id AS plan_id FROM activity_line_documents d JOIN action_plans p ON p.id=d.plan_id WHERE d.id=$1', [id.data])).rows[0];
    if (!doc) return error('Document not found.', 404);
    const inRound = `SELECT 1 FROM ubec_rounds r %JOIN% WHERE r.plan_id=$1 AND (r.snapshot->$2) @> jsonb_build_array(jsonb_build_object('documents', jsonb_build_array(jsonb_build_object('id', $3::text)))) %AND% LIMIT 1`;
    const allowed = doc.state_code === user.stateCode ? canViewComponent(user, doc.component)
      : user.role === 'UBEC Executive Secretary' ? Boolean((await db.query(inRound.replace('%JOIN%', '').replace('%AND%', ''), [doc.plan_id, doc.component, id.data])).rowCount)
      : user.role === 'UBEC Department Reviewer' ? Boolean((await db.query(inRound.replace('%JOIN%', 'JOIN ubec_assignments a ON a.round_id=r.id').replace('%AND%', 'AND a.department=$4 AND a.pillar=$2'), [doc.plan_id, doc.component, id.data, user.department])).rowCount)
      : false;
    if (!allowed) return error('Document not found.', 404);
    return new Response(new Uint8Array(doc.content), { headers: { 'Content-Type': doc.media_type, 'Content-Disposition': `attachment; filename="line-document"; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g, '%27')}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } });
  } catch (cause) { console.error(cause); return error('Unable to download.', 503); }
}
