import { createHash, randomBytes } from 'node:crypto';
import { brandedEmailHtml, brandedEmailText, type BrandedEmail } from './email-layout';

/** A reset link works once, for an hour (migration 067). */
export const resetTokenMinutes = 60;
/** Requests answered per account and per address within an hour; extra requests get the same reply but send nothing. */
export const resetRequestsPerHour = { account: 3, address: 10 };

export const newResetToken = () => randomBytes(32).toString('base64url');
export const hashResetToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
export const isResetTokenShape = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

/**
 * The address reset links point at: APP_URL in production (never the request's Host header, which a requester
 * controls), else the request's own origin for local development.
 */
export function appBaseUrl(requestOrigin: string, env: NodeJS.ProcessEnv = process.env) {
  const configured = env.APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return env.NODE_ENV === 'production' ? null : requestOrigin.replace(/\/+$/, '');
}

/** The reset email in the UBEC layout (lib/email-layout.ts). */
export function resetEmail(name: string, link: string, baseUrl: string) {
  const email: BrandedEmail = {
    baseUrl,
    preheader: `Use this link within ${resetTokenMinutes} minutes to choose a new BEAPMS password.`,
    heading: 'Reset your password',
    greeting: `Hello ${name},`,
    paragraphs: ['We received a request to reset the password for your BEAPMS account. Choose a new password with the button below.'],
    button: { label: 'Choose a new password', href: link },
    notes: [`This link works once and expires in ${resetTokenMinutes} minutes.`, 'If you did not ask for this, you can ignore this email. Your password stays the same.'],
  };
  return { subject: 'Reset your BEAPMS password', text: brandedEmailText(email), html: brandedEmailHtml(email) };
}
