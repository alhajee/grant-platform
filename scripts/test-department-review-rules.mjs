import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

// Execute the project's pure TypeScript rules without a server or test accounts.
const cache = new Map();
function load(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  cache.set(path, loaded.exports);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(id => load(resolve(dirname(path), id + '.ts')), loaded, loaded.exports);
  return loaded.exports;
}
const { mayEditPillar, readyForExecutiveChairman, readyForUbec, readyForUbecSubmission, ubecSubmissionSnapshot, aggregateReviewStatus } = load('lib/pillar-review.ts');
const { beapPillars, implementedPillars } = load('lib/beap-pillars.ts');
// The activity-line components (migrations 036 and 038) follow the Sports status unless a test sets them.
const reviews = (infrastructure, sports, sbmc= sports, tlm= sports, rest = sports) => [
  { pillar: 'infrastructure', status: infrastructure }, { pillar: 'sports', status: sports },
  { pillar: 'sbmc', status: sbmc }, { pillar: 'tlm', status: tlm },
  ...['monitoring', 'gscci', 'curriculum', 'quality', 'ict'].map(pillar => ({ pillar, status: rest })),
];
const completeSnapshot = {
  infrastructure:[{school:{id:1,name:'QA School'},package:{kind:'new',input:{schoolId:1}}}], sports:[{}], sbmc:[{}], tlm:[{}], tlmDistribution:[{}], monitoring:[{}], gscci:[{}], curriculum:[{}], curriculumDistribution:[{}],
  // Quality Assurance and ICT: every compulsory activity, line schools and line documents (migration 038).
  quality:[2,3,6,7,8,9,10].map(activity=>({id:activity,activity,description:'QA'})),
  ict:[{id:12,activity:2,description:'Smart',schools:[{id:1}]},{id:13,activity:3,description:'Connect',documents:[{id:'d'}]},{id:16,activity:6,description:'Website'}],
  infrastructureDocuments:[{kind:'drawings'},{kind:'boq',schoolId:1},{kind:'survey',schoolId:1}],
};
assert.equal(beapPillars.length, 9);
assert.equal(beapPillars.reduce((sum,p) => sum+p.share,0), 100);
assert.deepEqual(implementedPillars, ['infrastructure','sports','sbmc','tlm','monitoring','gscci','curriculum','quality','ict']);
for (const locked of ['submitted_ubec','ubec_review','ubec_approved']) {
  assert.equal(mayEditPillar('Director','physical','infrastructure',locked,reviews('director_review','draft')),false);
  assert.equal(mayEditPillar('Data Entry Staff','physical','infrastructure',locked,reviews('draft','draft')),false);
}
assert.equal(mayEditPillar('Data Entry Staff','physical','infrastructure','draft',reviews('draft','draft')),true);
assert.equal(mayEditPillar('Data Entry Staff','academic','infrastructure','draft',reviews('draft','draft')),false);
assert.equal(mayEditPillar('Director',null,'infrastructure','awaiting_review',reviews('director_review','draft')),false);
assert.equal(mayEditPillar('Director','physical','infrastructure','awaiting_review',reviews('director_review','draft')),true);
assert.equal(mayEditPillar('Director','academic','infrastructure','awaiting_review',reviews('director_review','draft')),false);
assert.equal(mayEditPillar('Data Entry Staff','physical','infrastructure','awaiting_review',reviews('director_review','draft')),false);
assert.equal(mayEditPillar('Data Entry Staff','academic','sports','awaiting_review',reviews('director_review','draft')),true);
assert.equal(mayEditPillar('Director','physical','infrastructure','awaiting_chairman',reviews('chairman_ready','chairman_ready')),false);
assert.equal(mayEditPillar('Executive Chairman',null,'infrastructure','draft',reviews('draft','draft')),false);
assert.equal(aggregateReviewStatus(reviews('chairman_ready','draft')),'draft');
assert.equal(aggregateReviewStatus(reviews('chairman_ready','director_review')),'awaiting_review');
assert.equal(aggregateReviewStatus(reviews('chairman_ready','chairman_ready')),'awaiting_chairman');
assert.equal(aggregateReviewStatus(reviews('changes_requested','chairman_ready')),'changes_requested');
assert.equal(aggregateReviewStatus(reviews('beap_review','beap_review')),'awaiting_beap_chair');
assert.equal(aggregateReviewStatus(reviews('chairman_ready','beap_review')),'awaiting_beap_chair');
assert.equal(aggregateReviewStatus(reviews('beap_review','draft')),'draft');
assert.equal(readyForExecutiveChairman(reviews('beap_review','beap_review'),completeSnapshot),true);
assert.equal(readyForExecutiveChairman(reviews('chairman_ready','beap_review'),completeSnapshot),true);
assert.equal(readyForExecutiveChairman(reviews('chairman_ready','chairman_ready'),completeSnapshot),false);
assert.equal(readyForExecutiveChairman(reviews('beap_review','draft'),completeSnapshot),false);
assert.equal(readyForUbec(reviews('chairman_ready','draft'),completeSnapshot),false);
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),{...completeSnapshot,sports:[]}),false);
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),completeSnapshot),true);
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),{...completeSnapshot,curriculumDistribution:[]}),false);
assert.equal(readyForExecutiveChairman(reviews('beap_review','beap_review','beap_review','beap_review','draft'),completeSnapshot),false);
// Quality Assurance and ICT readiness: compulsory activities and line documents.
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),{...completeSnapshot,quality:completeSnapshot.quality.slice(1)}),false);
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),{...completeSnapshot,ict:[...completeSnapshot.ict.slice(0,1),{id:13,activity:3,description:'Connect'},...completeSnapshot.ict.slice(2)]}),false);
assert.equal(readyForExecutiveChairman(reviews('beap_review','beap_review'),{...completeSnapshot,ict:completeSnapshot.ict.slice(1)}),false);
assert.equal(readyForUbecSubmission('reviewed_components',reviews('draft','draft','draft','draft','chairman_ready'),{...completeSnapshot,ict:[]}),false);
// The UBEC submission setting: complete plans only, or whatever reached the Executive Chairman.
assert.equal(readyForUbecSubmission('complete_plan',reviews('chairman_ready','draft'),completeSnapshot),false);
assert.equal(readyForUbecSubmission('complete_plan',reviews('chairman_ready','chairman_ready'),completeSnapshot),true);
assert.equal(readyForUbecSubmission('reviewed_components',reviews('chairman_ready','draft'),{infrastructure:[{}],sports:[]}),true);
assert.equal(readyForUbecSubmission('reviewed_components',reviews('beap_review','draft'),completeSnapshot),false);
const partialSnapshot = ubecSubmissionSnapshot({...completeSnapshot,setup:{id:1},componentDocuments:[{id:'a',component:'monitoring'}]},reviews('draft','chairman_ready','director_review','draft','draft'));
assert.deepEqual(partialSnapshot.setup,{id:1});
assert.equal(partialSnapshot.sports.length,1);
assert.deepEqual([partialSnapshot.infrastructure,partialSnapshot.sbmc,partialSnapshot.tlm,partialSnapshot.tlmDistribution],[[],[],[],[]]);
assert.equal('infrastructureDocuments' in partialSnapshot,false);
assert.deepEqual([partialSnapshot.monitoring,partialSnapshot.curriculumDistribution,partialSnapshot.componentDocuments],[[],[],[]]);
assert.equal(ubecSubmissionSnapshot(completeSnapshot,reviews('chairman_ready','chairman_ready')).infrastructureDocuments.length,3);
console.log('PASS: department isolation, Director, BEAP Chair and Executive Chairman stages, UBEC locks, implemented-component readiness, UBEC submission modes, nine components and 100% shares.');
