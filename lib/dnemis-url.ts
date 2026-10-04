// Validation for the admin-entered DNEMIS (DHIS2) server address. The portal sends a secret token to this
// address, so it must be HTTPS, carry no credentials, and never point at a private or internal network (SSRF).
import { lookup } from 'node:dns/promises';

export const defaultDnemisBaseUrl = 'https://asc.education.gov.ng/dhis';
const maxUrlLength = 300;

export class DnemisUrlError extends Error {}

/** Parses and normalises the address (https, no credentials, query or fragment, no trailing slash). */
export function normaliseDnemisBaseUrl(input: string) {
  const text = input.trim();
  if (!text || text.length > maxUrlLength) throw new DnemisUrlError('Enter the DNEMIS server address, for example https://asc.education.gov.ng/dhis.');
  let url: URL;
  try { url = new URL(text); } catch { throw new DnemisUrlError('Enter a full web address that starts with https://.'); }
  if (url.protocol !== 'https:') throw new DnemisUrlError('The DNEMIS address must start with https:// so the access token is encrypted in transit.');
  if (url.username || url.password) throw new DnemisUrlError('Do not put a user name or password in the address. Use the access token field instead.');
  if (url.search || url.hash) throw new DnemisUrlError('Remove the ? or # part from the address.');
  const host = url.hostname.toLowerCase();
  if (isBlockedHostname(host)) throw new DnemisUrlError('The DNEMIS address must be a public internet server, not a local or internal one.');
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
  return `${url.origin}${path}`;
}

function isBlockedHostname(host: string) {
  const bare = host.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIpLiteral(bare)) return isPrivateAddress(bare);
  if (!bare.includes('.')) return true; // single-label names resolve inside the server's network (e.g. Docker services)
  return bare === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(bare);
}

const isIpLiteral = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');

function ipv4Parts(address: string) {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPrivateIpv4(address: string) {
  const parts = ipv4Parts(address);
  if (!parts) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254) // link-local, cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function expandIpv6(address: string) {
  let text = address.toLowerCase().split('%')[0];
  const embedded = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) {
    const parts = ipv4Parts(embedded[1]);
    if (!parts) return null;
    text = text.slice(0, -embedded[1].length) + `${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [], tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(fill, 0)).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every(group => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map(group => parseInt(group, 16));
}

function isPrivateIpv6(address: string) {
  const groups = expandIpv6(address);
  if (!groups) return true;
  const [first] = groups;
  const allZeroUntil = (index: number) => groups.slice(0, index).every(group => group === 0);
  if (allZeroUntil(7) && (groups[7] === 0 || groups[7] === 1)) return true; // :: and ::1
  const mappedV4 = (allZeroUntil(5) && groups[5] === 0xffff) // ::ffff:a.b.c.d
    || (first === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every(group => group === 0)); // NAT64
  if (mappedV4 || allZeroUntil(6)) {
    const v4 = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
    return isPrivateIpv4(v4);
  }
  return (first & 0xfe00) === 0xfc00 // unique local
    || (first & 0xffc0) === 0xfe80 // link-local
    || (first & 0xff00) === 0xff00 // multicast
    || (first === 0x2001 && groups[1] === 0x0db8); // documentation
}

export const isPrivateAddress = (address: string) => address.includes(':') ? isPrivateIpv6(address) : isPrivateIpv4(address);

/** Resolves the host and refuses it when any address is private, loopback, link-local or reserved. */
export async function assertPublicDnemisHost(baseUrl: string) {
  const host = new URL(normaliseDnemisBaseUrl(baseUrl)).hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) return;
  let addresses: { address: string }[];
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new DnemisUrlError(`The server name ${host} could not be found. Check the address.`); }
  if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
    throw new DnemisUrlError('The DNEMIS address must be a public internet server, not a local or internal one.');
  }
}
