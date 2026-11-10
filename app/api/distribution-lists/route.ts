import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceState } from '@/lib/workspace-state';
import { resolveActionPlan } from '@/lib/plan-workspace';
import { getPostgres } from '@/lib/postgres';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { canViewComponent } from '@/lib/subeb-access';
import { notSentYetMessage, readStageVisibility } from '@/lib/stage-visibility';
import { mayEditPillar, readPillarReviews } from '@/lib/pillar-review';
import { stateDisplayName } from '@/lib/state-names';
import { matchUploadRows, uploadListComponent, uploadListNames, uploadListWorkstreams, type UploadListWorkstream, type UploadSchool } from '@/lib/distribution-upload';
import { buildListTemplate, ListUploadError, readListRows } from '@/lib/distribution-upload-xlsx';

// UBEC248: a school list template (DNEMIS code + School name) for the TLM, Curriculum and Greening distribution lists and
// the PHE training schools. GET downloads it, prefilled with the listed schools; POST reads a filled one and returns the
// preview (nothing is saved here). The editor then adds the matched schools through the usual bulk add, which takes the
// plan lock and skips schools already listed.
const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const maxBytes = 5 * 1024 * 1024;

async function context(request: NextRequest, workstream: string | null) {
  const user = await getWorkspaceState(request);
  if (!user) return { problem: error('Sign in to continue', 401) };
  const plan = await resolveActionPlan(request, user.stateCode);
  if (!plan) return { problem: error('Plan not found', 404) };
  const parsed = z.enum(uploadListWorkstreams).safeParse(workstream);
  if (!parsed.success) return { problem: error('Choose a school list') };
  const component = uploadListComponent(parsed.data);
  if (!canViewComponent(user, component)) return { problem: error('This component belongs to another department', 403) };
  const db = getPostgres();
  if (!(await readStageVisibility(db, user, plan.id)).includes(component)) return { problem: error(notSentYetMessage, 403) };
  return { user, plan, db, workstream: parsed.data as UploadListWorkstream, component };
}

const listedSchools = (db: ReturnType<typeof getPostgres>, planId: number, workstream: string, stateCode: string) =>
  db.query<{ id: number; code: string | null; name: string; lga: string }>('SELECT s.id,s.school_code AS code,s.name,s.lga FROM tlm_distribution d JOIN schools s ON s.id=d.school_id WHERE d.plan_id=$1 AND d.workstream=$2 AND s.state_code=$3 ORDER BY s.name', [planId, workstream, stateCode]);

export async function GET(request: NextRequest) {
  try {
    const found = await context(request, request.nextUrl.searchParams.get('workstream'));
    if ('problem' in found) return found.problem;
    const { user, plan, db, workstream } = found;
    const listed = (await listedSchools(db, plan.id, workstream, user.stateCode)).rows;
    const title = `${stateDisplayName(user.stateCode)} · ${uploadListNames[workstream]}`;
    const bytes = await buildListTemplate(title, listed);
    const filename = `${uploadListNames[workstream].replace(/[^A-Za-z0-9]+/g, '-')}-template.xlsx`;
    return new Response(bytes, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  } catch (cause) {
    console.error('School list template failed', cause);
    return error('The template could not be prepared. Please try again', 503);
  }
}

async function uploadedFile(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new ListUploadError('Attach the filled school list');
  if (Number(request.headers.get('content-length')) > maxBytes + 64 * 1024) throw new ListUploadError('The file must be no larger than 5 MB');
  let form: FormData;
  try { form = await request.formData(); } catch { throw new ListUploadError('The upload could not be read. Choose the file again'); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) throw new ListUploadError('Attach the filled school list');
  if (file.size > maxBytes) throw new ListUploadError('The file must be no larger than 5 MB');
  if (!/\.xlsx$/i.test(file.name)) throw new ListUploadError('Upload the school list as an Excel (.xlsx) file');
  const bytes = await file.arrayBuffer();
  if (new Uint8Array(bytes.slice(0, 4)).join(',') !== '80,75,3,4') throw new ListUploadError('Upload the school list as an Excel (.xlsx) file');
  return { bytes, workstream: form.get('workstream') };
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return error('This action must come from the portal', 403);
    const { bytes, workstream } = await uploadedFile(request);
    const found = await context(request, typeof workstream === 'string' ? workstream : null);
    if ('problem' in found) return found.problem;
    const { user, plan, db, component } = found;
    if (!mayEditPillar(user.role, user.departments ?? user.department, component, plan.status, await readPillarReviews(db, plan.id))) return error('You cannot change this list at its current stage', 403);
    const rows = await readListRows(bytes);
    const schools = (await db.query<UploadSchool>("SELECT id,name,school_code AS code,lga,level FROM schools WHERE state_code=$1 AND school_code IS NOT NULL AND school_code<>''", [user.stateCode])).rows;
    const listed = new Set((await listedSchools(db, plan.id, found.workstream, user.stateCode)).rows.map(s => s.id));
    return NextResponse.json({ rows: rows.length, ...matchUploadRows(rows, schools, listed) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    if (cause instanceof ListUploadError) return error(cause.message);
    console.error('School list upload failed', cause);
    return error('The school list could not be read. Please try again', 503);
  }
}
