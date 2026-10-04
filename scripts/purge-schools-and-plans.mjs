// Deletes ALL action plans (and everything that hangs off them) and ALL schools, so the School register can be
// rebuilt from DNEMIS. Keeps users, departments, sessions, funding policies, workflow settings, integration settings,
// construction types, DNEMIS sync history and schema_migrations.
//
// Usage:
//   node scripts/purge-schools-and-plans.mjs                  # shows what would be deleted, deletes nothing
//   node scripts/purge-schools-and-plans.mjs --yes            # deletes (local database only)
//   node scripts/purge-schools-and-plans.mjs --yes --production-confirmed   # any database: back it up first!
//
// The tables to clear are read from the foreign keys that point at action_plans and schools (so new plan tables are
// covered) plus the retired_* archives that hold plan ids without a foreign key. They are cleared with one TRUNCATE
// that has no CASCADE, in one transaction: if any other table still references them, PostgreSQL refuses and nothing
// is deleted. A protected table showing up among the dependents also stops the script.
// With REDIS_URL set it also clears the cached school lists.
import { Client } from 'pg';

const yes = process.argv.includes('--yes');
const productionConfirmed = process.argv.includes('--production-confirmed');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL is required.'); process.exit(1); }
const host = new URL(connectionString).hostname;
const local = ['localhost', '127.0.0.1', '::1'].includes(host);
if (!local && !productionConfirmed) {
  console.error(`Refusing to run against ${host}: pass --production-confirmed (after taking a backup) to purge a non-local database.`);
  process.exit(1);
}

const roots = ['action_plans', 'schools'];
const unlinkedPlanTables = ['retired_gscci_lines', 'retired_sbmc_lines'];
const protectedTables = new Set(['users', 'user_departments', 'sessions', 'funding_policies', 'state_workflow_settings', 'integration_settings',
  'schema_migrations', 'construction_types', 'dnemis_sync_runs', 'impersonation_requests', 'impersonation_sessions', 'user_management_events']);
const quote = name => `"${name.replaceAll('"', '""')}"`;

const db = new Client({ connectionString });
await db.connect();
try {
  await db.query('BEGIN');
  const existing = new Set((await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map(row => row.tablename));
  const tables = new Set(roots);
  for (let grew = true; grew;) {
    grew = false;
    const children = (await db.query(`SELECT DISTINCT c.conrelid::regclass::text AS child FROM pg_constraint c
      WHERE c.contype = 'f' AND c.confrelid::regclass::text = ANY($1::text[])`, [[...tables]])).rows.map(row => row.child.replace(/^public\./, '').replaceAll('"', ''));
    for (const child of children) if (!tables.has(child)) { tables.add(child); grew = true; }
  }
  for (const table of unlinkedPlanTables) if (existing.has(table)) tables.add(table);
  const blocked = [...tables].filter(table => protectedTables.has(table));
  if (blocked.length) throw new Error(`Protected tables reference plans or schools: ${blocked.join(', ')}. Review the schema before purging.`);

  const counts = [];
  for (const table of [...tables].sort()) counts.push([table, (await db.query(`SELECT COUNT(*)::int AS n FROM ${quote(table)}`)).rows[0].n]);
  const states = (await db.query('SELECT DISTINCT state_code FROM schools')).rows.map(row => row.state_code);
  console.log(`Database host: ${host}${local ? ' (local)' : ''}`);
  console.log('Rows that will be deleted:');
  for (const [table, n] of counts) console.log(`  ${table.padEnd(28)} ${n}`);
  const kept = ['users', 'funding_policies', 'state_workflow_settings', 'integration_settings', 'schema_migrations'].filter(table => existing.has(table));
  for (const table of kept) console.log(`  kept: ${table.padEnd(22)} ${(await db.query(`SELECT COUNT(*)::int AS n FROM ${quote(table)}`)).rows[0].n}`);
  if (!yes) {
    await db.query('ROLLBACK');
    console.log('\nNothing deleted. Run again with --yes to delete these rows.');
    process.exit(0);
  }

  await db.query(`TRUNCATE ${[...tables].map(quote).join(', ')}`);
  await db.query('COMMIT');
  console.log(`\nDeleted every plan and every school (${counts.reduce((sum, [, n]) => sum + n, 0)} rows).`);

  if (process.env.REDIS_URL) {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
      const pipeline = redis.pipeline();
      for (const state of states) pipeline.incr(`beapms:schools:${state}:version`);
      await pipeline.exec();
      redis.disconnect();
      console.log('Cleared the cached school lists.');
    } catch (cause) {
      console.error('Could not clear the cached school lists (they expire within an hour):', cause instanceof Error ? cause.message : cause);
    }
  }
} catch (cause) {
  await db.query('ROLLBACK').catch(() => undefined);
  console.error('Purge failed; nothing was deleted:', cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  await db.end();
}
