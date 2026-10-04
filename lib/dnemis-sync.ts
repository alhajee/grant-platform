// DNEMIS -> School register sync. Imports PUBLIC pre-primary, primary and JSS schools (the two yearly census forms)
// for each state, with enrolment by class, facilities and teachers from the latest census year that has data.
// * Schools are matched on dnemis_id (DHIS2 org unit id); a hand-added school with the same school code is adopted.
// * Only DNEMIS fields are written; schools without dnemis_id (added by hand) are never changed. Town and
//   coordinates are kept. Schools that disappear from DNEMIS are reported, not deleted (plans may use them).
// * A Postgres advisory lock means runs never overlap; each real run is recorded in dnemis_sync_runs.
// * The access token is only ever passed to dhis2Fetch; nothing here logs or stores it.
import { Client } from 'pg';
import { DnemisError, dhis2Fetch, getDnemisConfig } from './dnemis';
import { censusForms, elementRole, statePrefix, summariseCensus, toSyncedSchool, type CensusForm, type DhisDataValue, type DhisOrgUnit, type ElementRole, type SchoolCensus, type SyncedSchool } from './dnemis-census';
import { invalidateSchoolLists } from './school-cache';
import { stateDisplayName } from './state-names';

export type SyncFetch = <T>(path: string, options?: { timeoutMs?: number; maxBytes?: number }) => Promise<T>;
export type SyncOptions = {
  /** Portal state codes (e.g. ['YO']); all DNEMIS states when omitted. */
  states?: string[];
  /** Census years to try, newest first; defaults to this year and the two before. */
  years?: number[];
  dryRun?: boolean;
  triggeredBy: string;
  /** A queued dnemis_sync_runs row to run (from the admin card or the schedule); otherwise a new row is recorded. */
  runId?: number;
  /** Replaces the DHIS2 client (tests). */
  fetchJson?: SyncFetch;
  connectionString?: string;
  log?: (message: string) => void;
  batchSize?: number;
  concurrency?: number;
  /** Accept state codes that are not Nigerian states (throwaway test states). */
  allowUnknownStates?: boolean;
};
export type StateResult = {
  state: string; found: number; imported: number; eccde: number; primary: number; jss: number;
  excluded: { private: number; closed: number }; created: number; updated: number; unchanged: number; missing: number;
  learners: { male: number; female: number }; withEnrolment: number; withFacilities: number; years: Record<string, number>;
  error?: string;
};
export type SyncSummary = {
  runId: number | null; ok: boolean; dryRun: boolean; created: number; updated: number; skipped: number;
  states: StateResult[]; requests: number; durationMs: number; message: string;
};

export class DnemisSyncBusyError extends Error {}
export class DnemisSyncConfigError extends Error {}

const lockKey = 'beapms:dnemis-sync';
const dataTimeoutMs = 90_000, dataMaxBytes = 40_000_000, metaMaxBytes = 20_000_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** DnemisError fields, matched by name so errors from another copy of lib/dnemis (tests, bundles) also count. */
const dnemisFailure = (cause: unknown) => cause instanceof Error && cause.name === 'DnemisError' ? cause as DnemisError : null;
const safeMessage = (cause: unknown) => (cause instanceof Error ? cause.message : 'Unexpected error').replace(/[^\x20-\x7e]/g, '').slice(0, 300);

function retrying(fetchJson: SyncFetch, onRequest: () => void): SyncFetch {
  return async <T,>(path: string, options?: { timeoutMs?: number; maxBytes?: number }) => {
    for (let attempt = 1; ; attempt++) {
      onRequest();
      try { return await fetchJson<T>(path, options); }
      catch (cause) {
        const failure = dnemisFailure(cause), status = failure?.status ?? 0;
        // invalid_url covers a failed DNS lookup of the DNEMIS host, which is usually transient.
        const retry = Boolean(failure && (['timeout', 'network', 'invalid_url'].includes(failure.kind) || status >= 500 || status === 429));
        if (!retry || attempt >= 3) throw cause;
        await sleep(attempt * 3000);
      }
    }
  };
}

async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

type Context = {
  fetch: SyncFetch; roles: Map<string, ElementRole>; combos: Map<string, string>;
  groups: { public: string; private: string; rural: string; urban: string };
  years: number[]; batchSize: number; concurrency: number; log: (message: string) => void;
};

