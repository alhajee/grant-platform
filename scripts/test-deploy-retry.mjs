// Unit test: requests made while a deploy swaps the app container (lib/deploy-retry.ts). node scripts/test-deploy-retry.mjs
import assert from 'node:assert/strict';
import { errorPage, notDelivered, retryDelayMs } from '../lib/deploy-retry.ts';

const reply = (status, headers = {}) => ({ status, headers: new Headers(headers) });
// The updating service's 503 (deploy/updating/nginx.conf) and the proxy's own "404 page not found": never reached the app.
assert.ok(notDelivered(reply(503, { 'content-type': 'application/json', 'x-beapms-updating': '1', 'retry-after': '5' })));
assert.ok(notDelivered(reply(404, { 'content-type': 'text/plain; charset=utf-8' })), "the proxy's 404 page");
// The app's own answers are JSON and go to the page as they are.
assert.ok(!notDelivered(reply(404, { 'content-type': 'application/json' })), "the app's 404");
assert.ok(!notDelivered(reply(503, { 'content-type': 'application/json' })), "the app's 503 (e.g. 'Changes could not be saved')");
assert.ok(!notDelivered(reply(200, { 'content-type': 'application/json' })));
// Error pages that may have reached the app: not sent again, but turned into JSON.
assert.ok(errorPage(reply(502, { 'content-type': 'text/plain' })));
assert.ok(errorPage(reply(500, {})));
assert.ok(!errorPage(reply(500, { 'content-type': 'application/json' })));
assert.ok(!errorPage(reply(404, { 'content-type': 'text/plain' })));
assert.equal(retryDelayMs(reply(503, { 'retry-after': '5' })), 5000);
assert.equal(retryDelayMs(reply(503, { 'retry-after': '120' })), 10000, 'never longer than 10 s');
assert.equal(retryDelayMs(reply(404)), 3000);
console.log('deploy retry: ok');
