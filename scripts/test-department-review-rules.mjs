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
const { mayEditPillar, readyForExecutiveChairman, readyForUbec, aggregateReviewStatus } = load('lib/pillar-review.ts');
const { beapPillars, implementedPillars } = load('lib/beap-pillars.ts');
const reviews = (infrastructure, sports, sbmc= sports, tlm= sports) => [
  { pillar: 'infrastructure', status: infrastructure }, { pillar: 'sports', status: sports },
  { pillar: 'sbmc', status: sbmc }, { pillar: 'tlm', status: tlm },
];
const completeSnapshot = {
  infrastructure:[{school:{id:1,name:'QA School'},package:{kind:'new',input:{schoolId:1}}}], sports:[{}], sbmc:[{}], tlm:[{}], tlmDistribution:[{}],
  infrastructureDocuments:[{kind:'drawings'},{kind:'boq',schoolId:1},{kind:'survey',schoolId:1}],
};
assert.equal(beapPillars.length, 9);
assert.equal(beapPillars.reduce((sum,p) => sum+p.share,0), 100);
assert.deepEqual(implementedPillars, ['infrastructure','sports','sbmc','tlm']);
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
console.log('PASS: department isolation, Director, BEAP Chair and Executive Chairman stages, UBEC locks, implemented-component readiness, nine components and 100% shares.');
