// Action plans: sign-in, state scope and plan isolation across the editors (/api/beap, /api/infrastructure/packages,
// /api/sports), sports lines and allocations per plan, plan references, dashboard totals and unique targeted schools.
// Plans are created through the setup form with a RAT workbook (test-plan-setup.mjs covers the form's validation).
// Usage: node --env-file=.env scripts/test-action-plans.mjs [baseUrl]   (local only; throwaway states, users and plans; cleans up)
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashSync } from "bcryptjs";
import ExcelJS from "exceljs";

const base = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? "http://localhost:5173";
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base), "Run this test against a local server only.");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname), "Use a local database only.");
const marker = `AP${randomUUID().slice(0, 8).toUpperCase()}`;
const states = [marker, `${marker}F`];
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {}, userIds = [];
async function api(who, path, body, method = body ? "POST" : "GET") {
  const isForm = body instanceof FormData;
  const response = await fetch(base + path, { method, headers: { Origin: base, ...(body && !isForm ? { "Content-Type": "application/json" } : {}), ...(cookies[who] ? { Cookie: cookies[who] } : {}) }, ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 200) }; }
  const cookie = response.headers.get("set-cookie")?.split(";")[0]; if (cookie && path === "/api/auth/login") cookies[who] = cookie;
  return { status: response.status, data };
}
const ok = (result, status = 200) => { assert.equal(result.status, status, JSON.stringify(result.data)); return result.data; };
const ratWorkbook = new ExcelJS.Workbook(); ratWorkbook.addWorksheet("RAT").addRow(["Action plans QA"]);
const rat = Buffer.from(await ratWorkbook.xlsx.writeBuffer());
const planForm = (planningYear, quarters) => {
  const form = new FormData();
  form.set("setup", JSON.stringify({ planningYear, implementationYear: planningYear, quarters, stateLodgment: "100000000", fundingSources: [] }));
  form.append("rat", new Blob([rat]), "rat.xlsx");
  return form;
};

