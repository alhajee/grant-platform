import { NextRequest } from "next/server";

export type LocalUser = { name: string; role: string; email: string; department?: string | null; sessionVersion?: number };

type SessionPayload = LocalUser & { expiresAt: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionSecret = process.env.AUTH_SECRET ?? "ubec-local-development-session-secret-2026";

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
  return crypto.subtle.importKey("raw", encoder.encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createLocalSession(user: LocalUser) {
  const payload: SessionPayload = { ...user, expiresAt: Date.now() + 1000 * 60 * 60 * 12 };
  const encodedPayload = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(encodedPayload));
  return `${encodedPayload}.${encode(new Uint8Array(signature))}`;
}

export async function getLocalSessionUser(request: NextRequest): Promise<LocalUser | null> {
  const token = request.cookies.get("ubec_session")?.value;
  if (!token) return null;
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;
  const isValid = await crypto.subtle.verify("HMAC", await signingKey(), decode(encodedSignature), encoder.encode(encodedPayload));
  if (!isValid) return null;
  try {
    const payload = JSON.parse(decoder.decode(decode(encodedPayload))) as SessionPayload;
    return payload.expiresAt > Date.now() ? { name: payload.name, role: payload.role, email: payload.email, sessionVersion: payload.sessionVersion ?? 0 } : null;
  } catch {
    return null;
  }
}
