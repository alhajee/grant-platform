// Encrypts integration secrets (such as the DNEMIS access token) before they are stored in PostgreSQL.
// AES-256-GCM with a key derived by HKDF-SHA256 from AUTH_SECRET. Uses Web Crypto so it runs both in the
// Node production server and the Workers-based dev server; the output matches node:crypto's AES-256-GCM.
// Stored format: v1:<iv>:<tag>:<ciphertext>, each part base64.

const keyInfo = 'beapms:integration-secrets:v1';
const keySalt = 'beapms:secret-box';
const ivBytes = 12;
const tagBytes = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class SecretBoxConfigError extends Error {}
export class SecretBoxDecryptError extends Error {}

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), character => character.charCodeAt(0));

async function deriveKey(secret = process.env.AUTH_SECRET) {
  if (!secret || secret.length < 32) throw new SecretBoxConfigError('Integration secrets cannot be stored: the server AUTH_SECRET is missing or shorter than 32 characters.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(keySalt), info: encoder.encode(keyInfo) },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function sealSecret(plaintext: string, secret?: string) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(ivBytes));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: tagBytes * 8 }, key, encoder.encode(plaintext)));
  const ciphertext = sealed.slice(0, sealed.length - tagBytes), tag = sealed.slice(sealed.length - tagBytes);
  return `v1:${toBase64(iv)}:${toBase64(tag)}:${toBase64(ciphertext)}`;
}

export async function openSecret(box: string, secret?: string) {
  const parts = box.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new SecretBoxDecryptError('The stored secret has an unknown format.');
  const key = await deriveKey(secret);
  try {
    const [iv, tag, ciphertext] = parts.slice(1).map(fromBase64);
    if (iv.length !== ivBytes || tag.length !== tagBytes) throw new Error('bad lengths');
    const joined = new Uint8Array(ciphertext.length + tag.length);
    joined.set(ciphertext); joined.set(tag, ciphertext.length);
    return decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: tagBytes * 8 }, key, joined));
  } catch {
    throw new SecretBoxDecryptError('The stored secret could not be decrypted. It may have been changed, or AUTH_SECRET has changed since it was saved.');
  }
}
