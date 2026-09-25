import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.env.UBEC_TEST_URL ?? 'http://localhost:5174';
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
const marker = `UBEC-QA-${randomUUID()}`, password = randomUUID();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const cookies = {};
async function api(actor, path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookies[actor] ? { Cookie: cookies[actor] } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), response };
}
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
await db.connect();
try {
  const original = (await db.query('SELECT id,row_to_json(p)::text AS snapshot FROM action_plans p ORDER BY id')).rows;
  for (const [key, role, state, department] of [
    ['officer','Data Entry Staff',marker,'physical'], ['staffsports','Data Entry Staff',marker,'academic'], ['director','Director',marker,null], ['state','Executive Chairman',marker,null],
    ['foreign','Executive Chairman',marker+'-FOREIGN',null],
    ['national','UBEC Executive Secretary',marker+'-NATIONAL',null],
    ['physical','UBEC Department Reviewer',marker+'-NATIONAL','physical'],
    ['academic','UBEC Department Reviewer',marker+'-NATIONAL','academic'],
    ['audit','UBEC Department Reviewer',marker+'-NATIONAL','audit'],
  ]) {
    const email = `${key}.${marker.toLowerCase()}@ubec.test`;
    await db.query('INSERT INTO users(email,full_name,role,state_code,department,password_hash) VALUES($1,$2,$3,$4,$5,$6)', [email, 'QA '+key, role, state, department, hashSync(password,4)]);
    const login = await api(key,'/api/auth/login',{email,password}); ok(login);
    cookies[key] = login.response.headers.get('set-cookie').split(';')[0];
    assert.equal(login.data.destination, ['national','physical','academic','audit'].includes(key) ? '/ubec' : '/dashboard');
  }
  const plan = ok(await api('officer','/api/plans',{startYear:2026,endYear:2026}),201).plan;
  const statePath = `/api/plans/review?plan=${plan.id}`, path = `/api/ubec/review?plan=${plan.id}`;
  const sports = `/api/sports?plan=${plan.id}`, infra = `/api/infrastructure?plan=${plan.id}`;
  const school = (await db.query("INSERT INTO schools(name,lga,level,location,state_code) VALUES($1,'QA','Primary','Urban',$1) RETURNING id",[marker])).rows[0].id;
  const type = ok(await api('officer','/api/construction-types',{classrooms:1,playroomsLabs:0,libraries:0,toilets:0,officesStores:0,duration:20,unitCost:500}),201).constructionType.id;
  ok(await api('officer',infra,{schoolId:school,projectType:type,quantity:2,strategy:'NCB',rationale:'QA infrastructure'}),201);
  const budget = {entity:'budget',action:'create',section:'equipment',activityType:'Football',description:'QA equipment',quantity:5,unitCost:100};
  const lineId = ok(await api('staffsports',sports,budget),201).id;
  ok(await api('staffsports',sports,{entity:'allocation',action:'create',lineId,schoolId:school,quantity:5}),201);
  const stateAction = async (actor, action, comment='QA response') => {
    if (action === 'approve') { const before = ok(await api('director',statePath)); ok(await api('director',statePath,{action:'endorse',version:before.plan.version})); }
    const current = ok(await api('officer',statePath));
    return api(actor,statePath,{action,version:current.plan.version,comment});
  };
  const act = async (actor, action, extra={}) => {
    const current = ok(await api('state',path));
    return api(actor,path,{action,version:current.plan.version,...(current.round ? {roundId:current.round.id}:{}),...extra});
  };
  assert.equal((await api('anonymous','/api/ubec/dashboard')).status,401);
  assert.equal((await api('officer','/api/ubec/dashboard')).status,403);
  assert.equal((await api('foreign',path)).status,404);
  assert.equal((await api('national',path)).status,404);
  assert.equal((await act('state','submit')).status,409);
  ok(await stateAction('officer','submit')); ok(await stateAction('state','approve'));
  assert.equal((await act('officer','submit')).status,403);
  ok(await act('state','submit'));
  assert.equal((await act('state','submit')).status,409);
  const first = ok(await api('national',path));
  const frozen = JSON.stringify(first.round.snapshot);
  assert.equal((await api('staffsports',sports,budget)).status,409);
  assert.equal((await api('audit',path)).status,404);
  assert.equal((await act('national','approve',{comment:'Too early'})).status,409);
  assert.equal((await act('national','assign',{assignments:[{pillar:'infrastructure',department:'physical'}]})).status,400);
  ok(await act('national','assign',{assignments:[{pillar:'infrastructure',department:'physical'},{pillar:'sports',department:'academic'}]}));
  const physical = ok(await api('physical',path)), academic = ok(await api('academic',path));
  assert.equal(physical.round.snapshot.sports.length,0);
  assert.equal(academic.round.snapshot.infrastructure.length,0);
  assert.equal(physical.assignments.length,1);
  assert.equal(ok(await api('state',path)).assignments.length,0,'Unreleased feedback stays internal');
  assert.equal((await act('physical','feedback',{assignmentId:academic.assignments[0].id,recommendation:'endorse',comment:'Wrong assignment'})).status,403);
  ok(await act('physical','feedback',{assignmentId:physical.assignments[0].id,recommendation:'endorse',comment:'Infrastructure checked'}));
  assert.equal((await act('national','approve',{comment:'Still waiting'})).status,409);
  ok(await act('academic','feedback',{assignmentId:academic.assignments[0].id,recommendation:'changes',comment:'Revise equipment quantity'}));
  assert.equal((await act('academic','return',{comment:'No authority'})).status,403);
  ok(await act('national','return',{comment:'Revise sports equipment and resubmit via the SUBEB ES.'}));
  assert.equal(ok(await api('officer',statePath)).plan.status,'changes_requested');
  assert.equal(ok(await api('state',path)).assignments.length,2);
  ok(await api('staffsports',sports,{...budget,action:'update',id:lineId,description:'Revised equipment specification'}));
  assert.equal((await act('state','submit',{comment:'Cannot skip state review'})).status,409);
  ok(await stateAction('officer','submit')); ok(await stateAction('state','approve'));
  assert.equal((await act('state','submit')).status,400);
  ok(await act('state','submit',{comment:'Addressed equipment feedback.'}));
  assert.equal(JSON.stringify(ok(await api('national',path+`&round=${first.round.id}`)).round.snapshot),frozen);
  assert.equal(ok(await api('national',path)).round.number,2);
  assert.equal((await api('physical',path)).data.round.number,1,'Reviewer only sees assigned rounds');
  ok(await act('national','assign',{assignments:[{pillar:'infrastructure',department:'physical'},{pillar:'sports',department:'academic'}]}));
  if (process.env.UBEC_QA_PAUSE === '1') {
    console.log(JSON.stringify({ email: `national.${marker.toLowerCase()}@ubec.test`, password, planId: plan.id }));
    console.log('Temporary visual QA fixture ready. Press Enter to finish tests and remove it.');
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdin.pause();
  }
  for (const actor of ['physical','academic']) {
    const current = ok(await api(actor,path));
    ok(await act(actor,'feedback',{assignmentId:current.assignments[0].id,recommendation:'endorse',comment:'Revision checked and endorsed'}));
  }
  const ready = ok(await api('national',path));
  const decision = {action:'approve',version:ready.plan.version,roundId:ready.round.id,comment:'All departmental reviews complete.'};
  const results = await Promise.all([api('national',path,decision),api('national',path,decision)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(ok(await api('state',path)).plan.status,'ubec_approved');
  const national = ok(await api('national','/api/ubec/dashboard')).items.find(p=>p.planId===plan.id);
  assert.equal(national.budget,1500); assert.equal(national.schools.length,1); assert.equal(national.status,'approved');
  const departmental = ok(await api('academic','/api/ubec/dashboard')).items.find(p=>p.planId===plan.id);
  assert.equal(departmental.budget,500);
  assert.equal(ok(await api('audit','/api/ubec/dashboard')).items.some(p=>p.planId===plan.id),false);
  assert.deepEqual((await db.query('SELECT id,row_to_json(p)::text AS snapshot FROM action_plans p WHERE id=ANY($1::int[]) ORDER BY id',[original.map(p=>p.id)])).rows,original);
  console.log('PASS: SUBEB-only submission; UBEC routing; department isolation; feedback; return, state reapproval and resubmission; frozen versions; final approval; concurrent protection; real analytics; existing plans preserved.');
} finally {
  const states=[marker,marker+'-FOREIGN',marker+'-NATIONAL'];
  await db.query('DELETE FROM ubec_assignments WHERE round_id IN (SELECT id FROM ubec_rounds WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code=$1))',[marker]);
  for (const table of ['ubec_events','ubec_rounds','plan_notifications','plan_review_events','plan_submissions','infrastructure_lines']) await db.query(`DELETE FROM ${table} WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code=$1)`,[marker]);
  await db.query('DELETE FROM sports_allocations WHERE line_id IN (SELECT id FROM sports_budget_lines WHERE state_code=$1)',[marker]);
  for (const table of ['sports_budget_lines','construction_types','action_plans','schools','users']) await db.query(`DELETE FROM ${table} WHERE state_code=ANY($1::text[])`,[states]);
  await db.end();
}
