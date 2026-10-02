import assert from 'node:assert/strict';
import {Client} from 'pg';
import {hashSync} from 'bcryptjs';
import {packageSchema,calculateInfrastructure} from '../lib/infrastructure-model.ts';
const base=process.env.TEST_BASE_URL||'http://localhost:5174';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
const marker='INF'+Date.now(),password=crypto.randomUUID(),cookies={},users=[];let plan,school,secondSchool;
async function api(who,path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookies[who]||'',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function ok(r,status=200){assert.equal(r.status,status,JSON.stringify(r.data));return r.data;}
try{
 for(const [who,role,department]of [['officer','Data Entry Staff','physical'],['director','Director','physical'],['social','Data Entry Staff','social'],['chair','Executive Chairman',null]]){
  const email=`${who}.${marker.toLowerCase()}@test.local`;users.push((await db.query('INSERT INTO users(full_name,email,role,department,state_code,password_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[who,email,role,department,marker,hashSync(password,4)])).rows[0].id);
  const r=await api(who,'/api/auth/login',{email,password});ok(r);cookies[who]=r.cookie;
 }
 plan=(await db.query('INSERT INTO action_plans(state_code,start_year,end_year) VALUES($1,2028,2028) RETURNING id',[marker])).rows[0].id;
 school=(await db.query("INSERT INTO schools(state_code,name,lga,level,location,enrolment_male,enrolment_female) VALUES($1,'Infrastructure QA','QA','Primary','Rural',100,100) RETURNING id",[marker])).rows[0].id;
 const path=`/api/infrastructure/packages?plan=${plan}`,reviewPath=`/api/plans/review?plan=${plan}`;
 ok(await api('anonymous',path),401);ok(await api('social',path),403);
 const landIds=[];for(let i=0;i<2;i++){const f=new FormData();f.set('kind','land');f.set('schoolId',String(school));f.set('file',new File(['%PDF-1.4\nQA\n%%EOF'],`land-${i}.pdf`,{type:'application/pdf'}));landIds.push(ok(await api('officer',`/api/infrastructure/documents?plan=${plan}`,f)).id);}
 const input=packageSchema.parse({kind:'new',schoolId:school,components:['Primary','ECCDE'],targeting:'hope',lumpSum:1000,duration:'6 months',land:{available:true,documented:true,unencumbered:false},documentIds:landIds});
 ok(await api('social',path,{action:'save',input}),403);
 ok(await api('officer',path,{action:'save',input:{...input,land:{available:false,documented:false,unencumbered:false}}}),400);
 const fewerLand=await api('officer',path,{action:'save',input:{...input,land:{available:true,documented:true,unencumbered:true}}});ok(fewerLand,400);assert.match(fewerLand.data.error,/3 ticked, 2 attached/);
 ok(await api('officer',path,{action:'save',input}));let current=ok(await api('officer',path));const project=current.packages[0];assert.equal(Number(project.total_cost),1000);assert.equal(project.input.targeting,'nonhope','HOPE targeting is retired on save');
 ok(await api('officer',path,{action:'save',id:project.id,version:999,input}),409);
 ok(await api('officer',path,{action:'profile',schoolId:school,profile:{male:200,female:200,latitude:'12',longitude:'10'}}),400);
 const lockedProfile=(await db.query('SELECT enrolment_male,enrolment_female FROM schools WHERE id=$1',[school])).rows[0];
 assert.deepEqual([lockedProfile.enrolment_male,lockedProfile.enrolment_female],[100,100],'School details are edited only in the School register');
 await db.query('UPDATE schools SET enrolment_male=200,enrolment_female=200 WHERE id=$1',[school]);
 let review=ok(await api('officer',reviewPath));assert.equal(review.snapshot.infrastructure[0].package.result.enrolment,200,'Stored package retains original enrolment');
 ok(await api('officer',reviewPath,{action:'submit',pillar:'infrastructure',version:review.plan.version}),400);
 const docs=[];
 async function upload(kind){const f=new FormData();f.set('kind',kind);if(kind!=='drawings')f.set('schoolId',String(school));f.set('file',new File(['%PDF-1.4\nQA\n%%EOF'],kind+'.pdf',{type:'application/pdf'}));const d=ok(await api('officer',`/api/infrastructure/documents?plan=${plan}`,f));assert.equal(d.schoolId,kind==='drawings'?null:school);docs.push(d.id);return d;}
 for(const kind of ['drawings','boq','survey'])await upload(kind);
 secondSchool=(await db.query("INSERT INTO schools(state_code,name,lga,level,location) VALUES($1,'Second school','QA','Primary','Rural') RETURNING id",[marker])).rows[0].id;
 await db.query('UPDATE schools SET enrolment_male=150,enrolment_female=100 WHERE id=$1',[secondSchool]);
 const furniture=packageSchema.parse({kind:'furniture',schoolId:secondSchool,components:['Primary'],furniture:[{description:'Desks',quantity:1,cost:100}]});
 ok(await api('officer',path,{action:'save',input:{...furniture,documentIds:[docs[1]]}}),400);
 ok(await api('officer',path,{action:'save',input:furniture}));
 review=ok(await api('officer',reviewPath));const missing=await api('officer',reviewPath,{action:'submit',pillar:'infrastructure',version:review.plan.version});ok(missing,400);assert.match(missing.data.error,/Second school/);
 const schoolDocument=new FormData();schoolDocument.set('kind','boq');schoolDocument.set('file',new File(['%PDF-1.4\nQA\n%%EOF'],'boq.pdf',{type:'application/pdf'}));
 ok(await api('officer',`/api/infrastructure/documents?plan=${plan}`,schoolDocument),400);
 schoolDocument.set('schoolId','2147483647');ok(await api('officer',`/api/infrastructure/documents?plan=${plan}`,schoolDocument),404);
 schoolDocument.set('schoolId',String(secondSchool));docs.push(ok(await api('officer',`/api/infrastructure/documents?plan=${plan}`,schoolDocument)).id);
 // A furniture-only school does not need a survey. Remove this disposable package
 // after asserting the shared readiness rule against its live snapshot.
 const {infrastructureDocumentProblem}=await import('../lib/infrastructure-documents.ts');
 review=ok(await api('officer',reviewPath));assert.equal(infrastructureDocumentProblem(review.snapshot),null);
 const furnitureRecord=ok(await api('officer',path)).packages.find(p=>p.school_id===secondSchool);
 ok(await api('officer',path,{action:'delete',id:furnitureRecord.id,version:furnitureRecord.version}));
 ok(await api('social','/api/infrastructure/documents?id='+docs[0]),404);ok(await api('chair','/api/infrastructure/documents?id='+docs[0]));
 const whole=packageSchema.parse({kind:'whole',schoolId:school,components:['Primary'],documentIds:[docs[1]]});
 for(const i of calculateInfrastructure(whole,400).items)whole.packageCosts[i.key]={cost:1,strategy:'NCB',duration:'8 weeks'};
 ok(await api('officer',path,{action:'save',input:whole}));current=ok(await api('officer',path));const assessment=current.packages.find(p=>p.kind==='whole');
 ok(await api('officer',path,{action:'save',id:assessment.id,version:assessment.version,input:whole}),400);
 const updatedBoq=await upload('boq');whole.documentIds.push(updatedBoq.id);
 ok(await api('officer',path,{action:'save',id:assessment.id,version:assessment.version,input:whole}));
 const overview=ok(await api('officer','/api/beap?plan='+plan));assert.equal(overview.infrastructure.budget,1000+calculateInfrastructure(whole,400).total);
 const dashboard=ok(await api('officer','/api/plans'));assert.equal(dashboard.plans[0].budget,overview.infrastructure.budget);assert.equal(dashboard.targetedSchools,1);
 review=ok(await api('officer',reviewPath));ok(await api('officer',reviewPath,{action:'submit',pillar:'infrastructure',version:review.plan.version}));
 ok(await api('officer',path,{action:'save',input}),409);ok(await api('director',path,{action:'save',input}));
 const scoped=ok(await api('social',reviewPath));assert.equal(scoped.snapshot.infrastructure.length,0);assert.equal(scoped.snapshot.infrastructureDocuments,undefined);
 review=ok(await api('director',reviewPath));const historical=ok(await api('director',reviewPath+'&submission='+review.submissions[0].number));assert.equal(historical.snapshot.infrastructure.length,2);assert.equal(historical.snapshot.infrastructureDocuments.length,docs.length+landIds.length);assert.equal(historical.snapshot.infrastructureDocuments.find(d=>d.id===docs[1]).schoolId,school);
 async function removeDocument(who,id){const r=await fetch(`${base}/api/infrastructure/documents?plan=${plan}&id=${id}`,{method:'DELETE',headers:{Origin:base,Cookie:cookies[who]||''}});return {status:r.status,data:await r.json()};}
 ok(await removeDocument('anonymous',docs[1]),401);
 ok(await removeDocument('social',docs[1]),403);
 ok(await removeDocument('officer',docs[1]),409);
 ok(await removeDocument('director',docs[1]));
 const afterRemoval=ok(await api('director',path));
 assert.ok(!afterRemoval.documents.some(d=>d.id===docs[1]));
 assert.ok(afterRemoval.packages.every(p=>!p.input.documentIds.includes(docs[1])));
 ok(await removeDocument('director',docs[1]),404);
 ok(await api('director','/api/infrastructure/documents?id='+docs[1]));
 const preserved=ok(await api('director',reviewPath+'&submission='+review.submissions[0].number));
 assert.ok(preserved.snapshot.infrastructureDocuments.some(d=>d.id===docs[1]));
 console.log('PASS: packages, document removal permissions, review locking and preserved historical attachments.');
}finally{
 if(plan){for(const table of ['plan_notifications','plan_review_events','plan_submissions','plan_pillar_reviews','infrastructure_documents','infrastructure_packages'])await db.query(`DELETE FROM ${table} WHERE plan_id=$1`,[plan]);await db.query('DELETE FROM action_plans WHERE id=$1',[plan]);}
 if(school)await db.query('DELETE FROM schools WHERE id=$1',[school]);if(secondSchool)await db.query('DELETE FROM schools WHERE id=$1',[secondSchool]);await db.query('DELETE FROM users WHERE id=ANY($1::int[])',[users]);await db.end();
}
