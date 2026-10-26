#!/usr/bin/env node
// Runs every scripts/test-*.mjs one after another (they share one local database).
// Usage: node scripts/run-tests.mjs [baseUrl] [--only=name,name] [--env-file=path]
// Base URL: argv, else TEST_BASE_URL / UBEC_TEST_URL, else http://localhost:5173.
// Env file: --env-file, else TEST_ENV_FILE, else the repository's .env (when present).
// "Full use of allocations" (Super Admin setting) is switched off while the suite runs and restored afterwards.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptsDir, '..');
const TIMEOUT_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const positional = args.filter((arg) => !arg.startsWith('--'));
const base = positional[0] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? 'http://localhost:5173';
const envFile = option('env-file') ?? process.env.TEST_ENV_FILE ?? resolve(root, '.env');
const only = option('only')?.split(',').map((name) => name.trim().replace(/^test-|\.mjs$/g, '')).filter(Boolean);

const tests = readdirSync(scriptsDir)
  .filter((name) => /^test-.+\.mjs$/.test(name))
  .filter((name) => !only || only.includes(name.replace(/^test-|\.mjs$/g, '')))
  .sort();

if (!tests.length) {
  console.error('No test scripts matched.');
  process.exit(1);
}

function runOne(name) {
  const nodeArgs = [...(existsSync(envFile) ? [`--env-file=${envFile}`] : []), resolve(scriptsDir, name), base];
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(process.execPath, nodeArgs, {
      cwd: root,
      env: { ...process.env, TEST_BASE_URL: base, UBEC_TEST_URL: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => { output += `\nTimed out after ${TIMEOUT_MS / 1000}s`; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ name, ok: code === 0, seconds: (Date.now() - started) / 1000, output });
    });
  });
}

// Most tests send components with a few small lines, so the suite runs with "Full use of allocations" (UBEC79, migration
// 076) off and restores it afterwards; scripts/test-full-allocation.mjs turns it on for its own run.
const { Client } = await import('pg');
if (existsSync(envFile) && !process.env.DATABASE_URL) process.loadEnvFile(envFile);
const settingsDb = process.env.DATABASE_URL ? new Client({ connectionString: process.env.DATABASE_URL }) : null;
let fullAllocation = null;
if (settingsDb) {
  await settingsDb.connect();
  fullAllocation = (await settingsDb.query("SELECT full_allocation_required AS v FROM state_workflow_settings WHERE state_code='GLOBAL'").catch(() => ({ rows: [] }))).rows[0]?.v ?? null;
  if (fullAllocation !== null) await settingsDb.query("UPDATE state_workflow_settings SET full_allocation_required=FALSE WHERE state_code='GLOBAL'");
}
const restore = async () => { if (settingsDb && fullAllocation !== null) await settingsDb.query("UPDATE state_workflow_settings SET full_allocation_required=$1 WHERE state_code='GLOBAL'", [fullAllocation]); await settingsDb?.end(); };
process.once('SIGINT', () => { void restore().finally(() => process.exit(130)); });

console.log(`Running ${tests.length} test scripts against ${base}${existsSync(envFile) ? '' : ' (no env file found)'}\n`);
const results = [];
for (const name of tests) {
  const result = await runOne(name);
  results.push(result);
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${name}  (${result.seconds.toFixed(1)}s)`);
  if (!result.ok) console.log(result.output.trim().split('\n').slice(-25).map((line) => `      ${line}`).join('\n'));
}

await restore();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed of ${results.length}`);
if (failed.length) console.log(`Failed: ${failed.map((result) => result.name).join(', ')}`);
process.exit(failed.length ? 1 : 0);
