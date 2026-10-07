import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashSync } from "bcryptjs";
import { sportsAllocationSchema, sportsLineSchema, sportsLineTotal, sportsBudget } from "../lib/sports.ts";

const baseUrl = process.env.UBEC_TEST_URL ?? "http://localhost:5174";
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl), "Tests must target the local app.");
const marker = `SPORTS-QA-${randomUUID()}`;
const foreignMarker = `${marker}-OTHER`;
const email = `${marker.toLowerCase()}@ubec.test`;
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
let cookie;
async function api(body, authenticated = true, path = "/api/sports") {
  const response = await fetch(`${baseUrl}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(authenticated && cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json(), response };
}
const budget = { entity: "budget", action: "create", section: "equipment", activityType: "Children's football", description: "Training balls", quantity: 10, unitCost: 12500.25 };
const allocate = { entity: "allocation", action: "create", quantity: 3, longitude: "11.04", latitude: "12.87" };

await db.connect();
try {
  assert.equal(sportsLineTotal({ quantity: 3, unitCost: 0.1 }), 0.3);
  assert.equal(sportsBudget([{ quantity: 3, unitCost: 0.1 }, { quantity: 2, unitCost: 0.2 }]), 0.7);
  for (const change of [{ quantity: 0 }, { quantity: 1.5 }, { unitCost: 0 }, { unitCost: 1.234 }, { quantity: 1000000, unitCost: 999999999999.99 }, { activityType: " " }, { description: " " }, { section: "invalid" }]) {
    assert.equal(sportsLineSchema.safeParse({ ...budget, ...change }).success, false);
  }
  assert.equal(sportsAllocationSchema.safeParse({ ...allocate, lineId: 1, schoolId: 1, longitude: "181" }).success, false);
  assert.equal(sportsAllocationSchema.safeParse({ ...allocate, lineId: 1, schoolId: 1, latitude: "-91" }).success, false);
  const original = (await db.query("SELECT id, row_to_json(line)::text AS snapshot FROM infrastructure_lines line ORDER BY id")).rows;
  const userId = (await db.query("INSERT INTO users (email, full_name, role, department, password_hash, state_code) VALUES ($1, 'Sports QA', 'Data Entry Staff', 'academic', $2, $3) RETURNING id", [email, hashSync(password, 4), marker])).rows[0].id;
  await db.query("INSERT INTO user_departments (user_id, department) VALUES ($1, 'academic')", [userId]);
  const schools = (await db.query("INSERT INTO schools (name, lga, level, location, state_code) VALUES ($1, 'QA', 'Primary', 'Urban', $3), ($2, 'QA', 'Primary', 'Rural', $3) RETURNING id", [`${marker}-A`, `${marker}-B`, marker])).rows;
  const foreignSchool = (await db.query("INSERT INTO schools (name, lga, level, location, state_code) VALUES ($1, 'QA', 'Primary', 'Rural', $2) RETURNING id", [foreignMarker, foreignMarker])).rows[0].id;
  const foreignPlan = (await db.query("INSERT INTO action_plans (state_code, start_year, end_year) VALUES ($1, 2025, 2025) RETURNING id", [foreignMarker])).rows[0].id;
  const foreignLine = (await db.query("INSERT INTO sports_budget_lines (state_code, code, section, activity_type, description, quantity, unit_cost, plan_id) VALUES ($1, $2, 'equipment', 'Other sport', 'Other item', 100, 20, $3) RETURNING id", [foreignMarker, foreignMarker, foreignPlan])).rows[0].id;
  const login = await api({ email, password }, false, "/api/auth/login");
  assert.equal(login.status, 200);
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  await db.query("INSERT INTO action_plans (state_code, start_year, end_year) VALUES ($1, 2025, 2025)", [marker]);
  assert.equal((await api(undefined, false)).status, 401);
  assert.equal((await api(budget, false)).status, 401);
  assert.equal((await api(allocate, false)).status, 401);
  let empty = await api();
  assert.equal(empty.response.headers.get("cache-control"), "no-store");
  assert.equal(empty.body.lines.length, 0);
  assert.equal(empty.body.allocations.length, 0);
  assert.equal(empty.body.schools.length, 2);
  for (const change of [{ quantity: -1 }, { unitCost: 1.234 }, { section: "unknown" }, { id: foreignLine }, { description: " " }]) assert.equal((await api({ ...budget, ...change })).status, 400);
  const created = await api(budget);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const lineId = created.body.id;
  assert.match(created.body.code, /^UBEC\/SUBEB\/SPORT\/\d+\/2025$/);
  const subActivity = { competitions: "Inter School Competition", publicity: "Electronic Media", supervision: "QA supervision" };
  for (const section of ["competitions", "publicity"]) assert.equal((await api({ ...budget, section, activityType: `QA ${section}`, quantity: 2, unitCost: 100.1 })).status, 400, "Sub-activities must come from the UBEC list.");
  for (const section of ["competitions", "publicity", "supervision"]) assert.equal((await api({ ...budget, section, activityType: subActivity[section], quantity: 2, unitCost: 100.1 })).status, 201);
  assert.equal((await api()).body.lines.find((line) => line.section === "supervision").activityType, "Supervision, Assessment and Verification", "Supervision lines carry the section name.");
  // Procurement: at most three distinct sports; items outside the suggestions are allowed for every sport.
  const sportLines = [];
  for (const activityType of ["Basketball", "football"]) { const created = await api({ ...budget, activityType, description: activityType === "Basketball" ? "Shot clock" : "Footballs", quantity: 1, unitCost: 1 }); assert.equal(created.status, 201, JSON.stringify(created.body)); sportLines.push(created.body.id); }
  assert.equal((await api({ ...budget, activityType: "Tennis", description: "Tennis balls", quantity: 1, unitCost: 1 })).status, 409, "A fourth sport must be rejected.");
  const sameSport = await api({ ...budget, activityType: " CHILDREN'S FOOTBALL ", description: "Bibs", quantity: 1, unitCost: 1 });
  assert.equal(sameSport.status, 201, "An existing sport (any case) is not a new sport.");
  sportLines.push(sameSport.body.id);
  assert.equal((await api({ ...budget, action: "update", id: sportLines[1], activityType: "Tennis", description: "Tennis balls", quantity: 1, unitCost: 1 })).status, 200, "Replacing a sport's only line keeps the plan at three sports.");
  for (const id of sportLines) assert.equal((await api({ entity: "budget", action: "delete", id })).status, 200);
  assert.equal((await api()).body.lines.find((line) => line.id === lineId).activityType, budget.activityType);
  const schoolAllocation = { ...allocate, lineId, schoolId: schools[0].id };
  assert.equal((await api({ ...schoolAllocation, schoolId: foreignSchool })).status, 400);
  assert.equal((await api({ ...schoolAllocation, lineId: foreignLine })).status, 400);
  assert.equal((await api({ ...schoolAllocation, longitude: "Infinity" })).status, 400);
  const competitionId = (await api()).body.lines.find((line) => line.section === "competitions").id;
  assert.equal((await api({ ...schoolAllocation, lineId: competitionId })).status, 400);
  const allocated = await api(schoolAllocation);
  assert.equal(allocated.status, 201, JSON.stringify(allocated.body));
  assert.equal((await api(schoolAllocation)).status, 409, "Duplicate school/item allocations must be rejected.");
  assert.equal((await api({ ...schoolAllocation, schoolId: schools[1].id, quantity: 8 })).status, 409);
  assert.equal((await api({ ...budget, action: "update", id: lineId, quantity: 2 })).status, 409);
  assert.equal((await api({ ...budget, action: "update", id: lineId, section: "competitions" })).status, 409);
  assert.equal((await api({ ...budget, action: "update", id: lineId, activityType: "Another sport" })).status, 409);
  assert.equal((await api({ entity: "budget", action: "delete", id: lineId })).status, 409);
  assert.equal((await api({ ...budget, action: "update", id: foreignLine })).status, 404);
  assert.equal((await api({ entity: "budget", action: "delete", id: foreignLine })).status, 404);
  assert.equal((await api({ ...budget, action: "update", id: lineId, unitCost: 15000.5 })).status, 200);
  assert.equal((await api({ ...schoolAllocation, action: "update", id: allocated.body.id, quantity: 4, longitude: "", latitude: "" })).status, 200);
  let overview = (await api(undefined, true, "/api/beap")).body;
  assert.deepEqual(overview.sports, { lineCount: 4, schoolCount: 1, budget: 150605.6 });
  assert.deepEqual(overview.total, overview.sports, "Beneficiary allocations must not double count the budget.");
  const concurrentLine = await api({ ...budget, description: "Concurrent quantity check", quantity: 2, unitCost: 1 });
  const concurrent = await Promise.all(schools.map((school) => api({ ...allocate, lineId: concurrentLine.body.id, schoolId: school.id, quantity: 2 })));
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409], "Concurrent writes must not overallocate.");
  const concurrentAllocation = concurrent.find((result) => result.status === 201).body.id;
  assert.equal((await api({ entity: "allocation", action: "delete", id: concurrentAllocation })).status, 200);
  assert.equal((await api({ entity: "budget", action: "delete", id: concurrentLine.body.id })).status, 200);
  assert.equal((await api({ entity: "allocation", action: "delete", id: allocated.body.id })).status, 200);
  assert.equal((await api({ entity: "budget", action: "delete", id: lineId })).status, 200);
  overview = (await api(undefined, true, "/api/beap")).body;
  assert.deepEqual(overview.sports, { lineCount: 3, schoolCount: 0, budget: 600.6 });
  assert.deepEqual(overview.infrastructure, { lineCount: 0, schoolCount: 0, budget: 0 });
  const after = (await db.query("SELECT id, row_to_json(line)::text AS snapshot FROM infrastructure_lines line WHERE id = ANY($1::int[]) ORDER BY id", [original.map((line) => line.id)])).rows;
  assert.deepEqual(after, original, "Existing infrastructure data must be unchanged.");
  console.log("PASS: four sections, sub-activity lists, max three procurement sports, typed sports items, decimal totals, persistence, edits/deletes, state isolation, authentication, school allocations, duplicate/over-allocation checks, concurrent writes, coordinates, overview totals, and preserved Infrastructure data.");
} finally {
  await db.query("DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code = ANY($1::text[]))", [[marker, foreignMarker]]);
  await db.query("DELETE FROM sports_budget_lines WHERE state_code = ANY($1::text[])", [[marker, foreignMarker]]);
  await db.query("DELETE FROM action_plans WHERE state_code = ANY($1::text[])", [[marker, foreignMarker]]);
  await db.query("DELETE FROM schools WHERE state_code = ANY($1::text[])", [[marker, foreignMarker]]);
  await db.query("DELETE FROM users WHERE email = $1", [email]);
  await db.end();
}
