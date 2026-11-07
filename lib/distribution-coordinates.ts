import type { QueryResult, QueryResultRow } from 'pg';
import { distributionSnapshotKeys } from './distribution-lists';
import type { Snapshot } from './plan-review';

type Db = { query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> };

/**
 * Distribution schools carry their coordinates (17 October 2026) so the workbook can show them on a map. Snapshots saved
 * before then have none, and coordinates are register data rather than plan data, so missing ones are read from the
 * School list when a plan is shown. Their DNEMIS school codes (UBEC246, the workbook download) are filled the same way.
 * Returns a new snapshot; the stored one is not changed.
 */
export async function withDistributionCoordinates(db: Db, snapshot: Snapshot): Promise<Snapshot> {
  const keys = Object.values(distributionSnapshotKeys);
  const missing = (school: { latitude?: string; code?: string | null }) => school.latitude === undefined || school.code === undefined;
  const ids = [...new Set(keys.flatMap(key => (snapshot[key] ?? []).filter(missing).map(school => school.id)))];
  if (!ids.length) return snapshot;
  const rows = (await db.query<{ id: number; latitude: string | null; longitude: string | null; code: string | null }>('SELECT id, latitude, longitude, school_code AS code FROM schools WHERE id = ANY($1::int[])', [ids])).rows;
  const found = new Map(rows.map(row => [row.id, row]));
  const filled = Object.fromEntries(keys.map(key => [key, (snapshot[key] ?? []).map(school => !missing(school) ? school : {
    ...school,
    ...(school.latitude === undefined ? { latitude: found.get(school.id)?.latitude ?? '', longitude: found.get(school.id)?.longitude ?? '' } : {}),
    ...(school.code === undefined ? { code: found.get(school.id)?.code ?? null } : {}),
  })]));
  return { ...snapshot, ...filled };
}
