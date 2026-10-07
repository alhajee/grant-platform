import assert from 'node:assert/strict';
import {Client} from 'pg';
import {hashSync} from 'bcryptjs';
const base=process.env.TEST_BASE_URL||'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const state=`ACT${Date.now()}`,password=crypto.randomUUID(),cookies={},ids=[];let plan,school,school2;
async function api(who,path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookies[who]||''},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function ok(r,status=200){assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
const line={workstream:'sbmc',entity:'line',action:'create',activity:0,description:'Community planning session',rationale:'Improve community participation',implementationApproach:'Facilitated school workshops',quantity:2,unitCost:125.25,strategy:'NCB',targetGroup:'Community level',equipment:''};
try{
 for(const [who,role,department]of [['social','Data Entry Staff','social'],['socialDirector','Director','social'],['academic','Data Entry Staff','academic'],['director','Director','academic'],['chair','Executive Chairman',null],['foreign','Data Entry Staff','academic']]){
  const email=`${who.toLowerCase()}.${state.toLowerCase()}@test.local`;
  ids.push((await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[`QA ${who}`,email,role,department,who==='foreign'?state+'B':state,hashSync(password,4)])).rows[0].id);
  if(department)await db.query('INSERT INTO user_departments(user_id,department) VALUES($1,$2)',[ids.at(-1),department]);
  const r=await api(who,'/api/auth/login',{email,password});ok(r);cookies[who]=r.cookie;
 }
 plan=(await db.query('INSERT INTO action_plans(state_code,start_year,end_year,state_lodgment,other_funding) VALUES($1,2028,2028,3757.50,0) RETURNING id',[state])).rows[0].id;
 school=(await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'QA School','QA LGA','Primary','Rural',60,40) RETURNING id",[state])).rows[0].id;
 school2=(await db.query("INSERT INTO schools(state_code,name,lga,level,location) VALUES($1,'QA School Two','QA LGA','Primary','Urban') RETURNING id",[state])).rows[0].id;
 const url=`/api/activities?plan=${plan}&workstream=sbmc`;
 ok(await api('anonymous',url),401);ok(await api('foreign',url),404);
 ok(await api('academic',url,line),403);ok(await api('chair',url,line),403);
 ok(await api('social',url,{...line,quantity:0}),400);ok(await api('social',url,{...line,activity:99}),400);
 ok(await api('social',url,{...line,activity:17}),400);
 ok(await api('social',url,{...line,location:'Remote'}),400);
 ok(await api('social',url,line));let saved=ok(await api('social',url));assert.equal(saved.lines.length,1);assert.equal(saved.lines[0].location,'');
 assert.equal(saved.lines[0].rationale,line.rationale);assert.equal(saved.lines[0].implementationApproach,line.implementationApproach);
 ok(await api('social',url,{...line,rationale:''}),400);
 ok(await api('social',url,{...line,implementationApproach:''}),400);
 const over=await api('social',url,line);ok(over,400);assert.match(over.data.error,/₦125.25/);
 const underReview=ok(await api('social',`/api/plans/review?plan=${plan}`));
 const under=await api('social',`/api/plans/review?plan=${plan}`,{action:'submit',pillar:'sbmc',version:underReview.plan.version});ok(under,400);assert.match(under.data.error,/₦125.25/);
 ok(await api('social',url,{...line,action:'update',id:saved.lines[0].id,quantity:4}),400);
 ok(await api('social',url,{...line,action:'update',id:saved.lines[0].id,quantity:3,activity:3}));
 const tlmUrl=`/api/activities?plan=${plan}&workstream=tlm`;
 const tlm={...line,workstream:'tlm',activity:5,description:'Textbooks',textbookClasses:['Primary 1','Primary 2'],textbookSubject:'English/literacy (Core)'};
 for(const [field,value] of [['description',''],['quantity',0],['unitCost',0],['strategy',''],['targetGroup',''],['activity',0],['activity',23],['equipment','Textbooks']]) ok(await api('academic',tlmUrl,{...tlm,[field]:value}),400);
 ok(await api('academic',tlmUrl,{...tlm,textbookClasses:[]}),400);
 ok(await api('academic',tlmUrl,{...tlm,textbookSubject:''}),400);
 ok(await api('academic',tlmUrl,tlm));
 const savedTlm=ok(await api('academic',tlmUrl));assert.deepEqual(savedTlm.lines[0].textbookClasses,tlm.textbookClasses);assert.equal(savedTlm.lines[0].textbookSubject,tlm.textbookSubject);
 ok(await api('academic',tlmUrl,{...tlm,activity:6}),400);
 const otherTlm={...tlm,activity:22,customActivity:'Develop local reading kits',textbookClasses:[],textbookSubject:''};
 ok(await api('academic',tlmUrl,{...otherTlm,customActivity:''}),400);ok(await api('academic',tlmUrl,otherTlm));
 const withOther=ok(await api('academic',tlmUrl));const otherSaved=withOther.lines.find(item=>item.customActivity===otherTlm.customActivity);assert.ok(otherSaved);ok(await api('academic',tlmUrl,{workstream:'tlm',entity:'line',action:'delete',id:otherSaved.id}));
 let review=ok(await api('academic',`/api/plans/review?plan=${plan}`));
 assert.deepEqual(review.snapshot.tlm[0].textbook_classes,tlm.textbookClasses);assert.equal(review.snapshot.tlm[0].textbook_subject,tlm.textbookSubject);
 ok(await api('academic',`/api/plans/review?plan=${plan}`,{action:'submit',pillar:'tlm',version:review.plan.version}),400);
 ok(await api('academic',tlmUrl,{workstream:'tlm',entity:'school',action:'create',schoolId:school}));
 ok(await api('academic',tlmUrl,{workstream:'tlm',entity:'school',action:'create',schoolId:school}),409);
 // Bulk add skips schools already listed; renovated whole-school packages are reported for the distribution list.
 ok(await api('academic',tlmUrl,{workstream:'tlm',entity:'school',action:'create',schoolIds:[school,999999999]}),404);
 const bulk=ok(await api('academic',tlmUrl,{workstream:'tlm',entity:'school',action:'create',schoolIds:[school,school2,school2]}));assert.equal(bulk.added,1);assert.equal(bulk.skipped,1);
 await db.query("INSERT INTO infrastructure_packages(plan_id,school_id,kind,input,result,total_cost) VALUES($1,$2,'whole','{}','{}',0)",[plan,school2]);
 const listed=ok(await api('academic',tlmUrl));assert.deepEqual(listed.renovated,[school2]);assert.equal(listed.distribution.length,2);assert.equal(listed.distribution.find(s=>s.id===school).enrolment,100);
 await db.query('DELETE FROM infrastructure_packages WHERE plan_id=$1',[plan]);
 ok(await api('academic',tlmUrl,{workstream:'tlm',entity:'school',action:'delete',id:school2}));
 review=ok(await api('academic',`/api/plans/review?plan=${plan}`));assert.equal(review.snapshot.tlmDistribution.length,1);assert.equal(review.snapshot.sbmc,undefined);
 ok(await api('academic',`/api/plans/review?plan=${plan}`,{action:'submit',pillar:'tlm',version:review.plan.version}));
 ok(await api('academic',tlmUrl,tlm),409);
 ok(await api('director',tlmUrl,{...tlm,activity:7,description:'Director edit',textbookClasses:[],textbookSubject:''}));
 const overview=ok(await api('social',`/api/beap?plan=${plan}`));assert.equal(overview.sbmc.budget,375.75);assert.equal(overview.tlm.budget,0);assert.equal(overview.total.budget,375.75);assert.equal(overview.total.schoolCount,0);
 // Read permissions cover direct routes, snapshots, history and leadership.
 for (const who of ['social','director']) {
   ok(await api(who,`/api/infrastructure/packages?plan=${plan}`),403);
 }
 ok(await api('social',`/api/sports?plan=${plan}`),403);
 ok(await api('social',`/api/activities?plan=${plan}&workstream=tlm`),403);
 ok(await api('academic',url),403);
 ok(await api('director',url),403);
 ok(await api('social',`/api/ubec/review?plan=${plan}`),403);
 const scoped=ok(await api('social',`/api/plans/review?plan=${plan}`));
 assert.deepEqual(scoped.visiblePillars,['sbmc']);
 assert.deepEqual(scoped.pillarReviews.map(r=>r.pillar),['sbmc']);
 assert.equal(scoped.snapshot.sbmc[0].activity,3);
 assert.equal(scoped.snapshot.infrastructure.length,0);
 assert.equal(scoped.snapshot.tlm,undefined);
 assert.equal(scoped.events.length,0);
 assert.equal(scoped.submissions.length,0);
 const directorReview=ok(await api('director',`/api/plans/review?plan=${plan}`));
 // Stage-gated visibility: the Academic Director sees only TLM, the one Academic component sent to them; the rest show their status only.
 assert.deepEqual(directorReview.visiblePillars,['tlm']);
 assert.deepEqual(directorReview.pillarReviews.map(r=>r.pillar),['sports','tlm','gscci','curriculum']);
 const submission=directorReview.submissions[0].number;
 ok(await api('social',`/api/plans/review?plan=${plan}&submission=${submission}`),404);
 const historic=ok(await api('director',`/api/plans/review?plan=${plan}&submission=${submission}`));
 assert.equal(historic.snapshot.sbmc,undefined);
 // Nothing has reached the Executive Chairman yet: every status, no details.
 const chairman=ok(await api('chair',`/api/plans/review?plan=${plan}`));
 assert.equal(chairman.visiblePillars.length,0);
 assert.equal(chairman.pillarReviews.length,11);
 assert.equal(chairman.snapshot.sbmc,undefined);
 assert.equal(chairman.snapshot.tlm,undefined);
 // As BEAP Chair, the Academic Director still sees their own department's TLM (sent to its Director), not the SBMC draft.
 await db.query('UPDATE users SET is_beap_chair=true WHERE id=$1',[ids[3]]);
 const beapChair=ok(await api('director',`/api/plans/review?plan=${plan}`));
 assert.deepEqual(beapChair.visiblePillars,['tlm']);
 assert.equal(beapChair.pillarReviews.length,11);
 assert.equal(beapChair.snapshot.sbmc,undefined);
 ok(await api('director',url),403);
 await db.query('UPDATE users SET is_beap_chair=false WHERE id=$1',[ids[3]]);
 // The dashboard counts only components whose details reach the viewer: SBMC for its Data Entry Staff, TLM for its Director.
 const dashboard=ok(await api('social','/api/plans'));assert.equal(dashboard.plans[0].budget,375.75);assert.equal(dashboard.plans[0].schoolCount,0);
 const academicDashboard=ok(await api('director','/api/plans'));assert.equal(academicDashboard.plans[0].budget,501);assert.equal(academicDashboard.plans[0].schoolCount,1);
 const exactReview=ok(await api('social',`/api/plans/review?plan=${plan}`));
 ok(await api('social',`/api/plans/review?plan=${plan}`,{action:'submit',pillar:'sbmc',version:exactReview.plan.version}));
 ok(await api('social',url,{...line,action:'delete',id:saved.lines[0].id}),409);
 console.log('PASS: SBMC/TLM CRUD, validation, department/state isolation, distribution requirement, review locking, Director editing, snapshots and totals.');
}finally{
 if(plan){await db.query('DELETE FROM plan_notifications WHERE plan_id=$1',[plan]);await db.query('DELETE FROM plan_review_events WHERE plan_id=$1',[plan]);await db.query('DELETE FROM plan_submissions WHERE plan_id=$1',[plan]);await db.query('DELETE FROM plan_pillar_reviews WHERE plan_id=$1',[plan]);await db.query('DELETE FROM tlm_distribution WHERE plan_id=$1',[plan]);await db.query('DELETE FROM activity_plan_lines WHERE plan_id=$1',[plan]);await db.query('DELETE FROM action_plans WHERE id=$1',[plan]);}
 if(plan)await db.query('DELETE FROM infrastructure_packages WHERE plan_id=$1',[plan]);
 for(const id of [school,school2])if(id)await db.query('DELETE FROM schools WHERE id=$1',[id]);
 await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[ids]);await db.end();
}
