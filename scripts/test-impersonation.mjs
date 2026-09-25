import assert from 'node:assert/strict';
import {Client} from 'pg';
import {hashSync} from 'bcryptjs';
const base=process.env.TEST_BASE_URL||'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const marker=`IMP${Date.now()}`,password=crypto.randomUUID(),users={},jars={};
async function api(who,path,body,method=body?'POST':'GET',origin=base){
 const jar=jars[who]??={};
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,Cookie:Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
 for(const cookie of r.headers.getSetCookie()){const first=cookie.split(';')[0],i=first.indexOf('=');jar[first.slice(0,i)]=first.slice(i+1);}
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}return {status:r.status,data};
}
function expect(r,status=200){assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const start=(who,target)=>api(who,'/api/admin/impersonation',{action:'start',userId:users[target].id});
const stop=who=>api(who,'/api/admin/impersonation',{action:'stop'});
async function login(who){return expect(await api(who,'/api/auth/login',{email:users[who].email,password}));}
try{
 for(const [key,role,department,state]of [['admin','Super Admin',null,'ADMIN'],['admin2','Super Admin',null,'ADMIN'],['officer','Data Entry Staff','physical',marker],['director','Director','physical',marker],['chair','Executive Chairman',null,marker],['es','UBEC Executive Secretary',null,'UBEC'],['reviewer','UBEC Department Reviewer','academic','UBEC'],['foreign','Data Entry Staff','academic',marker+'B']]){
  const email=`${key}.${marker.toLowerCase()}@test.local`;
  const id=(await db.query('INSERT INTO users(email,full_name,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[email,`QA ${key}`,role,department,state,hashSync(password,4)])).rows[0].id;users[key]={id,email,role,state};
  const result=await login(key);assert.equal(result.destination,role==='Super Admin'?'/admin':role.startsWith('UBEC ')?'/ubec':'/dashboard');
 }
 expect(await api('anonymous','/api/admin/impersonation'),401);
 for(const key of ['officer','director','chair','es','reviewer']){expect(await api(key,'/api/admin/impersonation'),403);expect(await start(key,'officer'),403);expect(await stop(key),403);}
 expect(await api('admin','/api/admin/impersonation',{action:'start',userId:users.officer.id},'POST','https://evil.example'),403);
 expect(await start('admin','admin2'),404);
 await db.query('UPDATE users SET active=FALSE WHERE id=$1',[users.foreign.id]);expect(await start('admin','foreign'),404);
 const listed=expect(await api('admin','/api/admin/impersonation'));assert.ok(listed.users.every(u=>!('password_hash' in u)));assert.ok(!listed.users.some(u=>u.role==='Super Admin'));
 const rootCookie=jars.admin.ubec_session;
 expect(await start('admin','officer'));assert.equal(jars.admin.ubec_session,rootCookie);
 const firstId=jars.admin.ubec_impersonation;
 let session=expect(await api('admin','/api/auth/session')).user;assert.equal(session.email,users.officer.email);assert.equal(session.stateCode,marker);assert.equal(session.department,'physical');assert.equal(session.impersonation.adminName,'QA admin');
 expect(await api('admin','/api/users'),403);
 expect(await api('admin','/api/funding-policy',{version:1,allocation:{}},'PUT'),403);
 assert.ok((await db.query('SELECT id FROM impersonation_requests WHERE impersonation_id=$1',[firstId])).rowCount>0);
 // A copied impersonation identifier must not work for another administrator.
 jars.admin2.ubec_impersonation=firstId;expect(await api('admin2','/api/auth/session'),401);expect(await stop('admin2'));
 expect(await start('admin','director'));assert.equal(expect(await api('admin','/api/auth/session')).user.role,'Director');assert.equal((await db.query('SELECT end_reason FROM impersonation_sessions WHERE id=$1',[firstId])).rows[0].end_reason,'switched_user');
 // Revoking the target's sessions invalidates impersonation, but admin can still return.
 await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[users.director.id]);expect(await api('admin','/api/auth/session'),401);expect(await stop('admin'));assert.equal(expect(await api('admin','/api/auth/session')).user.role,'Super Admin');
 for(const target of ['chair','es','reviewer']){expect(await start('admin',target));assert.equal(expect(await api('admin','/api/auth/session')).user.role,users[target].role);expect(await stop('admin'));}
 expect(await start('admin','officer'));await db.query("UPDATE impersonation_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[jars.admin.ubec_impersonation]);expect(await api('admin','/api/auth/session'),401);expect(await stop('admin'));
 expect(await start('admin','officer'));const oldImpersonation=jars.admin.ubec_impersonation;expect(await stop('admin'));jars.admin.ubec_impersonation=oldImpersonation;expect(await api('admin','/api/auth/session'),401);expect(await stop('admin'));
 expect(await start('admin','officer'));await db.query('UPDATE users SET active=FALSE WHERE id=$1',[users.admin.id]);expect(await api('admin','/api/auth/session'),401);expect(await start('admin','es'),401);await db.query('UPDATE users SET active=TRUE WHERE id=$1',[users.admin.id]);
 const replay={...jars.admin};expect(await api('admin','/api/auth/logout',{}));jars.admin=replay;expect(await api('admin','/api/auth/session'),401);expect(await api('admin','/api/admin/impersonation'),401);
 console.log('PASS: admin-only switching, original identity, role/state/department preservation, audit, CSRF, disabled users, expiry, revocation, cookie binding, return and logout replay protection.');
}finally{
 const ids=Object.values(users).map(u=>u.id);
 await db.query('DELETE FROM impersonation_requests WHERE impersonation_id IN (SELECT id FROM impersonation_sessions WHERE actor_id=ANY($1::int[]))',[ids]);
 await db.query('DELETE FROM impersonation_sessions WHERE actor_id=ANY($1::int[])',[ids]);
 await db.query('DELETE FROM sessions WHERE user_id=ANY($1::int[])',[ids]);
 await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);await db.end();console.log('Removed isolated impersonation test fixtures.');
}
