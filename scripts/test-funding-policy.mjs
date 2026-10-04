import assert from 'node:assert/strict';
import {Client} from 'pg';
import {hashSync} from 'bcryptjs';
const base=process.env.TEST_BASE_URL||'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const marker=`FP${Date.now()}`,password=crypto.randomUUID(),users={},policyIds=[];
async function api(who,path,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(users[who]?.cookie?{Cookie:users[who].cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
function expect(r,status=200){assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
async function createPlan(year){const form=new FormData();form.set('setup',JSON.stringify({planningYear:year,implementationYear:year,quarters:[1],stateLodgment:'100',otherFunding:'0'}));form.append('rat',new Blob(['%PDF-1.4\n%%EOF']),'assessment.pdf');const r=await fetch(base+'/api/plans',{method:'POST',headers:{Cookie:users.chair.cookie},body:form});return expect({status:r.status,data:await r.json()},201).plan;}
try{
 for(const [key,role,department]of [['es','UBEC Executive Secretary',null],['reviewer','UBEC Department Reviewer','physical'],['chair','Executive Chairman',null],['director','Director','physical'],['officer','Data Entry Staff','physical'],['other','Director','academic']]){
  const email=`${key}.${marker.toLowerCase()}@test.local`;const id=(await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[`Test ${key}`,email,role,department,marker,hashSync(password,4)])).rows[0].id;
  users[key]={id};users[key].cookie=expectLogin(await api(key,'/api/auth/login',{email,password}));
 }
 function expectLogin(r){expect(r);return r.cookie;}
 expect(await api('anonymous','/api/funding-policy'),401);
 const initial=expect(await api('es','/api/funding-policy')).policy;
 for(const role of ['chair','reviewer','officer']) expect(await api(role,'/api/funding-policy',{version:initial.id,allocation:initial.allocation},'PUT'),403);
 expect(await api('es','/api/funding-policy',{version:initial.id,allocation:{...initial.allocation,tlmWithinInfrastructure:10001}},'PUT'),400);
 expect(await api('es','/api/funding-policy',{version:initial.id,allocation:{...initial.allocation,shares:{...initial.allocation.shares,infrastructure:0}}},'PUT'),400);
 const before=await createPlan(2090);assert.equal(before.fundingPolicy.id,initial.id);
 // Save identical allocations: exercise versioning without altering live funding percentages.
 const saved=expect(await api('es','/api/funding-policy',{version:initial.id,allocation:initial.allocation},'PUT')).policy;policyIds.push(saved.id);
 // The retired TLM split (initial rows may carry it) is accepted from older clients but never stored.
 assert.equal(saved.allocation.tlmWithinInfrastructure,undefined);assert.deepEqual(saved.allocation.shares,initial.allocation.shares);
 expect(await api('es','/api/funding-policy',{version:initial.id,allocation:initial.allocation},'PUT'),409);
 const after=await createPlan(2091);assert.equal(after.fundingPolicy.id,saved.id);
 const persisted=(await db.query('SELECT funding_policy_id FROM action_plans WHERE id=$1',[before.id])).rows[0];assert.equal(persisted.funding_policy_id,initial.id);
 const actions=async who=>expect(await api(who,'/api/plans')).plans.find(p=>p.id===before.id).pendingActions;
 assert.equal((await actions('officer')).length,1);assert.equal((await actions('director')).length,0);
 await db.query("INSERT INTO plan_pillar_reviews(plan_id,pillar,status) VALUES($1,'infrastructure','director_review'),($1,'sports','draft') ON CONFLICT(plan_id,pillar) DO UPDATE SET status=EXCLUDED.status",[before.id]);
 assert.equal((await actions('director')).length,1);assert.equal((await actions('officer')).length,0);assert.equal((await actions('other')).length,0);
 await db.query("UPDATE plan_pillar_reviews SET status='changes_requested' WHERE plan_id=$1 AND pillar='infrastructure'",[before.id]);
 assert.match((await actions('officer'))[0].label,/Address feedback/);
 await db.query("UPDATE plan_pillar_reviews SET status='chairman_ready' WHERE plan_id=$1",[before.id]);
 assert.equal((await actions('chair')).length,1);
 await db.query("UPDATE action_plans SET status='submitted_ubec' WHERE id=$1",[before.id]);
 for(const who of ['officer','director','chair'])assert.equal((await actions(who)).length,0);
 console.log('PASS: allocation authorization, total/split validation, stale save protection, version pinning, and department-specific dashboard actions.');
}finally{
 await db.query('DELETE FROM plan_pillar_reviews WHERE plan_id IN (SELECT id FROM action_plans WHERE state_code=$1)',[marker]);
 await db.query('DELETE FROM action_plans WHERE state_code=$1',[marker]);
 await db.query('DELETE FROM funding_policies fp WHERE id=ANY($1::int[]) AND NOT EXISTS(SELECT 1 FROM action_plans p WHERE p.funding_policy_id=fp.id)',[policyIds]);
 await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])',[Object.values(users).map(u=>u.id)]);
 await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[Object.values(users).map(u=>u.id)]);
 await db.end();console.log('Removed isolated test accounts, plans and unused test allocation versions.');
}
