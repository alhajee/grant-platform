import { NextRequest } from "next/server";

export type LocalUser = { name: string; role: string; email: string; department?: string | null; departments?: string[]; isBeapChair?: boolean; sessionVersion?: number; adminSessionId?:string; impersonation?: { id:string; adminName:string; expiresAt:string } };

type SessionPayload = LocalUser & { expiresAt: number; issuedAt?: number };

/**
 * Sessions slide: each renewal (POST /api/auth/session, sent while the portal is in use) pushes the expiry out by
 * the idle limit, up to the absolute limit counted from sign-in. Someone working all day stays signed in; a session
 * left unused for the idle limit, or older than the absolute limit, ends.
 */
export const sessionIdleSeconds = 60 * 60 * 12;
export const sessionMaxSeconds = 60 * 60 * 24 * 7;
export const sessionCookieName = "ubec_session";
export const sessionCookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionSecret = process.env.AUTH_SECRET;

function encode(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signingKey() {
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('A private AUTH_SECRET of at least 32 characters is required.');
  return crypto.subtle.importKey("raw", encoder.encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Seconds until a session started at `issuedAt` and renewed now expires. */
export const sessionLifetime = (issuedAt: number, now = Date.now()) => Math.max(0, Math.min(sessionIdleSeconds * 1000, issuedAt + sessionMaxSeconds * 1000 - now) / 1000);

export async function createLocalSession(user: LocalUser, issuedAt = Date.now()) {
  const payload: SessionPayload = { ...user, issuedAt, expiresAt: Date.now() + sessionLifetime(issuedAt) * 1000 };
  const encodedPayload = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(encodedPayload));
  return `${encodedPayload}.${encode(new Uint8Array(signature))}`;
}

export async function getLocalSessionUser(request: NextRequest): Promise<LocalUser | null> {
  const payload = await readLocalSession(request);
  return payload ? { name: payload.name, role: payload.role, email: payload.email, sessionVersion: payload.sessionVersion ?? 0, adminSessionId: payload.adminSessionId } : null;
}

/** The verified, unexpired session payload, or null. Sessions signed before issuedAt existed count from their expiry. */
export async function readLocalSession(request: NextRequest): Promise<(LocalUser & { issuedAt: number }) | null> {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) return null;
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const isValid = await crypto.subtle.verify("HMAC", await signingKey(), decode(encodedSignature), encoder.encode(encodedPayload));
  if (!isValid) return null;
  try {
    const payload = JSON.parse(decoder.decode(decode(encodedPayload))) as SessionPayload;
    if (!(payload.expiresAt > Date.now())) return null;
    return { name: payload.name, role: payload.role, email: payload.email, sessionVersion: payload.sessionVersion ?? 0, adminSessionId: payload.adminSessionId, issuedAt: payload.issuedAt ?? payload.expiresAt - sessionIdleSeconds * 1000 };
  } catch {
    return null;
  }
}
