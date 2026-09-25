import assert from 'node:assert/strict';
import {Client} from 'pg';
import {hashSync} from 'bcryptjs';
const base=process.env.TEST_BASE_URL||'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const state=`ACT${Date.now()}`,password=crypto.randomUUID(),cookies={},ids=[];let plan,school;
async function api(who,path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookies[who]||''},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function ok(r,status=200){assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const line={workstream:'sbmc',entity:'line',action:'create',activity:0,description:'Community planning session',quantity:2,unitCost:125.25,strategy:'Market survey',targetGroup:'Community level',location:'Rural',equipment:''};
try{
 for(const [who,role,department]of [['social','Data Entry Staff','social'],['academic','Data Entry Staff','academic'],['director','Director','academic'],['chair','Executive Chairman',null],['foreign','Data Entry Staff','academic']]){
  const email=`${who}.${state.toLowerCase()}@test.local`;
  ids.push((await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[`QA ${who}`,email,role,department,who==='foreign'?state+'B':state,hashSync(password,4)])).rows[0].id);
  const r=await api(who,'/api/auth/login',{email,password});ok(r);cookies[who]=r.cookie;
 }
 plan=(await db.query('INSERT INTO action_plans(state_code,start_year,end_year) VALUES($1,2028,2028) RETURNING id',[state])).rows[0].id;
 school=(await db.query("INSERT INTO schools(state_code,name,lga,level,location) VALUES($1,'QA School','QA LGA','Primary','Rural') RETURNING id",[state])).rows[0].id;
 const url=`/api/activities?plan=${plan}&workstream=sbmc`;
 ok(await api('anonymous',url),401);ok(await api('foreign',url),404);
 ok(await api('academic',url,line),403);ok(await api('chair',url,line),403);
 ok(await api('social',url,{...line,quantity:0}),400);ok(await api('social',url,{...line,activity:99}),400);
 ok(await api('social',url,line));let saved=ok(await api('social',url));assert.equal(saved.lines.length,1);
 ok(await api('social',url,{...line,action:'update',id:saved.lines[0].id,quantity:3}));
 const tlm={...line,workstream:'tlm',description:'Textbooks',equipment:'Textbooks'};
 ok(await api('academic',url,{...tlm,equipment:''}),400);ok(await api('academic',url,tlm));
 let review=ok(await api('academic',`/api/plans/review?plan=${plan}`));
 ok(await api('academic',`/api/plans/review?plan=${plan}`,{action:'submit',pillar:'tlm',version:review.plan.version}),400);
 ok(await api('academic',url,{workstream:'tlm',entity:'school',action:'create',schoolId:school}));
 ok(await api('academic',url,{workstream:'tlm',entity:'school',action:'create',schoolId:school}),409);
 review=ok(await api('academic',`/api/plans/review?plan=${plan}`));assert.equal(review.snapshot.tlmDistribution.length,1);assert.equal(review.snapshot.sbmc,undefined);
 ok(await api('academic',`/api/plans/review?plan=${plan}`,{action:'submit',pillar:'tlm',version:review.plan.version}));
 ok(await api('academic',url,tlm),409);
 ok(await api('director',url,{...tlm,description:'Director edit'}));
 const overview=ok(await api('social',`/api/beap?plan=${plan}`));assert.equal(overview.sbmc.budget,375.75);assert.equal(overview.tlm.budget,0);assert.equal(overview.total.budget,375.75);assert.equal(overview.total.schoolCount,0);
 // Read permissions cover direct routes, snapshots, history and leadership.
 for (const who of ['social','director']) {
   ok(await api(who,`/api/infrastructure?plan=${plan}`),403);
 }
 ok(await api('social',`/api/sports?plan=${plan}`),403);
 ok(await api('social',`/api/activities?plan=${plan}&workstream=tlm`),403);
 ok(await api('academic',url),403);
 ok(await api('director',url),403);
 ok(await api('social',`/api/ubec/review?plan=${plan}`),403);
 const scoped=ok(await api('social',`/api/plans/review?plan=${plan}`));
 assert.deepEqual(scoped.visiblePillars,['sbmc']);
 assert.deepEqual(scoped.pillarReviews.map(r=>r.pillar),['sbmc']);
 assert.equal(scoped.snapshot.infrastructure.length,0);
 assert.equal(scoped.snapshot.tlm,undefined);
 assert.equal(scoped.events.length,0);
 assert.equal(scoped.submissions.length,0);
 const directorReview=ok(await api('director',`/api/plans/review?plan=${plan}`));
 assert.deepEqual(directorReview.visiblePillars,['sports','tlm']);
 const submission=directorReview.submissions[0].number;
 ok(await api('social',`/api/plans/review?plan=${plan}&submission=${submission}`),404);
 const historic=ok(await api('director',`/api/plans/review?plan=${plan}&submission=${submission}`));
 assert.equal(historic.snapshot.sbmc,undefined);
 const chairman=ok(await api('chair',`/api/plans/review?plan=${plan}`));
 assert.equal(chairman.visiblePillars.length,4);
 assert.equal(chairman.snapshot.sbmc.length,1);
 assert.equal(chairman.snapshot.tlm.length,2);
 await db.query('UPDATE users SET is_beap_chair=true WHERE id=$1',[ids[2]]);
 const beapChair=ok(await api('director',`/api/plans/review?plan=${plan}`));
 assert.equal(beapChair.visiblePillars.length,4);
 assert.equal(beapChair.snapshot.sbmc.length,1);
 ok(await api('director',url));
 await db.query('UPDATE users SET is_beap_chair=false WHERE id=$1',[ids[2]]);
 const dashboard=ok(await api('social','/api/plans'));assert.equal(dashboard.plans[0].budget,876.75);assert.equal(dashboard.plans[0].schoolCount,1);
 ok(await api('social',url,{...line,action:'delete',id:saved.lines[0].id}));assert.equal(ok(await api('social',url)).lines.length,0);
 console.log('PASS: SBMC/TLM CRUD, validation, department/state isolation, distribution requirement, review locking, Director editing, snapshots and totals.');
}finally{
 if(plan){await db.query('DELETE FROM plan_notifications WHERE plan_id=$1',[plan]);await db.query('DELETE FROM plan_review_events WHERE plan_id=$1',[plan]);await db.query('DELETE FROM plan_submissions WHERE plan_id=$1',[plan]);await db.query('DELETE FROM plan_pillar_reviews WHERE plan_id=$1',[plan]);await db.query('DELETE FROM tlm_distribution WHERE plan_id=$1',[plan]);await db.query('DELETE FROM activity_plan_lines WHERE plan_id=$1',[plan]);await db.query('DELETE FROM action_plans WHERE id=$1',[plan]);}
 if(school)await db.query('DELETE FROM schools WHERE id=$1',[school]);
 await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);await db.end();
}
