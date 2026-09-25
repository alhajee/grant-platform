import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base=process.env.TEST_BASE_URL || 'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Client({connectionString:process.env.DATABASE_URL});
const marker=`PS${Date.now()}`, ids=[], cookies={};
const states=[marker,`${marker}B`];
const password=crypto.randomUUID();
const setup={planningYear:2029,implementationYear:2030,quarters:[1,2],stateLodgment:'100.25',otherFunding:'0.11'};
const pdf='%PDF-1.4\n%%EOF';
async function create(input=setup,files=[new Blob([pdf])]) {
  const body=new FormData();body.set('setup',JSON.stringify(input));
  files.forEach(f=>body.append('rat',f,'assessment.pdf'));
  const r=await fetch(base+'/api/plans',{method:'POST',headers:{Cookie:cookies.chair},body});
  return {status:r.status,data:await r.json()};
}
function expect(r,status) {assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
await db.connect();
try {
  for(const [who,role,state] of [['chair','Executive Chairman',marker],['foreign','Executive Chairman',states[1]],['ubec','UBEC Executive Secretary',states[1]]]) {
    const email=`${who}.${marker.toLowerCase()}@test.local`;
    const row=await db.query('INSERT INTO users(full_name,email,role,state_code,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[`QA ${who}`,email,role,state,hashSync(password,4)]);ids.push(row.rows[0].id);
    const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(r.status,200);cookies[who]=r.headers.get('set-cookie').split(';')[0];
  }
  for(const change of [{quarters:[]},{quarters:[1,1]},{quarters:[5]},{implementationYear:2028},{stateLodgment:'-1'},{otherFunding:'1.001'},{stateLodgment:'0',otherFunding:'0'},{stateCode:'YO'},{fundingTotal:'900'}]) expect(await create({...setup,...change}),400);
  expect(await create(setup,[]),400);
  expect(await create(setup,[new Blob(['not a pdf'])]),400);
  expect(await create(setup,[new Blob([new Uint8Array(5*1024*1024+1)])]),400);
  const plan=expect(await create(),201).plan;
  assert.deepEqual(plan.fundingQuarters,[1,2]);assert.equal(plan.fundingTotal,'200.61');assert.equal(plan.implementationYear,2030);assert.equal(plan.documents.length,1);
  expect(await create({...setup,quarters:[2,3]}),409);
  expect(await create({...setup,quarters:[3]}),201);
  const race=await Promise.all([create({...setup,quarters:[4]}),create({...setup,quarters:[4]})]);
  assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
  const url=base+'/api/plans/documents?id='+plan.documents[0].id;
  for(const [who,status] of [['chair',200],['foreign',404],['ubec',404],['anonymous',401]]) {const r=await fetch(url,{headers:cookies[who]?{Cookie:cookies[who]}:{}});assert.equal(r.status,status);if(status===200)assert.equal(await r.text(),pdf);}
  const review=await fetch(`${base}/api/plans/review?plan=${plan.id}`,{headers:{Cookie:cookies.chair}});assert.equal(review.status,200);assert.equal((await review.json()).snapshot.setup.fundingTotal,'200.61');
  const count=(await db.query('SELECT count(*)::int n FROM action_plans WHERE state_code=$1',[marker])).rows[0].n;assert.equal(count,3);
  console.log('PASS: setup validation, exact funding calculation, required/file-size checks, disjoint quarters, partial and concurrent conflicts, private downloads and review metadata.');
} finally {
  await db.query('DELETE FROM action_plans WHERE state_code=ANY($1::text[])',[states]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])',[ids]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);
  await db.end();console.log('Removed isolated setup test records.');
}
