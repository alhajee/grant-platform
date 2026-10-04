// Unit tests for lib/secret-box.ts (token encryption) and lib/dnemis-url.ts (address rules and SSRF guard).
// No database or server needed. Usage: node scripts/test-secret-box.mjs   (Node 22.18+ strips the TypeScript types)
import assert from 'node:assert/strict';
import { createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { openSecret, sealSecret, SecretBoxConfigError, SecretBoxDecryptError } from '../lib/secret-box.ts';
import { assertPublicDnemisHost, DnemisUrlError, isPrivateAddress, normaliseDnemisBaseUrl } from '../lib/dnemis-url.ts';

let passed = 0;
const step = message => { passed++; console.log('✓', message); };
const secret = randomBytes(32).toString('base64url'), token = `d2pat_${randomBytes(24).toString('hex')}`;

const box = await sealSecret(token, secret);
assert.match(box, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
assert.ok(!box.includes(token));
assert.equal(await openSecret(box, secret), token);
assert.notEqual(await sealSecret(token, secret), box, 'a fresh IV is used every time');
step('seal/open round trip; output is v1:<iv>:<tag>:<ciphertext> and never contains the plaintext');

const [, iv, tag, ciphertext] = box.split(':');
const key = Buffer.from(hkdfSync('sha256', secret, 'beapms:secret-box', 'beapms:integration-secrets:v1', 32));
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64'));
assert.equal(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString(), token);
step('format is standard AES-256-GCM with an HKDF-SHA256 key (node:crypto decrypts it)');

const flip = (b64) => { const bytes = Buffer.from(b64, 'base64'); bytes[0] ^= 1; return bytes.toString('base64'); };
await assert.rejects(openSecret(`v1:${iv}:${tag}:${flip(ciphertext)}`, secret), SecretBoxDecryptError);
await assert.rejects(openSecret(`v1:${iv}:${flip(tag)}:${ciphertext}`, secret), SecretBoxDecryptError);
await assert.rejects(openSecret(`v1:${flip(iv)}:${tag}:${ciphertext}`, secret), SecretBoxDecryptError);
await assert.rejects(openSecret(box, randomBytes(32).toString('base64url')), SecretBoxDecryptError);
await assert.rejects(openSecret(`v2:${iv}:${tag}:${ciphertext}`, secret), SecretBoxDecryptError);
step('tampered ciphertext, tag or IV, a different AUTH_SECRET and unknown versions are all refused');

await assert.rejects(sealSecret(token, ''), SecretBoxConfigError);
await assert.rejects(sealSecret(token, 'too-short'), SecretBoxConfigError);
step('missing or short AUTH_SECRET raises a clear configuration error');

assert.equal(normaliseDnemisBaseUrl(' https://asc.education.gov.ng/dhis/ '), 'https://asc.education.gov.ng/dhis');
assert.equal(normaliseDnemisBaseUrl('https://asc.education.gov.ng/dhis/api///'), 'https://asc.education.gov.ng/dhis');
assert.equal(normaliseDnemisBaseUrl('https://ASC.education.gov.ng'), 'https://asc.education.gov.ng');
for (const bad of ['http://asc.education.gov.ng/dhis', 'https://user:pw@asc.education.gov.ng/dhis', 'https://asc.education.gov.ng/dhis?x=1', 'ftp://example.com',
  'https://localhost/dhis', 'https://127.0.0.1', 'https://10.1.2.3', 'https://192.168.0.10', 'https://172.20.0.5', 'https://169.254.169.254',
  'https://[::1]', 'https://[fe80::1]', 'https://[fd00::5]', 'https://[::ffff:127.0.0.1]', 'https://[::ffff:a9fe:a9fe]', 'https://postgres', 'https://db.internal', 'not a url', '']) {
  assert.throws(() => normaliseDnemisBaseUrl(bad), DnemisUrlError, bad);
}
step('addresses: https only, no credentials/query, trailing slashes and /api trimmed; private, loopback, link-local and internal hosts refused');

for (const address of ['0.0.0.0', '100.64.1.1', '198.18.0.1', '224.0.0.1', '::', '64:ff9b::a00:1']) assert.ok(isPrivateAddress(address), address);
for (const address of ['8.8.8.8', '41.203.64.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.ok(!isPrivateAddress(address), address);
await assert.rejects(assertPublicDnemisHost('https://localhost.'), DnemisUrlError);
step('address classifier handles reserved IPv4/IPv6 ranges and IPv4-mapped addresses');

console.log(`\nPASS: ${passed} secret-box and address checks.`);