async function loadCombos(ctx: Context, values: DhisDataValue[]) {
  const missing = [...new Set(values.map(value => value.categoryOptionCombo ?? '').filter(id => id && !ctx.combos.has(id)))];
  for (let index = 0; index < missing.length; index += 100) {
    const ids = missing.slice(index, index + 100);
    const body = await ctx.fetch<{ categoryOptionCombos?: { id: string; name: string }[] }>(`/api/categoryOptionCombos?filter=id:in:[${ids.join(',')}]&fields=id,name&paging=false`);
    for (const combo of body.categoryOptionCombos ?? []) ctx.combos.set(combo.id, combo.name);
    for (const id of ids) if (!ctx.combos.has(id)) ctx.combos.set(id, '');
  }
}

/** Census values for a batch of schools; a response that is too large is split in half and retried. */
async function fetchValues(ctx: Context, form: CensusForm, year: number, ids: string[]): Promise<DhisDataValue[]> {
  try {
    const query = ids.map(id => `orgUnit=${id}`).join('&');
    const body = await ctx.fetch<{ dataValues?: DhisDataValue[] }>(`/api/dataValueSets?dataSet=${censusForms[form]}&period=${year}&${query}`, { timeoutMs: dataTimeoutMs, maxBytes: dataMaxBytes });
    return (body.dataValues ?? []).filter(value => ctx.roles.has(value.dataElement));
  } catch (cause) {
    if (dnemisFailure(cause)?.status === 413 && ids.length > 1) {
      const half = Math.ceil(ids.length / 2);
      return [...await fetchValues(ctx, form, year, ids.slice(0, half)), ...await fetchValues(ctx, form, year, ids.slice(half))];
    }
    throw cause;
  }
}

/** Per school: the newest year with enrolment, else the newest year with any census values. */
async function fetchCensus(ctx: Context, form: CensusForm, units: DhisOrgUnit[]) {
  const chosen = new Map<string, { year: number; census: SchoolCensus }>();
  let remaining = units.map(unit => unit.id);
  for (const year of ctx.years) {
    if (!remaining.length) break;
    const batches = Array.from({ length: Math.ceil(remaining.length / ctx.batchSize) }, (_, index) => remaining.slice(index * ctx.batchSize, (index + 1) * ctx.batchSize));
    const values: DhisDataValue[] = [];
    await pool(batches, ctx.concurrency, async batch => { values.push(...await fetchValues(ctx, form, year, batch)); });
    await loadCombos(ctx, values);
    const bySchool = new Map<string, DhisDataValue[]>();
    for (const value of values) bySchool.set(value.orgUnit, [...(bySchool.get(value.orgUnit) ?? []), value]);
    for (const [id, schoolValues] of bySchool) {
      const census = summariseCensus(schoolValues, ctx.roles, ctx.combos);
      if (census.hasEnrolment || !chosen.has(id)) chosen.set(id, { year, census });
    }
    remaining = remaining.filter(id => !chosen.get(id)?.census.hasEnrolment);
  }
  return chosen;
}

async function stateSchools(ctx: Context, stateId: string) {
  const units: DhisOrgUnit[] = [];
  const forms = Object.values(censusForms).join(',');
  for (let page = 1; ; page++) {
    const body = await ctx.fetch<{ organisationUnits?: DhisOrgUnit[]; pager?: { pageCount?: number } }>(
      `/api/organisationUnits?filter=path:like:${stateId}&filter=level:eq:5&filter=dataSets.id:in:[${forms}]&fields=id,code,name,closedDate,parent[name,parent[name]],organisationUnitGroups[id],dataSets[id]&order=id:asc&pageSize=1000&page=${page}`,
      { timeoutMs: dataTimeoutMs, maxBytes: metaMaxBytes });
    units.push(...(body.organisationUnits ?? []));
    if (page >= (body.pager?.pageCount ?? 1)) break;
  }
  return units;
}

type ExistingRow = { id: number; dnemis_id: string | null; school_code: string | null; location: string };

