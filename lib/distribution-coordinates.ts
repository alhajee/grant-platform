import type { QueryResult, QueryResultRow } from 'pg';
import { distributionSnapshotKeys } from './distribution-lists';
import type { Snapshot } from './plan-review';

type Db = { query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> };

/**
 * Distribution schools carry their coordinates (17 October 2026) so the workbook can show them on a map. Snapshots saved
 * before then have none, and coordinates are register data rather than plan data, so missing ones are read from the
 * School list when a plan is shown. Returns a new snapshot; the stored one is not changed.
 */
export async function withDistributionCoordinates(db: Db, snapshot: Snapshot): Promise<Snapshot> {
  const keys = Object.values(distributionSnapshotKeys);
  const ids = [...new Set(keys.flatMap(key => (snapshot[key] ?? []).filter(school => school.latitude === undefined).map(school => school.id)))];
  if (!ids.length) return snapshot;
  const rows = (await db.query<{ id: number; latitude: string | null; longitude: string | null }>('SELECT id, latitude, longitude FROM schools WHERE id = ANY($1::int[])', [ids])).rows;
  const found = new Map(rows.map(row => [row.id, row]));
  const filled = Object.fromEntries(keys.map(key => [key, (snapshot[key] ?? []).map(school => school.latitude !== undefined ? school
    : { ...school, latitude: found.get(school.id)?.latitude ?? '', longitude: found.get(school.id)?.longitude ?? '' })]));
  return { ...snapshot, ...filled };
}
