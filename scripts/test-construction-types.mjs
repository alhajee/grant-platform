// Construction types (app/api/construction-types, lib/construction-types.ts): naming and validation, sign-in and
// Physical Planning access, per-state uniqueness and concurrent creation. The old per-line infrastructure editor
// (/api/infrastructure, infrastructure_lines) was replaced by packages, see test-infrastructure-packages.mjs.
// Usage: node --env-file=.env scripts/test-construction-types.mjs [baseUrl]   (local only; throwaway states and users; cleans up)
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashSync } from "bcryptjs";
import { constructionTypeName, constructionTypeSchema } from "../lib/construction-types.ts";

const baseUrl = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? "http://localhost:5173";
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl), "Tests must target the local app.");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname), "Use a local database only.");
const marker = `CT${randomUUID().slice(0, 8).toUpperCase()}`;
const states = [marker, `${marker}B`];
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, userIds = [];
const shape = { classrooms: 2, playroomsLabs: 1, libraries: 1, toilets: 2, officesStores: 1, duration: 24, unitCost: 32000000.25 };

async function api(who, path, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${baseUrl}${path}`, { method,
    headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  return { status: response.status, body: data, response };
}

assert.equal(constructionTypeName(shape), "2 classrooms · 1 playroom/lab · 1 library · 2 toilets · 1 office/store");
assert.equal(constructionTypeSchema.safeParse({ ...shape, classrooms: -1 }).success, false);
assert.equal(constructionTypeSchema.safeParse({ ...shape, classrooms: 0.5 }).success, false);
assert.equal(constructionTypeSchema.safeParse({ ...shape, unitCost: 1.234 }).success, false);

await db.connect();
try {
  for (const [who, role, department, state] of [["physical", "Data Entry Staff", "physical", marker], ["academic", "Data Entry Staff", "academic", marker], ["foreign", "Data Entry Staff", "physical", states[1]]]) {
    const email = `${who}.${marker.toLowerCase()}@construction.test`;
    const id = (await db.query("INSERT INTO users (email, full_name, role, department, password_hash, state_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [email, `QA ${who}`, role, department, hashSync(password, 4), state])).rows[0].id;
    userIds.push(id);
    await db.query("INSERT INTO user_departments(user_id, department) VALUES ($1, $2)", [id, department]);
    const login = await api(who, "/api/auth/login", { email, password });
    assert.equal(login.status, 200);
    cookies[who] = login.response.headers.get("set-cookie").split(";")[0];
  }
  assert.equal((await api("anonymous", "/api/construction-types", shape)).status, 401);
  assert.equal((await api("academic", "/api/construction-types", shape)).status, 403, "Only Physical Planning staff create construction types");
  for (const invalid of [{ ...shape, classrooms: -1 }, { ...shape, classrooms: 1.5 }, { ...shape, classrooms: 0, playroomsLabs: 0, libraries: 0, toilets: 0, officesStores: 0 }, { ...shape, unitCost: 0 }, { ...shape, unitCost: 1.234 }, { ...shape, duration: 0 }]) {
    assert.equal((await api("physical", "/api/construction-types", invalid)).status, 400, JSON.stringify(invalid));
  }
  const created = await api("physical", "/api/construction-types", shape);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const type = created.body.constructionType;
  assert.equal(type.name, constructionTypeName(shape));
  const duplicate = await api("physical", "/api/construction-types", { ...shape, unitCost: 1 });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.constructionType.id, type.id);
  assert.equal(duplicate.body.constructionType.unitCost, shape.unitCost, "A duplicate returns the saved type unchanged");
  const foreign = await api("foreign", "/api/construction-types", shape);
  assert.equal(foreign.status, 201, "Types are unique per state, not nationally");
  assert.notEqual(foreign.body.constructionType.id, type.id);
  const simultaneous = await Promise.all([api("physical", "/api/construction-types", { ...shape, classrooms: 3 }), api("physical", "/api/construction-types", { ...shape, classrooms: 3 })]);
  assert.deepEqual(simultaneous.map((result) => result.status).sort(), [201, 409]);
  assert.equal(Number((await db.query("SELECT COUNT(*) FROM construction_types WHERE state_code = $1", [marker])).rows[0].count), 2);
  console.log("PASS: naming and validation, sign-in and Physical Planning access, per-state uniqueness, duplicate and concurrent creation.");
} finally {
  await db.query("DELETE FROM construction_types WHERE state_code = ANY($1::text[])", [states]);
  if (userIds.length) {
    await db.query("DELETE FROM sessions WHERE user_id = ANY($1::int[])", [userIds]);
    await db.query("DELETE FROM users WHERE id = ANY($1::int[])", [userIds]);
  }
  await db.end();
}