/** Resolves school codes (unique per state) and locations against the register, and finds hand-added schools to adopt. */
function planWrites(records: SyncedSchool[], existing: ExistingRow[]) {
  const byDnemis = new Map(existing.filter(row => row.dnemis_id).map(row => [row.dnemis_id!, row]));
  const codeOwner = new Map(existing.filter(row => row.school_code).map(row => [row.school_code!, row]));
  const adopt: { id: number; dnemis_id: string }[] = [], seen = new Set<string>(), adopted = new Set<number>();
  const incoming = new Set(records.map(record => record.dnemisId));
  const rows = records.map(record => {
    let code = record.schoolCode, location = record.location ?? byDnemis.get(record.dnemisId)?.location;
    const owner = code ? codeOwner.get(code) : undefined;
    if (code && owner && owner.dnemis_id !== record.dnemisId) {
      if (!owner.dnemis_id && !byDnemis.has(record.dnemisId) && !adopted.has(owner.id)) {
        // A school added by hand with this DNEMIS code becomes the DNEMIS school.
        adopt.push({ id: owner.id, dnemis_id: record.dnemisId }); adopted.add(owner.id);
        location ??= owner.location;
      } else if (!owner.dnemis_id || !incoming.has(owner.dnemis_id)) code = null; // the code stays with its current school
      // Otherwise another DNEMIS school in this run holds the code now; writeState releases it first.
    }
    if (code && seen.has(code)) code = null; // DNEMIS listed the same code twice: the first school keeps it
    if (code) seen.add(code);
    return { ...record, schoolCode: code, location: location === 'Urban' ? 'Urban' : 'Rural' };
  });
  const created = rows.filter(row => !byDnemis.has(row.dnemisId) && !adopt.some(item => item.dnemis_id === row.dnemisId)).length;
  const missing = [...byDnemis.keys()].filter(id => !incoming.has(id)).length;
  return { rows, adopt, created, missing };
}

const upsertSql = `
  INSERT INTO schools (state_code, dnemis_id, school_code, name, town, lga, ward, level, category, location, enrolment_male, enrolment_female,
    enrolment_by_class, facilities, teachers, dnemis_year, dnemis_synced_at, updated_at, updated_by_name)
  SELECT $1, x.dnemis_id, x.school_code, x.name, '', x.lga, x.ward, x.level, 'Public', x.location, x.male, x.female,
    x.enrolment, x.facilities, x.teachers, x.year, NOW(), NOW(), 'DNEMIS sync'
  FROM jsonb_to_recordset($2::jsonb) AS x(dnemis_id text, school_code text, name text, lga text, ward text, level text, location text,
    male int, female int, enrolment jsonb, facilities jsonb, teachers jsonb, year int)
  ON CONFLICT (dnemis_id) DO UPDATE SET state_code = EXCLUDED.state_code, school_code = EXCLUDED.school_code, name = EXCLUDED.name,
    lga = EXCLUDED.lga, ward = EXCLUDED.ward, level = EXCLUDED.level, category = EXCLUDED.category, location = EXCLUDED.location,
    enrolment_male = EXCLUDED.enrolment_male, enrolment_female = EXCLUDED.enrolment_female, enrolment_by_class = EXCLUDED.enrolment_by_class,
    facilities = EXCLUDED.facilities, teachers = EXCLUDED.teachers, dnemis_year = EXCLUDED.dnemis_year,
    dnemis_synced_at = NOW(), updated_at = NOW(), updated_by_name = EXCLUDED.updated_by_name
  WHERE (schools.state_code, schools.school_code, schools.name, schools.lga, schools.ward, schools.level, schools.category, schools.location,
      schools.enrolment_male, schools.enrolment_female, schools.enrolment_by_class, schools.facilities, schools.teachers, schools.dnemis_year)
    IS DISTINCT FROM (EXCLUDED.state_code, EXCLUDED.school_code, EXCLUDED.name, EXCLUDED.lga, EXCLUDED.ward, EXCLUDED.level, EXCLUDED.category,
      EXCLUDED.location, EXCLUDED.enrolment_male, EXCLUDED.enrolment_female, EXCLUDED.enrolment_by_class, EXCLUDED.facilities, EXCLUDED.teachers, EXCLUDED.dnemis_year)
  RETURNING (xmax = 0) AS inserted`;

