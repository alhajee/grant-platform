import type { QueryResult, QueryResultRow } from 'pg';
import type { LetterImage, LetterImages } from './approval-letter-pdf';

// The approval letter's letterhead and signature uploaded by the Super Admin (migration 105, Admin > Settings >
// Approval letter). Every upload is kept; the newest per kind is in force; each letter pins its own (lib/approval-letter-db.ts).
// Without an upload the letter uses the built-in images (lib/letters/letterhead-assets.ts).
type Db = { query<R extends QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>> };
export const letterAssetKinds = ['letterhead', 'signature'] as const;
export type LetterAssetKind = typeof letterAssetKinds[number];
export const maxLetterAssetBytes = 3 * 1024 * 1024;

/** The image type from the file's first bytes (JPEG or PNG only), whatever its name says. */
export function letterImageMime(bytes: Uint8Array): LetterImage['mime'] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

type Row = { id: number; kind: LetterAssetKind; content: Buffer; mime: LetterImage['mime'] };
const toImage = (row: Row | undefined): LetterImage | null => row ? { content: new Uint8Array(row.content), mime: row.mime } : null;

/** The images in force now (for a preview, or a letter issued before migration 105 pinned nothing). */
export async function readCurrentLetterImages(db: Db): Promise<LetterImages & { ids: { letterhead: number | null; signature: number | null } }> {
  const rows = (await db.query<Row>(`SELECT DISTINCT ON (kind) id,kind,content,mime FROM letter_assets WHERE removed_at IS NULL ORDER BY kind, created_at DESC, id DESC`)).rows;
  const find = (kind: LetterAssetKind) => rows.find(r => r.kind === kind);
  return { letterhead: toImage(find('letterhead')), signature: toImage(find('signature')), ids: { letterhead: find('letterhead')?.id ?? null, signature: find('signature')?.id ?? null } };
}

/** The images a letter pinned when it was issued (NULL ids = the built-in ones). */
export async function readPinnedLetterImages(db: Db, ids: { letterhead: number | null; signature: number | null }): Promise<LetterImages> {
  const wanted = [ids.letterhead, ids.signature].filter((id): id is number => id !== null);
  if (!wanted.length) return {};
  const rows = (await db.query<Row>('SELECT id,kind,content,mime FROM letter_assets WHERE id=ANY($1::int[])', [wanted])).rows;
  return { letterhead: toImage(rows.find(r => r.id === ids.letterhead)), signature: toImage(rows.find(r => r.id === ids.signature)) };
}

export type LetterAssetInfo = { id: number; kind: LetterAssetKind; name: string; size: number; createdAt: string; createdBy: string | null; current: boolean };
/** Upload history, newest first, marking those in force. */
export async function readLetterAssetInfo(db: Db): Promise<LetterAssetInfo[]> {
  const rows = (await db.query<{ id: number; kind: LetterAssetKind; name: string; size: number; created_at: Date; created_by: string | null; removed_at: Date | null }>(
    `SELECT a.id,a.kind,a.name,octet_length(a.content) AS size,a.created_at,a.removed_at,u.full_name AS created_by
     FROM letter_assets a LEFT JOIN users u ON u.id=a.created_by ORDER BY a.created_at DESC, a.id DESC LIMIT 40`)).rows;
  const current = new Set<number>();
  for (const kind of letterAssetKinds) { const first = rows.find(r => r.kind === kind && !r.removed_at); if (first) current.add(first.id); }
  return rows.filter(r => !r.removed_at).map(r => ({ id: r.id, kind: r.kind, name: r.name, size: Number(r.size), createdAt: new Date(r.created_at).toISOString(), createdBy: r.created_by, current: current.has(r.id) }));
}
