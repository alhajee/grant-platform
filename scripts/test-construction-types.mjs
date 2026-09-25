import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashSync } from "bcryptjs";
import { constructionTypeName, constructionTypeSchema } from "../lib/construction-types.ts";

const baseUrl = process.env.UBEC_TEST_URL ?? "http://localhost:5174";
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl), "Tests must target the local app.");
const marker = `QA-${randomUUID()}`;
const email = `${marker.toLowerCase()}@ubec.test`;
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
let cookie;
const shape = { classrooms: 2, playroomsLabs: 1, libraries: 1, toilets: 2, officesStores: 1, duration: 24, unitCost: 32000000.25 };

async function api(path, body, method = body ? "POST" : "GET", authenticated = true) {
  const response = await fetch(`${baseUrl}${path}`, { method,
    headers: { "Content-Type": "application/json", ...(authenticated && cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json(), response };
}

await db.connect();
try {
  assert.equal(constructionTypeName(shape), "2 classrooms · 1 playroom/lab · 1 library · 2 toilets · 1 office/store");
  assert.equal(constructionTypeSchema.safeParse({ ...shape, classrooms: -1 }).success, false);
  assert.equal(constructionTypeSchema.safeParse({ ...shape, classrooms: 0.5 }).success, false);
  assert.equal(constructionTypeSchema.safeParse({ ...shape, unitCost: 1.234 }).success, false);
  const before = await db.query("SELECT COUNT(*)::int AS count, SUM(unit_cost * quantity)::text AS total FROM infrastructure_lines");
  await db.query("INSERT INTO users (email, full_name, role, password_hash, state_code) VALUES ($1, 'Construction QA', 'Data Entry Officer', $2, $3)", [email, hashSync(password, 4), marker]);
  const schools = await db.query("INSERT INTO schools (name, lga, level, location, state_code) VALUES ($1, 'QA', 'Primary', 'Urban', $3), ($2, 'QA', 'Primary', 'Rural', $3) RETURNING id", [`${marker}-A`, `${marker}-B`, marker]);
  const login = await api("/api/auth/login", { email, password }, "POST", false);
  assert.equal(login.status, 200);
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await api("/api/plans", { startYear: 2025, endYear: 2025 })).status, 201);
  assert.equal((await api("/api/infrastructure", undefined, "GET", false)).status, 401);
  assert.equal((await api("/api/beap", undefined, "GET", false)).status, 401);
  assert.deepEqual((await api("/api/beap")).body.infrastructure, { lineCount: 0, schoolCount: 0, budget: 0 }, "The pillar overview must only include this state's saved plan.");
  assert.equal((await api("/api/construction-types", shape, "POST", false)).status, 401);
  const empty = await api("/api/infrastructure");
  assert.equal(empty.body.schools.length, 2);
  assert.equal(empty.body.constructionTypes.length, 0);
  assert.equal(empty.body.lines.length, 0);
  for (const invalid of [{ ...shape, classrooms: -1 }, { ...shape, classrooms: 1.5 }, { ...shape, classrooms: 0, playroomsLabs: 0, libraries: 0, toilets: 0, officesStores: 0 }, { ...shape, unitCost: 0 }, { ...shape, unitCost: 1.234 }, { ...shape, duration: 0 }]) {
    assert.equal((await api("/api/construction-types", invalid)).status, 400);
  }
  const created = await api("/api/construction-types", shape);
  assert.equal(created.status, 201);
  const type = created.body.constructionType;
  assert.equal(type.name, constructionTypeName(shape));
  const duplicate = await api("/api/construction-types", { ...shape, unitCost: 1 });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.constructionType.id, type.id);
  assert.equal(duplicate.body.constructionType.unitCost, shape.unitCost);
  const simultaneous = await Promise.all([api("/api/construction-types", { ...shape, classrooms: 3 }), api("/api/construction-types", { ...shape, classrooms: 3 })]);
  assert.deepEqual(simultaneous.map((result) => result.status).sort(), [201, 409]);
  const common = { schoolId: schools.rows[0].id, projectType: type.id, quantity: 1, strategy: "NCB" };
  assert.equal((await api("/api/infrastructure", { ...common, projectType: "six-classrooms" })).status, 400);
  const foreignSchool = (await db.query("SELECT id FROM schools WHERE state_code <> $1 LIMIT 1", [marker])).rows[0];
  if (foreignSchool) assert.equal((await api("/api/infrastructure", { ...common, schoolId: foreignSchool.id })).status, 400);
  const defaultLine = await api("/api/infrastructure", common);
  assert.equal(defaultLine.status, 201);
  const override = await api("/api/infrastructure", { ...common, schoolId: schools.rows[1].id, quantity: 2, duration: 30, unitCost: 35000000.5 });
  assert.equal(override.status, 201);
  let saved = (await api("/api/infrastructure")).body;
  const overview = await api("/api/beap");
  assert.equal(overview.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(overview.body.infrastructure, { lineCount: 2, schoolCount: 2, budget: 102000001.25 });
  assert.equal(saved.lines.find((line) => line.id === defaultLine.body.id).unitCost, shape.unitCost);
  assert.equal(saved.lines.find((line) => line.id === defaultLine.body.id).duration, shape.duration);
  assert.equal(saved.lines.find((line) => line.id === override.body.id).unitCost, 35000000.5);
  assert.equal(saved.lines.find((line) => line.id === override.body.id).duration, 30);
  assert.equal(saved.constructionTypes.find((entry) => entry.id === type.id).unitCost, shape.unitCost);
  assert.equal((await api("/api/infrastructure", { ...common, action: "update", id: override.body.id, duration: 32, unitCost: 36000000.75 })).status, 200);
  saved = (await api("/api/infrastructure")).body;
  assert.equal(saved.lines.find((line) => line.id === override.body.id).unitCost, 36000000.75);
  assert.equal(saved.lines.find((line) => line.id === defaultLine.body.id).unitCost, shape.unitCost);
  assert.equal(saved.constructionTypes.find((entry) => entry.id === type.id).duration, shape.duration);
  assert.deepEqual((await api("/api/beap")).body.infrastructure, { lineCount: 2, schoolCount: 1, budget: 68000001 }, "The overview must reflect edited amounts and quantities, and count each school once.");
  assert.equal((await api("/api/infrastructure", { action: "delete", id: override.body.id })).status, 200);
  await db.query("DELETE FROM infrastructure_lines WHERE school_id IN (SELECT id FROM schools WHERE state_code = $1)", [marker]);
  const after = await db.query("SELECT COUNT(*)::int AS count, SUM(unit_cost * quantity)::text AS total FROM infrastructure_lines");
  assert.deepEqual(after.rows, before.rows, "Existing plan lines and budget must be unchanged.");
  console.log("PASS: validation, naming, state isolation, persistence, duplicate/concurrent creation, defaults, school overrides, editing, BEAP overview totals, and unchanged existing plan.");
} finally {
  await db.query("DELETE FROM infrastructure_lines WHERE school_id IN (SELECT id FROM schools WHERE state_code = $1)", [marker]);
  await db.query("DELETE FROM construction_types WHERE state_code = $1", [marker]);
  await db.query("DELETE FROM action_plans WHERE state_code = $1", [marker]);
  await db.query("DELETE FROM schools WHERE state_code = $1", [marker]);
  await db.query("DELETE FROM users WHERE email = $1", [email]);
  await db.end();
}
