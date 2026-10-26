import { randomInt } from 'node:crypto';

// Passwords the portal makes for new or reset accounts (shown once, then shared with the person). Readable and easy to
// type: three groups of four from an alphabet without look-alikes (no 0/O, 1/l/I), e.g. "Xk7m-P3qz-9Rtw", about 69 bits
// of randomness. Always holds a letter and a number, as lib/password-policy.ts asks.
const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(): string {
  for (;;) {
    const chars = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]);
    const password = [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map(group => group.join('')).join('-');
    if (/[a-zA-Z]/.test(password) && /\d/.test(password)) return password;
  }
}
