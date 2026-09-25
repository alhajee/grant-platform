import assert from 'node:assert/strict';
import { Client } from 'pg';
import { hashSync } from 'bcryptjs';

const base = process.env.TEST_BASE_URL || 'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db = new Client({connectionString:process.env.DATABASE_URL});
const marker = `PC${Date.now()}`, states = [marker,`${marker}B`];
const accounts = {}, password = crypto.randomUUID();
async function api(who,path,body,method=body?'POST':'GET') {
  const r = await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(accounts[who]?.cookie?{Cookie:accounts[who].cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
function ok(result,status=200) {assert.equal(result.status,status,JSON.stringify(result.data));return result.data;}
async function login(who) {const r=await api(who,'/api/auth/login',{email:accounts[who].email,password});ok(r);accounts[who].cookie=r.cookie;}
const profile=who=>({id:accounts[who].id,name:`QA ${who}`,role:accounts[who].role,department:'physical',active:true});
const createPlan=async (who,year=2026)=>{
  const body=new FormData();
  body.set('setup',JSON.stringify({planningYear:year,implementationYear:year,quarters:[1],stateLodgment:'100.25',otherFunding:'0'}));
  body.append('rat',new Blob(['%PDF-1.4\n%%EOF']), 'assessment.pdf');
  const response=await fetch(base+'/api/plans',{method:'POST',headers:accounts[who]?.cookie?{Cookie:accounts[who].cookie}:{},body});
  return {status:response.status,data:await response.json()};
};
await db.connect();
try {
  for(const [who,role,state] of [['chair','Executive Chairman',marker],['director','Director',marker],['officer','Data Entry Staff',marker],['foreign','Executive Chairman',states[1]],['ubec','UBEC Executive Secretary',states[1]]]) {
    const email=`${who}.${marker.toLowerCase()}@test.local`;
    const id=(await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[`QA ${who}`,email,role,['director','officer'].includes(who)?'physical':null,state,hashSync(password,4)])).rows[0].id;
    accounts[who]={id,email,role};await login(who);
  }
  ok(await createPlan('anonymous'),401);
  for(const who of ['director','officer','ubec']) {ok(await createPlan(who),403);assert.equal(ok(await api(who,'/api/plans')).canCreatePlan,false);}
  assert.equal(ok(await api('chair','/api/plans')).canCreatePlan,true);
  ok(await api('officer','/api/infrastructure?plan=2147483647'),404);
  const plan=ok(await createPlan('chair'),201).plan;
  assert.equal(ok(await api('officer',`/api/infrastructure?plan=${plan.id}`)).canEdit,true);
  ok(await createPlan('chair'),409);
  ok(await api('director','/api/users',{...profile('officer'),isBeapChair:true},'PATCH'),403);
  ok(await api('foreign','/api/users',{...profile('director'),isBeapChair:true},'PATCH'),404);
  ok(await api('chair','/api/users',{...profile('officer'),isBeapChair:true},'PATCH'),400);
  ok(await api('chair','/api/users',{...profile('director'),isBeapChair:true,canCreatePlan:false},'PATCH'));
  ok(await createPlan('director'),401);
  await login('director');
  assert.equal(ok(await api('director','/api/plans')).canCreatePlan,true);
  ok(await createPlan('director',2031),201);
  const second=ok(await api('chair','/api/users',{name:'QA second',email:`second.${marker.toLowerCase()}@test.local`,role:'Director',department:'academic',active:true}),201);
  accounts.second={id:second.id,role:'Director'};
  ok(await api('chair','/api/users',{id:second.id,name:'QA second',role:'Director',department:'academic',active:true,isBeapChair:true},'PATCH'),409);
  ok(await api('chair','/api/users',{...profile('director'),isBeapChair:false},'PATCH'));
  await login('director');ok(await createPlan('director',2032),403);
  ok(await api('foreign','/api/users',{...profile('director'),canCreatePlan:true},'PATCH'),404);
  ok(await api('director','/api/users',{...profile('officer'),canCreatePlan:true},'PATCH'),403);
  ok(await api('chair','/api/users',{...profile('director'),canCreatePlan:true},'PATCH'));
  ok(await createPlan('director'),401); // Permission edits invalidate old sessions.
  await login('director');
  assert.equal(ok(await api('director','/api/plans')).canCreatePlan,true);
  const delegated=ok(await createPlan('director',2027),201).plan;
  ok(await api('foreign',`/api/infrastructure?plan=${delegated.id}`),404);
  ok(await api('director','/api/users',{...profile('officer'),canCreatePlan:true},'PATCH'),403);
  ok(await api('chair','/api/users',{...profile('officer'),canCreatePlan:true},'PATCH'));
  await login('officer');
  ok(await createPlan('officer',2028),201);
  ok(await api('director','/api/users',profile('officer'),'PATCH'));
  assert.equal((await db.query('SELECT can_create_plan FROM users WHERE id=$1',[accounts.officer.id])).rows[0].can_create_plan,true);
  ok(await api('chair','/api/users',{...profile('director'),canCreatePlan:false},'PATCH'));
  ok(await createPlan('director'),401);await login('director');ok(await createPlan('director'),403);
  assert.equal(ok(await api('director','/api/plans')).canCreatePlan,false);
  ok(await api('chair','/api/users',{...profile('officer'),active:false,canCreatePlan:true},'PATCH'));
  ok(await createPlan('officer'),401);
  assert.ok((await db.query("SELECT id FROM user_management_events WHERE state_code=$1 AND details->>'canCreatePlan'='true'",[marker])).rowCount>=2);
  console.log('PASS: Chairman creation, default denial, same-state delegation, revocation, inactive/stale sessions, no re-delegation, audit, existing-plan access and duplicate protection.');
} finally {
  await db.query('DELETE FROM user_management_events WHERE state_code=ANY($1::text[])',[states]);
  await db.query('DELETE FROM action_plans WHERE state_code=ANY($1::text[])',[states]);
  await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])',[Object.values(accounts).map(a=>a.id)]);
  await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[Object.values(accounts).map(a=>a.id)]);
  await db.end();
  console.log('Removed isolated test accounts and plans.');
}
