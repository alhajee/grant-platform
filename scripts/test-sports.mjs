import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { hashSync } from "bcryptjs";
import { sportsAllocationProblem, sportsAllocationSchema, sportsLineSchema, sportsLineTotal, sportsBudget, sportsSections, sportsSnapshotProblem } from "../lib/sports.ts";

const baseUrl = process.argv[2] ?? process.env.TEST_BASE_URL ?? process.env.UBEC_TEST_URL ?? "http://localhost:5173";
assert.ok(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl), "Tests must target the local app.");
const marker = `SPORTS-QA-${randomUUID()}`;
const foreignMarker = `${marker}-OTHER`;
const email = `${marker.toLowerCase()}@ubec.test`;
const directorEmail = `${marker.toLowerCase()}-director@ubec.test`;
const password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
let cookie;
async function api(body, authenticated = true, path = "/api/sports") {
  const response = await fetch(`${baseUrl}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(authenticated && cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json(), response };
}
const budget = { entity: "budget", action: "create", targetGroup: "Schools", section: "equipment", activityType: "Children's football", description: "Training balls", quantity: 10, unitCost: 12500.25 };
const allocate = { entity: "allocation", action: "create", quantity: 3, longitude: "11.04", latitude: "12.87" };

await db.connect();
try {
  assert.equal(sportsLineTotal({ quantity: 3, unitCost: 0.1 }), 0.3);
  assert.equal(sportsBudget([{ quantity: 3, unitCost: 0.1 }, { quantity: 2, unitCost: 0.2 }]), 0.7);
  for (const change of [{ quantity: 0 }, { quantity: 1.5 }, { unitCost: 0 }, { unitCost: 1.23456 }, { unitCost: 100000000000 }, { quantity: 1000000, unitCost: 99999999999.9999 }, { activityType: " " }, { description: " " }, { section: "invalid" }]) {
    assert.equal(sportsLineSchema.safeParse({ ...budget, ...change }).success, false);
  }
  // UBEC219: one or more listed target groups, required, stored joined in list order.
  assert.equal(sportsLineSchema.safeParse({ ...budget, targetGroup: "" }).error?.issues[0].message, "Choose the target group");
  assert.equal(sportsLineSchema.safeParse({ ...budget, targetGroup: undefined }).success, false);
  assert.equal(sportsLineSchema.safeParse({ ...budget, targetGroup: ["Martians"] }).error?.issues[0].message, "Choose target groups from the list");
  assert.equal(sportsLineSchema.parse({ ...budget, targetGroup: ["Teachers", "Schools", "Teachers"] }).targetGroup, "Schools, Teachers");
  // UBEC224: every equipment item given out in full to schools before sending; training lines are not given out.
  const item = (extra) => ({ section: "equipment", activityType: "Football", description: "Balls", quantity: 10, allocated: 10, ...extra });
  assert.equal(sportsAllocationProblem([item(), item({ activityType: "Training of PHE Officers", allocated: 0 }), item({ section: "competitions", allocated: 0 })]), null);
  assert.equal(sportsAllocationProblem([item({ allocated: 4 })]), "Allocate every equipment item to beneficiary schools before sending: “Balls” (4 of 10 allocated)");
  assert.match(sportsAllocationProblem([1, 2, 3, 4, 5].map((n) => item({ description: `Item ${n}`, allocated: 0 }))), /“Item 3” \(0 of 10 allocated\) and 2 more$/);
  const snapshotLine = (allocations) => ({ section: "equipment", activity_type: "Football", description: "Balls", quantity: 10, unit_cost: "1", allocations });
  const fundedPlan = { stateLodgment: "100000000", otherFunding: "0", fundingSources: [], debateAllocation: "0" };
  assert.match(sportsSnapshotProblem([snapshotLine([{ quantity: 3 }])], fundedPlan), /Allocate every equipment item/);
  assert.equal(sportsSnapshotProblem([snapshotLine([{ quantity: 3 }, { quantity: 7 }])], fundedPlan), null);
  // V2 UBEC07: Debate programme components, of the Debate amount (₦1,000 here): at most 35/45/25/10%, at least 25/35/15/5% at send.
  const debateRow = (activity_type, naira) => ({ section: "debate", activity_type, description: "Debate", quantity: 1, unit_cost: String(naira) });
  const debatePlan = { ...fundedPlan, debateAllocation: "1000.00" };
  const fullDebate = [debateRow("BESLP Resources and Materials", 300), debateRow("Literary Competitions", 400), debateRow("Capacity Building", 200), debateRow("Verification, Assessment, Reporting and Administration", 100)];
  assert.equal(sportsSnapshotProblem(fullDebate, debatePlan), null, "The recommended shares pass");
  assert.equal(sportsSnapshotProblem([debateRow("BESLP Resources and Materials", 250), debateRow("Literary Competitions", 450), debateRow("Capacity Building", 250), debateRow("Verification, Assessment, Reporting and Administration", 50)], debatePlan), null, "Any mix within the ranges passes");
  assert.equal(sportsSnapshotProblem([debateRow("BESLP Resources and Materials", 200), ...fullDebate.slice(1)], debatePlan), "‘BESLP Resources and Materials’ needs at least ₦250.0000 (25% of the Debate amount) before sending. Its items come to ₦200.0000, so ₦50.0000 more is needed");
  assert.equal(sportsSnapshotProblem([debateRow("BESLP Resources and Materials", 249.01), ...fullDebate.slice(1)], debatePlan), null, "A shortfall under ₦1 passes (UBEC172)");
  assert.equal(sportsSnapshotProblem([debateRow("BESLP Resources and Materials", 299), ...fullDebate.slice(1, 3), debateRow("Verification, Assessment, Reporting and Administration", 100.01)], debatePlan), "‘Verification, Assessment, Reporting and Administration’ can use up to ₦100.0000 (10% of the Debate amount). Its items come to ₦100.0100, which is ₦0.0100 over. Reduce them to continue.");
  assert.equal(sportsSnapshotProblem([debateRow("Debate", 1000)], debatePlan), null, "Plans whose Debate lines all predate the components are not checked");
  assert.match(sportsSnapshotProblem([debateRow("Debate", 700), debateRow("BESLP Resources and Materials", 300)], debatePlan), /‘Literary Competitions’ needs at least ₦350\.0000/, "Once one line uses a component, earlier lines count towards none");
  assert.equal(sportsSnapshotProblem([], { ...fundedPlan, debateAllocation: "0.00" }), null, "No minimums when Debate is ₦0");
  assert.equal(sportsLineSchema.parse({ ...budget, section: "debate", activityType: "Capacity Building" }).activityType, "Capacity Building", "Debate lines keep the component chosen");
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
  for (const change of [{ quantity: -1 }, { unitCost: 1.23456 }, { section: "unknown" }, { id: foreignLine }, { description: " " }]) assert.equal((await api({ ...budget, ...change })).status, 400);
  const created = await api(budget);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const lineId = created.body.id;
  // UBEC233 (migration 091): codes count from 001 in each plan, with the year and no quarters.
  assert.equal(created.body.code, "UBEC/SUBEB/SPORT/001/2025");
  assert.equal((await api()).body.lines[0].targetGroup, "Schools");
  assert.equal((await api({ ...budget, targetGroup: undefined })).body.error, "Choose the target group");
  // UBEC238: a four-decimal unit cost is kept exactly and 3 × ₦1.0202 totals ₦3.0606; a fifth decimal is refused.
  const precise = await api({ ...budget, description: "Whistles", quantity: 3, unitCost: 1.0202 });
  assert.equal(precise.status, 201, JSON.stringify(precise.body));
  assert.deepEqual((await db.query("SELECT unit_cost::text AS cost, (unit_cost * quantity)::text AS total FROM sports_budget_lines WHERE id = $1", [precise.body.id])).rows[0], { cost: "1.0202", total: "3.0606" });
  assert.equal((await api()).body.lines.find((line) => line.id === precise.body.id).unitCost, 1.0202);
  assert.equal((await api({ ...budget, unitCost: 1.02025 })).body.error, "Use at most four decimal places");
  assert.equal((await api({ entity: "budget", action: "delete", id: precise.body.id })).status, 200);
  assert.equal((await api({ ...budget, targetGroup: "Aliens" })).status, 400);
  const otherPlanLine = (await db.query("INSERT INTO sports_budget_lines (state_code, section, activity_type, description, quantity, unit_cost, plan_id) VALUES ($1, 'equipment', 'Other sport', 'Second item', 1, 1, $2) RETURNING code", [foreignMarker, foreignPlan])).rows[0];
  assert.equal(otherPlanLine.code, "UBEC/SUBEB/SPORT/001/2025", "Each plan counts from 001 (the other plan's first line had a code of its own)");
  const subActivity = { competitions: "Inter School Competition", publicity: "Electronic Media", supervision: "QA supervision" };
  for (const section of ["competitions", "publicity"]) assert.equal((await api({ ...budget, section, activityType: `QA ${section}`, quantity: 2, unitCost: 100.1 })).status, 400, "Sub-activities must come from the UBEC list.");
  for (const section of ["competitions", "publicity", "supervision"]) assert.equal((await api({ ...budget, section, activityType: subActivity[section], quantity: 2, unitCost: 100.1 })).status, 201);
  assert.equal((await api()).body.lines.find((line) => line.section === "supervision").activityType, "Supervision, Assessment and Verification", "A supervision line without a listed sub-activity carries the section name.");
  assert.deepEqual((await api()).body.lines.map((line) => line.code), ["001", "002", "003", "004"].map((n) => `UBEC/SUBEB/SPORT/${n}/2025`), "Lines are numbered in order");
  const parallel = await Promise.all([1, 2, 3].map((n) => api({ ...budget, section: "publicity", activityType: "Print Media", description: `Parallel ${n}`, quantity: 1, unitCost: 1 })));
  const parallelCodes = parallel.map((result) => result.body.code).sort();
  assert.deepEqual(parallelCodes, ["005", "006", "007"].map((n) => `UBEC/SUBEB/SPORT/${n}/2025`), "Saves at the same time get different numbers");
  for (const result of parallel) assert.equal((await api({ entity: "budget", action: "delete", id: result.body.id })).status, 200);
  // UBEC166: a listed sub-activity is kept.
  const assessment = await api({ ...budget, section: "supervision", activityType: "Assessment", quantity: 1, unitCost: 1 });
  assert.equal(assessment.status, 201); assert.equal((await api()).body.lines.find((line) => line.id === assessment.body.id).activityType, "Assessment");
  assert.equal((await api({ entity: "budget", action: "delete", id: assessment.body.id })).status, 200);
  // Procurement: at most three distinct sports; items outside the suggestions are allowed for every sport.
  const sportLines = [];
  for (const activityType of ["Basketball", "football"]) { const created = await api({ ...budget, activityType, description: activityType === "Basketball" ? "Shot clock" : "Footballs", quantity: 1, unitCost: 1 }); assert.equal(created.status, 201, JSON.stringify(created.body)); sportLines.push(created.body.id); }
  assert.equal((await api({ ...budget, activityType: "Tennis", description: "Tennis balls", quantity: 1, unitCost: 1 })).status, 409, "A fourth sport must be rejected.");
  // Training of PHE Officers (UBEC121): a training line in the same section is not a sport, so the limit does not apply,
  // and it is not an equipment item to allocate to schools.
  const training = await api({ ...budget, activityType: "Training of PHE Officers", description: "Three-day refresher for 40 PHE officers", quantity: 40, unitCost: 1 });
  assert.equal(training.status, 201, JSON.stringify(training.body));
  assert.equal((await api({ ...allocate, lineId: training.body.id, schoolId: schools[0].id })).status, 400, "Training lines are not allocated to schools.");
  assert.equal((await api({ entity: "budget", action: "delete", id: training.body.id })).status, 200);
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
  // Funding caps: no ceiling until the plan has funding; then the sports envelope and each section's share of it.
  assert.equal((await api()).body.envelope, null, "No envelope until the plan has funding.");
  await db.query("UPDATE action_plans SET state_lodgment = 500000, other_funding = 0 WHERE state_code = $1", [marker]);
  const envelopeKobo = Math.round(Number((await api()).body.envelope) * 100);
  assert.ok(envelopeKobo > 0, "The plan funding gives Sports an envelope.");
  const naira = (kobo) => kobo / 100;
  // UBEC167: the Debate amount comes out of the Sports allocation (₦0 allowed); Debate lines wait for it and use at most it.
  const debateLine = { ...budget, section: "debate", activityType: "BESLP Resources and Materials", description: "Debate kits", quantity: 1 };
  const early = await api({ ...debateLine, unitCost: 10 });
  assert.equal(early.status, 409); assert.match(early.body.error, /goes to Debate first/);
  assert.equal((await api({ entity: "debate", action: "update", amount: String(naira(envelopeKobo + 1)) })).status, 400, "Debate cannot exceed the Sports allocation.");
  assert.equal((await api({ entity: "debate", action: "update", amount: "-1" })).status, 400);
  const debateKobo = Math.round(envelopeKobo / 10);
  assert.equal((await api({ entity: "debate", action: "update", amount: naira(debateKobo).toFixed(2) })).status, 200, "10% of Sports to Debate.");
  assert.equal((await api()).body.plan.debateAllocation, naira(debateKobo).toFixed(2));
  // V2 UBEC07: every new Debate line chooses a programme component, each capped at its maximum share of the Debate amount.
  const unlisted = await api({ ...debateLine, activityType: "anything", unitCost: 1 });
  assert.equal(unlisted.status, 400); assert.equal(unlisted.body.error, "Choose a sub-activity from the list");
  assert.equal((await api({ ...debateLine, activityType: "Debate", unitCost: 1 })).status, 400, "New lines may not use the earlier Debate type.");
  const share = (percent) => Math.round(debateKobo * percent / 100);
  const overLiterary = await api({ ...debateLine, activityType: "Literary Competitions", unitCost: naira(share(45) + 1) });
  assert.equal(overLiterary.status, 409); assert.match(overLiterary.body.error, /‘Literary Competitions’ can use up to ₦[\d,.]+ \(45% of the Debate amount\)\. With this item it would come to/);
  // An earlier line (activity type "Debate", saved before V2 UBEC07) still reads and can be edited without choosing a component.
  const legacy = (await db.query("INSERT INTO sports_budget_lines (state_code, section, activity_type, description, quantity, unit_cost, plan_id) SELECT $1, 'debate', 'Debate', 'Earlier debate', 1, 1, id FROM action_plans WHERE state_code = $1 RETURNING id", [marker])).rows[0].id;
  assert.equal((await api()).body.lines.find((line) => line.id === legacy).activityType, "Debate");
  assert.equal((await api({ ...debateLine, action: "update", id: legacy, activityType: "Debate", description: "Earlier debate", unitCost: 0.5 })).status, 200, "An earlier Debate line keeps its type when edited.");
  const debateIds = [legacy];
  for (const [activityType, percent] of [["BESLP Resources and Materials", 30], ["Literary Competitions", 40], ["Capacity Building", 20]]) {
    const saved = await api({ ...debateLine, activityType, unitCost: naira(share(percent)) });
    assert.equal(saved.status, 201, JSON.stringify(saved.body)); debateIds.push(saved.body.id);
  }
  const verification = await api({ ...debateLine, activityType: "Verification, Assessment, Reporting and Administration", unitCost: naira(debateKobo - share(30) - share(40) - share(20)) - 0.5 });
  assert.equal(verification.status, 201, JSON.stringify(verification.body)); debateIds.push(verification.body.id);
  assert.equal((await api()).body.lines.find((line) => line.id === verification.body.id).activityType, "Verification, Assessment, Reporting and Administration");
  const overDebate = await api({ ...debateLine, activityType: "Capacity Building", unitCost: 1 });
  assert.equal(overDebate.status, 409); assert.match(overDebate.body.error, /Debate can use up to/);
  const below = await api({ entity: "debate", action: "update", amount: "1.00" });
  assert.equal(below.status, 409, "The Debate amount cannot go below its items."); assert.match(below.body.error, /Debate items already come to/);
  // The other sections' shares apply to the rest of the Sports allocation.
  const capKobo = (id) => Math.round((envelopeKobo - debateKobo) * sportsSections.find((section) => section.id === id).share / 100);
  const volleyball = { ...budget, activityType: "Volleyball", description: "Volleyballs", quantity: 1 };
  const atCap = await api({ ...volleyball, unitCost: naira(capKobo("equipment")) });
  assert.equal(atCap.status, 201, `A section may use exactly its share: ${JSON.stringify(atCap.body)}`);
  const overSection = await api({ ...volleyball, description: "Net", unitCost: 0.01 });
  assert.equal(overSection.status, 409, "A line that takes a section past its share must be refused.");
  assert.match(overSection.body.error, /can use up to ₦[\d,.]+ \(\d+% of the Sports allocation\)\. With this item it would come to/);
  // Each competition sub-activity is capped at its share of the Sports Competitions cap (State Finals 40%).
  const finalsCap = Math.round(capKobo("competitions") * 40 / 100);
  const finals = { ...budget, section: "competitions", activityType: "State Finals Competition", description: "Finals", quantity: 1 };
  const overFinals = await api({ ...finals, unitCost: naira(finalsCap + 1) });
  assert.equal(overFinals.status, 409, "A sub-activity past its share of the section must be refused.");
  assert.match(overFinals.body.error, /‘State Finals Competition’ can use up to ₦[\d,.]+ \(40% of Sports Competitions\)/);
  const finalsLine = await api({ ...finals, unitCost: naira(finalsCap) });
  assert.equal(finalsLine.status, 201, JSON.stringify(finalsLine.body));
  const tooMuchDebate = await api({ entity: "debate", action: "update", amount: naira(debateKobo * 2).toFixed(2) });
  assert.equal(tooMuchDebate.status, 409, "More for Debate may not squeeze a section below its items."); assert.match(tooMuchDebate.body.error, /Procurement & Training of PHE Officers/);
  const update = { ...volleyball, action: "update", id: atCap.body.id };
  assert.equal((await api({ ...update, quantity: 2, unitCost: naira(capKobo("equipment")) })).status, 409, "Raising a line past the cap must be refused.");
  assert.equal((await api({ ...update, unitCost: naira(capKobo("equipment") - 100) })).status, 200, "Lowering is always allowed.");
  // Funding cut below the proposals: the plan is over budget, still editable downward, and cannot be sent.
  await db.query("UPDATE action_plans SET state_lodgment = 1000 WHERE state_code = $1", [marker]);
  const over = await api({ ...update, unitCost: naira(capKobo("equipment")) });
  assert.equal(over.status, 409);
  assert.match(over.body.error, /exceeded the Sports allocation/);
  assert.equal((await api({ ...update, unitCost: 1 })).status, 200, "An over-budget plan can still be lowered.");
  const directorId = (await db.query("INSERT INTO users (email, full_name, role, department, password_hash, state_code) VALUES ($1, 'Sports QA Director', 'Director', 'academic', $2, $3) RETURNING id", [directorEmail, hashSync(password, 4), marker])).rows[0].id;
  await db.query("INSERT INTO user_departments (user_id, department) VALUES ($1, 'academic')", [directorId]);
  const reviewView = await api(undefined, true, "/api/plans/review");
  assert.equal(reviewView.status, 200, JSON.stringify(reviewView.body));
  const send = await api({ action: "submit", pillar: "sports", version: reviewView.body.plan.version }, true, "/api/plans/review");
  assert.equal(send.status, 409, `Sending an over-budget Sports component must be refused: ${JSON.stringify(send.body)}`);
  assert.match(send.body.error, /exceeded the Sports allocation/);
  for (const id of [atCap.body.id, finalsLine.body.id]) assert.equal((await api({ entity: "budget", action: "delete", id })).status, 200);
  await db.query("UPDATE action_plans SET state_lodgment = 500000 WHERE state_code = $1", [marker]);
  // V2 UBEC07: at send, each Debate programme component reaches its minimum share (Capacity Building 15%); lowering is allowed on save.
  assert.equal((await api({ ...debateLine, action: "update", id: debateIds[3], activityType: "Capacity Building", unitCost: naira(share(15) - 200) })).status, 200, "Lowering a component below its minimum saves.");
  const shortDebate = await api({ action: "submit", pillar: "sports", version: (await api(undefined, true, "/api/plans/review")).body.plan.version }, true, "/api/plans/review");
  assert.equal(shortDebate.status, 409, JSON.stringify(shortDebate.body));
  assert.match(shortDebate.body.error, /‘Capacity Building’ needs at least ₦[\d,.]+ \(15% of the Debate amount\) before sending\. Its items come to ₦[\d,.]+, so ₦2\.0000 more is needed/);
  for (const id of debateIds) assert.equal((await api({ entity: "budget", action: "delete", id })).status, 200);
  // UBEC224: within budget, an equipment item not given out in full to beneficiary schools still cannot be sent.
  const open = await api({ ...budget, description: "Goal nets", quantity: 5, unitCost: 1 });
  assert.equal(open.status, 201, JSON.stringify(open.body));
  const sendOpen = async () => api({ action: "submit", pillar: "sports", version: (await api(undefined, true, "/api/plans/review")).body.plan.version }, true, "/api/plans/review");
  let refused = await sendOpen();
  assert.equal(refused.status, 409); assert.equal(refused.body.error, "Allocate every equipment item to beneficiary schools before sending: “Goal nets” (0 of 5 allocated)");
  assert.equal((await api({ ...allocate, lineId: open.body.id, schoolId: schools[1].id, quantity: 2 })).status, 201);
  refused = await sendOpen();
  assert.equal(refused.status, 409); assert.match(refused.body.error, /“Goal nets” \(2 of 5 allocated\)/);
  console.log("PASS: target groups (UBEC219), codes from 001 per plan without quarters (UBEC233), unallocated equipment refused at send (UBEC224), four sections, sub-activity lists, max three procurement sports, typed sports items, decimal totals, persistence, edits/deletes, state isolation, authentication, school allocations, duplicate/over-allocation checks, sports envelope, section and competition sub-activity caps (save and send; lowering allowed), Debate programme components (V2 UBEC07: listed, capped at their maximum, minimums at send, earlier Debate lines kept), concurrent writes, coordinates, overview totals, and preserved Infrastructure data.");
} finally {
  await db.query("DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code = ANY($1::text[]))", [[marker, foreignMarker]]);
  await db.query("DELETE FROM sports_budget_lines WHERE state_code = ANY($1::text[])", [[marker, foreignMarker]]);
  await db.query("DELETE FROM action_plans WHERE state_code = ANY($1::text[])", [[marker, foreignMarker]]);
  await db.query("DELETE FROM schools WHERE state_code = ANY($1::text[])", [[marker, foreignMarker]]);
  await db.query("DELETE FROM users WHERE email = ANY($1::text[])", [[email, directorEmail]]);
  await db.end();
}
