import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPostgres } from '@/lib/postgres';
import { getAuthenticatedUser } from '@/lib/workspace-state';
import { isSameRequestOrigin } from '@/lib/request-origin';
import { approvalLetter } from '@/lib/approval-letter';
import { approvalLetterPdf } from '@/lib/approval-letter-pdf';
import { letterAssetKinds, letterImageMime, maxLetterAssetBytes, readCurrentLetterImages, readLetterAssetInfo } from '@/lib/letter-assets-db';
import type { Snapshot } from '@/lib/plan-review';

// Super Admin: the approval letter's letterhead and signature (migration 105). GET lists uploads (`?id=` returns one
// image, `?preview=1` a sample letter with the images in force); POST (multipart kind, file) adds one, which is in force
// for letters approved from then on; DELETE `{ id }` takes one out of use (letters that pinned it keep it).
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const kindSchema = z.enum(letterAssetKinds);

async function requireAdmin(request: NextRequest) {
  const actor = await getAuthenticatedUser(request);
  return actor?.role === 'Super Admin' ? actor : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required' }, 403);
    const db = getPostgres(), params = request.nextUrl.searchParams;
    const id = Number(params.get('id'));
    if (params.get('id') !== null) {
      if (!Number.isInteger(id) || id < 1) return json({ error: 'Image not found' }, 404);
      const row = (await db.query<{ content: Buffer; mime: string }>('SELECT content,mime FROM letter_assets WHERE id=$1', [id])).rows[0];
      if (!row) return json({ error: 'Image not found' }, 404);
      return new NextResponse(new Uint8Array(row.content), { headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (params.get('preview') === '1') {
      const snapshot = { setup: {}, infrastructure: [], tlm: [] } as unknown as Snapshot;
      const letter = approvalLetter({ stateCode: 'FC', planYear: new Date().getFullYear(), quarters: [1, 2, 3, 4], snapshot, year: new Date().getFullYear(), serial: 1, issuedAt: new Date() });
      const pdf = await approvalLetterPdf(letter, await readCurrentLetterImages(db));
      return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Sample approval letter.pdf"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return json({ assets: await readLetterAssetInfo(db) });
  } catch (cause) {
    console.error('Letter images could not be loaded', cause);
    return json({ error: 'Unable to load the approval letter images' }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    const actor = await requireAdmin(request);
    if (!actor) return json({ error: 'Super-admin access required' }, 403);
    const form = await request.formData().catch(() => null);
    const kind = kindSchema.safeParse(form?.get('kind'));
    const file = form?.get('file');
    if (!kind.success) return json({ error: 'Choose the letterhead or the signature' }, 400);
    if (!(file instanceof File) || !file.size) return json({ error: 'Choose an image to upload' }, 400);
    if (file.size > maxLetterAssetBytes) return json({ error: 'The image must be 3 MB or smaller' }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = letterImageMime(bytes);
    if (!mime) return json({ error: 'Upload a PNG or JPEG image' }, 400);
    if (kind.data === 'signature' && mime !== 'image/png') return json({ error: 'Upload the signature as a PNG with a transparent background, so it sits on the letter cleanly' }, 400);
    const name = file.name.replace(/[^\w .()-]+/g, '').slice(0, 120) || `${kind.data}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    const id = (await getPostgres().query<{ id: number }>('INSERT INTO letter_assets(kind,content,mime,name,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id', [kind.data, Buffer.from(bytes), mime, name, actor.userId])).rows[0].id;
    return json({ id, assets: await readLetterAssetInfo(getPostgres()) }, 201);
  } catch (cause) {
    console.error('Letter image could not be saved', cause);
    return json({ error: 'Unable to save the image' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameRequestOrigin(request)) return json({ error: 'This action must come from the portal' }, 403);
    if (!await requireAdmin(request)) return json({ error: 'Super-admin access required' }, 403);
    const parsed = z.object({ id: z.number().int().positive() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose the image to remove' }, 400);
    const removed = await getPostgres().query('UPDATE letter_assets SET removed_at=NOW() WHERE id=$1 AND removed_at IS NULL', [parsed.data.id]);
    if (!removed.rowCount) return json({ error: 'Image not found' }, 404);
    return json({ assets: await readLetterAssetInfo(getPostgres()) });
  } catch (cause) {
    console.error('Letter image could not be removed', cause);
    return json({ error: 'Unable to remove the image' }, 503);
  }
}