/** Writes one state's schools in a single transaction. */
async function writeState(db: Client, stateCode: string, records: SyncedSchool[], dryRun: boolean) {
  const existing = (await db.query<ExistingRow>(`SELECT id, dnemis_id, school_code, location FROM schools WHERE state_code = $1 AND (dnemis_id IS NOT NULL OR school_code IS NOT NULL)`, [stateCode])).rows;
  const plan = planWrites(records, existing);
  if (dryRun) return { created: plan.created, updated: 0, unchanged: records.length - plan.created, missing: plan.missing };
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`schools:${stateCode}`]);
    if (plan.adopt.length) await db.query(`UPDATE schools s SET dnemis_id = x.dnemis_id FROM jsonb_to_recordset($1::jsonb) AS x(id int, dnemis_id text) WHERE s.id = x.id AND s.dnemis_id IS NULL`, [JSON.stringify(plan.adopt)]);
    // Clear codes that move between schools first, so a swap never trips the per-state unique code index.
    const codes = plan.rows.map(row => ({ dnemis_id: row.dnemisId, school_code: row.schoolCode }));
    await db.query(`UPDATE schools s SET school_code = NULL FROM jsonb_to_recordset($1::jsonb) AS x(dnemis_id text, school_code text)
      WHERE s.dnemis_id = x.dnemis_id AND s.school_code IS DISTINCT FROM x.school_code AND s.school_code IS NOT NULL`, [JSON.stringify(codes)]);
    const payload = plan.rows.map(row => ({ dnemis_id: row.dnemisId, school_code: row.schoolCode, name: row.name, lga: row.lga, ward: row.ward, level: row.level,
      location: row.location, male: row.male, female: row.female, enrolment: row.enrolment, facilities: row.facilities, teachers: row.teachers, year: row.year }));
    const written = (await db.query<{ inserted: boolean }>(upsertSql, [stateCode, JSON.stringify(payload)])).rows;
    await db.query('UPDATE schools SET dnemis_synced_at = NOW() WHERE dnemis_id = ANY($1::text[])', [plan.rows.map(row => row.dnemisId)]);
    await db.query('COMMIT');
    const created = written.filter(row => row.inserted).length;
    return { created, updated: written.length - created, unchanged: records.length - written.length, missing: plan.missing };
  } catch (cause) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw cause;
  }
}

async function syncState(ctx: Context, db: Client, stateCode: string, stateId: string, dryRun: boolean): Promise<StateResult> {
  const result: StateResult = { state: stateCode, found: 0, imported: 0, eccde: 0, primary: 0, jss: 0, excluded: { private: 0, closed: 0 },
    created: 0, updated: 0, unchanged: 0, missing: 0, learners: { male: 0, female: 0 }, withEnrolment: 0, withFacilities: 0, years: {} };
  const units = await stateSchools(ctx, stateId);
  result.found = units.length;
  const now = Date.now(), byForm: Record<CensusForm, DhisOrgUnit[]> = { primary: [], jss: [] };
  for (const unit of units) {
    const groups = new Set((unit.organisationUnitGroups ?? []).map(group => group.id));
    if (!groups.has(ctx.groups.public) || groups.has(ctx.groups.private)) { result.excluded.private++; continue; }
    if (unit.closedDate && Date.parse(unit.closedDate) <= now) { result.excluded.closed++; continue; }
    const forms = new Set((unit.dataSets ?? []).map(set => set.id));
    // A school on both forms (rare) is listed once, as a primary school with its JSS classes added below.
    if (forms.has(censusForms.primary)) byForm.primary.push(unit); else if (forms.has(censusForms.jss)) byForm.jss.push(unit);
  }
  const records: SyncedSchool[] = [];
  for (const form of ['primary', 'jss'] as const) {
    if (!byForm[form].length) continue;
    const census = await fetchCensus(ctx, form, byForm[form]);
    for (const unit of byForm[form]) {
      const groups = new Set((unit.organisationUnitGroups ?? []).map(group => group.id));
      const location = groups.has(ctx.groups.urban) ? 'Urban' : groups.has(ctx.groups.rural) ? 'Rural' : null;
      const chosen = census.get(unit.id);
      records.push(toSyncedSchool(unit, form, chosen?.census ?? null, chosen?.year ?? null, location));
    }
  }
  for (const record of records) {
    result.imported++;
    result[record.level === 'ECCDE' ? 'eccde' : record.level === 'JSS' ? 'jss' : 'primary']++;
    result.learners.male += record.male; result.learners.female += record.female;
    if (record.male + record.female > 0) result.withEnrolment++;
    if (record.facilities) result.withFacilities++;
    const year = String(record.year ?? 'none');
    result.years[year] = (result.years[year] ?? 0) + 1;
  }
  return { ...result, ...await writeState(db, stateCode, records, dryRun) };
}