await db.connect();
try {
  const before = (await db.query("SELECT id, state_code FROM action_plans p ORDER BY id")).rows;
  for (const [who, role, departments] of [["des", "Data Entry Staff", ["academic", "physical"]], ["ec", "Executive Chairman", []]]) {
    const email = `${who}.${marker.toLowerCase()}@plans.test`;
    const id = (await db.query("INSERT INTO users (email, full_name, role, department, password_hash, state_code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [email, `QA ${who}`, role, departments[0] ?? null, hashSync(password, 4), marker])).rows[0].id;
    userIds.push(id);
    for (const department of departments) await db.query("INSERT INTO user_departments(user_id, department) VALUES ($1, $2)", [id, department]);
    ok(await api(who, "/api/auth/login", { email, password }));
  }
  const school = (await db.query("INSERT INTO schools (name, lga, level, location, state_code) VALUES ($1, 'QA', 'Primary', 'Urban', $1) RETURNING id", [marker])).rows[0].id;
  const foreign = (await db.query("INSERT INTO action_plans (state_code, start_year, end_year) VALUES ($1, 2026, 2026) RETURNING id", [states[1]])).rows[0].id;
  const foreignSchool = (await db.query("INSERT INTO schools (name, lga, level, location, state_code) VALUES ($1, 'QA', 'Primary', 'Urban', $1) RETURNING id", [states[1]])).rows[0].id;
  const foreignLine = (await db.query("INSERT INTO sports_budget_lines (plan_id, state_code, code, section, activity_type, description, quantity, unit_cost) VALUES ($1, $2, $2, 'equipment', 'Football', 'QA equipment', 1, 10) RETURNING id", [foreign, states[1]])).rows[0].id;
  await db.query("INSERT INTO sports_allocations (line_id, school_id, quantity) VALUES ($1, $2, 1)", [foreignLine, foreignSchool]);

  assert.equal((await api("anonymous", "/api/plans")).status, 401);
  assert.equal((await api("anonymous", "/api/plans", planForm(2026, [1]))).status, 401);
  assert.deepEqual(ok(await api("des", "/api/plans")).plans, []);
  assert.equal(ok(await api("des", "/api/plans")).targetedSchools, 0, "Other states' schools must be excluded");
  assert.equal((await api("des", "/api/beap")).status, 404, "Opening an editor without a plan must not create one");
  const a = ok(await api("ec", "/api/plans", planForm(2026, [1, 2])), 201).plan.id;
  const b = ok(await api("ec", "/api/plans", planForm(2027, [1])), 201).plan.id;
  for (const path of ["/api/beap", "/api/infrastructure/packages", "/api/sports"]) {
    for (const id of [foreign, "invalid", 0, 999999999]) assert.equal((await api("des", `${path}?plan=${id}`)).status, 404, `${path}?plan=${id}`);
    assert.equal(ok(await api("des", `${path}?plan=${b}`)).plan.endYear, 2027, path);
  }

  const sportsBody = { entity: "budget", action: "create", section: "equipment", activityType: "Football", description: "QA balls", quantity: 10, unitCost: 100.25 };
  const line = ok(await api("des", `/api/sports?plan=${a}`, sportsBody), 201);
  assert.match(line.code, /^UBEC\/SUBEB\/SPORT\/\d+\/2026 · Q1–Q2$/, "The reference carries the plan period");
  assert.equal(ok(await api("des", "/api/plans")).targetedSchools, 0, "Unallocated equipment must not count as a school");
  assert.equal(ok(await api("des", `/api/sports?plan=${b}`)).lines.length, 0);
  for (const action of ["update", "delete"]) assert.equal((await api("des", `/api/sports?plan=${b}`, { ...sportsBody, action, id: line.id })).status, 404);
  const allocation = { entity: "allocation", action: "create", lineId: line.id, schoolId: school, quantity: 2 };
  assert.equal((await api("des", `/api/sports?plan=${b}`, allocation)).status, 400, "A line of another plan cannot be allocated");
  assert.equal((await api("des", `/api/sports?plan=${a}`, { ...allocation, schoolId: foreignSchool })).status, 400, "Another state's school cannot be allocated");
  const allocated = ok(await api("des", `/api/sports?plan=${a}`, allocation), 201);
  assert.equal((await api("des", `/api/sports?plan=${b}`, { ...allocation, action: "delete", id: allocated.id })).status, 404);

  const lineB = ok(await api("des", `/api/sports?plan=${b}`, { ...sportsBody, description: "QA kits", quantity: 4, unitCost: 250.25 }), 201);
  assert.match(lineB.code, /\/2027 · Q1$/);
  ok(await api("des", `/api/sports?plan=${b}`, { ...allocation, lineId: lineB.id }), 201);
  const overviewA = ok(await api("des", `/api/beap?plan=${a}`));
  const overviewB = ok(await api("des", `/api/beap?plan=${b}`));
  assert.deepEqual(overviewA.total, { budget: 1002.5, lineCount: 1, schoolCount: 1 });
  assert.deepEqual(overviewB.total, { budget: 1001, lineCount: 1, schoolCount: 1 });
  const plans = ok(await api("des", "/api/plans")).plans;
  assert.equal(plans.length, 2); assert.ok(plans.every(p => [a, b].includes(p.id)));
  assert.equal(plans.find(p => p.id === a).budget, 1002.5);
  assert.equal(plans.find(p => p.id === b).sportsBudget, 1001);
  assert.equal(ok(await api("des", "/api/plans")).targetedSchools, 1, "The same school across plans counts once");
  const secondSchool = (await db.query("INSERT INTO schools (name, lga, level, location, state_code) VALUES ($1, 'QA', 'Primary', 'Urban', $2) RETURNING id", [`${marker}-SECOND`, marker])).rows[0].id;
  const second = ok(await api("des", `/api/sports?plan=${b}`, { ...allocation, lineId: lineB.id, schoolId: secondSchool }), 201);
  assert.equal(ok(await api("des", "/api/plans")).targetedSchools, 2, "A different targeted school increases the total");
  ok(await api("des", `/api/sports?plan=${b}`, { ...allocation, action: "delete", id: second.id }));
  assert.equal(ok(await api("des", "/api/plans")).targetedSchools, 1, "Removing a school's last allocation updates the count");
  const after = (await db.query("SELECT id, state_code FROM action_plans p WHERE id = ANY($1::int[]) ORDER BY id", [before.map(p => p.id)])).rows;
  // Other agents and tests share the local database and may edit or remove their own plans meanwhile, so only check
  // that no pre-existing plan moved into this test's states.
  for (const row of after) assert.equal(row.state_code, before.find(p => p.id === row.id).state_code, "Existing plans must be preserved");
  console.log("PASS: plan creation, authenticated state scope, isolated editor data and mutations, allocation isolation, plan references, dashboard totals, unique targeted schools across plans, and preserved existing plans.");
} finally {
  await db.query("DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code = ANY($1::text[]))", [states]);
  await db.query("DELETE FROM sports_budget_lines WHERE state_code = ANY($1::text[])", [states]);
  await db.query("DELETE FROM action_plans WHERE state_code = ANY($1::text[])", [states]);
  await db.query("DELETE FROM schools WHERE state_code = ANY($1::text[])", [states]);
  if (userIds.length) {
    await db.query("DELETE FROM sessions WHERE user_id = ANY($1::int[])", [userIds]);
    await db.query("DELETE FROM users WHERE id = ANY($1::int[])", [userIds]);
  }
  await db.end();
}
