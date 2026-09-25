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
const { mayEditPillar, readyForUbec, aggregateReviewStatus } = load('lib/pillar-review.ts');
const { beapPillars, implementedPillars } = load('lib/beap-pillars.ts');
const reviews = (infrastructure, sports) => [{ pillar: 'infrastructure', status: infrastructure }, { pillar: 'sports', status: sports }];
assert.equal(beapPillars.length, 9);
assert.equal(beapPillars.reduce((sum,p) => sum+p.share,0), 100);
assert.deepEqual(implementedPillars, ['infrastructure','sports']);
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
assert.equal(readyForUbec(reviews('chairman_ready','draft'),{infrastructure:[{}],sports:[{}]}),false);
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),{infrastructure:[{}],sports:[]}),false);
assert.equal(readyForUbec(reviews('chairman_ready','chairman_ready'),{infrastructure:[{}],sports:[{}]}),true);
console.log('PASS: department isolation, independent pillar locks, Director editing, UBEC locks, implemented-pillar readiness, nine pillars and 100% shares.');