async function startRun(db: Client, runId: number | null, scope: string, triggeredBy: string) {
  if (runId) {
    const row = (await db.query<{ id: number }>(`UPDATE dnemis_sync_runs SET status = 'running', started_at = NOW(), message = 'Starting' WHERE id = $1 AND status = 'queued' RETURNING id`, [runId])).rows[0];
    if (!row) throw new DnemisSyncBusyError('This sync has already been started or cancelled.');
    return row.id;
  }
  try {
    return (await db.query<{ id: number }>(`INSERT INTO dnemis_sync_runs(status, scope, triggered_by, started_at, message) VALUES('running', $1, $2, NOW(), 'Starting') RETURNING id`, [scope, triggeredBy.slice(0, 120)])).rows[0].id;
  } catch (cause) {
    if ((cause as { code?: string }).code === '23505') throw new DnemisSyncBusyError('A DNEMIS sync is already queued or running.');
    throw cause;
  }
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-NG')} ${word}${n === 1 ? '' : 's'}`;
function describe(results: StateResult[], durationMs: number, dryRun: boolean) {
  const sum = (pick: (item: StateResult) => number) => results.reduce((total, item) => total + pick(item), 0);
  const failed = results.filter(item => item.error);
  const parts = [plural(results.length - failed.length, 'state'), plural(sum(item => item.imported), 'school'),
    dryRun ? `${sum(item => item.created).toLocaleString('en-NG')} would be new` : `${sum(item => item.created).toLocaleString('en-NG')} new`,
    ...(dryRun ? [] : [`${sum(item => item.updated).toLocaleString('en-NG')} updated`]), `${Math.max(1, Math.round(durationMs / 60000))} min`];
  const missing = sum(item => item.missing);
  return `${parts.join(' · ')}${missing ? ` · ${plural(missing, 'school')} no longer in DNEMIS (kept)` : ''}${failed.length ? ` · failed: ${failed.map(item => `${item.state} (${item.error})`).join('; ')}` : ''}`.slice(0, 1000);
}

/** Runs one sync. Throws DnemisSyncBusyError when another run holds the lock. */
export async function syncDnemisSchools(options: SyncOptions): Promise<SyncSummary> {
  const started = Date.now(), dryRun = Boolean(options.dryRun), log = options.log ?? (() => undefined);
  const wanted = options.states?.map(code => code.trim().toUpperCase()).filter(Boolean);
  if (wanted?.some(code => !/^[A-Z0-9]{2,24}$/.test(code))) throw new DnemisSyncConfigError('Use state codes such as YO or KN.');
  const db = new Client({ connectionString: options.connectionString ?? process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await db.connect();
  let runId: number | null = options.runId ?? null, finished = false, requests = 0;
  try {
    if (!(await db.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [lockKey])).rows[0].ok) {
      throw new DnemisSyncBusyError('Another DNEMIS sync is already running.');
    }
    const scope = wanted?.length ? wanted.join(',') : 'all';
    if (!dryRun) runId = await startRun(db, runId, scope, options.triggeredBy);
    let fetchJson = options.fetchJson;
    if (!fetchJson) {
      const config = await getDnemisConfig(db);
      if (!config?.token || !config.enabled) throw new DnemisSyncConfigError('Turn on the DNEMIS connection and save an access token first.');
      fetchJson = <T,>(path: string, init?: { timeoutMs?: number; maxBytes?: number }) => dhis2Fetch<T>(path, config, init);
    }
    const fetch = retrying(fetchJson, () => { requests++; });
    const groupList = (await fetch<{ organisationUnitGroups?: { id: string; name: string }[] }>('/api/organisationUnitGroups?filter=name:in:[Public,Private,Rural,Urban]&fields=id,name&paging=false')).organisationUnitGroups ?? [];
    const group = (name: string) => groupList.find(item => item.name === name)?.id ?? '';
    const groups = { public: group('Public'), private: group('Private'), rural: group('Rural'), urban: group('Urban') };
    if (!groups.public) throw new DnemisError('DNEMIS has no "Public" school group; the sync cannot tell public schools apart.', 'bad_response');
    const roles = new Map<string, ElementRole>();
    for (const id of Object.values(censusForms)) {
      const set = await fetch<{ dataSetElements?: { dataElement: { id: string; name: string } }[] }>(`/api/dataSets/${id}?fields=dataSetElements[dataElement[id,name]]`);
      for (const { dataElement } of set.dataSetElements ?? []) { const role = elementRole(dataElement.name); if (role) roles.set(dataElement.id, role); }
    }
    const year = new Date().getFullYear();
    const ctx: Context = { fetch, roles, combos: new Map(), groups, years: options.years?.length ? options.years : [year, year - 1, year - 2],
      batchSize: options.batchSize ?? 50, concurrency: options.concurrency ?? 4, log };
    const dhisStates = (await fetch<{ organisationUnits?: { id: string; name: string }[] }>('/api/organisationUnits?level=2&fields=id,name&paging=false')).organisationUnits ?? [];
    const byCode = new Map(dhisStates.map(unit => [statePrefix(unit.name), unit.id]));
    const known = (code: string) => options.allowUnknownStates || stateDisplayName(code) !== code;
    const codes = (wanted?.length ? wanted : [...byCode.keys()].filter(known)).sort();
    const results: StateResult[] = [];
    for (const [index, code] of codes.entries()) {
      const stateId = byCode.get(code);
      const empty: StateResult = { state: code, found: 0, imported: 0, eccde: 0, primary: 0, jss: 0, excluded: { private: 0, closed: 0 }, created: 0, updated: 0, unchanged: 0, missing: 0, learners: { male: 0, female: 0 }, withEnrolment: 0, withFacilities: 0, years: {} };
      if (!stateId || !known(code)) { results.push({ ...empty, error: 'not found in DNEMIS' }); continue; }
      const stateStarted = Date.now();
      try {
        const result = await syncState(ctx, db, code, stateId, dryRun);
        results.push(result);
        if (!dryRun && (result.created || result.updated)) await invalidateSchoolLists([code]);
        log(`${code}: ${result.imported} schools (${result.created} new, ${result.updated} updated) in ${Math.round((Date.now() - stateStarted) / 1000)} s`);
      } catch (cause) {
        if (dnemisFailure(cause)?.kind === 'unauthorised') throw cause;
        results.push({ ...empty, error: safeMessage(cause) });
        log(`${code}: failed: ${safeMessage(cause)}`);
      }
      if (runId) {
        const sum = (pick: (item: StateResult) => number) => results.reduce((total, item) => total + pick(item), 0);
        await db.query(`UPDATE dnemis_sync_runs SET schools_created = $2, schools_updated = $3, schools_skipped = $4, message = $5 WHERE id = $1`,
          [runId, sum(item => item.created), sum(item => item.updated), sum(item => item.unchanged), `Synced ${index + 1} of ${codes.length} states`]);
      }
    }
    const durationMs = Date.now() - started, sum = (pick: (item: StateResult) => number) => results.reduce((total, item) => total + pick(item), 0);
    const ok = results.every(item => !item.error), message = describe(results, durationMs, dryRun);
    if (runId) await db.query(`UPDATE dnemis_sync_runs SET status = $2, finished_at = NOW(), schools_created = $3, schools_updated = $4, schools_skipped = $5, message = $6 WHERE id = $1`,
      [runId, ok ? 'ok' : 'failed', sum(item => item.created), sum(item => item.updated), sum(item => item.unchanged), message]);
    finished = true;
    return { runId, ok, dryRun, created: sum(item => item.created), updated: sum(item => item.updated), skipped: sum(item => item.unchanged), states: results, requests, durationMs, message };
  } catch (cause) {
    if (runId && !finished) {
      await db.query(`UPDATE dnemis_sync_runs SET status = 'failed', finished_at = NOW(), message = $2 WHERE id = $1 AND status IN ('queued', 'running')`, [runId, safeMessage(cause)]).catch(() => undefined);
    }
    throw cause;
  } finally {
    await db.query('SELECT pg_advisory_unlock_all()').catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}
