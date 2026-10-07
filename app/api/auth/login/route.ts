import { compareSync } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { createLocalSession, sessionCookieName, sessionCookieOptions, sessionIdleSeconds } from "@/lib/local-session";
import { getPostgres } from "@/lib/postgres";
import { isUbec } from '@/lib/ubec';

function text(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json() as { email?: string; password?: string };
    const email = input.email?.trim().toLowerCase();
    if (!email || !input.password) return NextResponse.json({ error: "Enter your email address and password." }, { status: 400 });
    const { rows } = await getPostgres().query<{ id:number; full_name: string; role: string; password_hash: string; session_version: number }>(
      `SELECT id, full_name, role, password_hash, session_version FROM users WHERE email = ${text(email)} AND active`,
    );
    const user = rows[0];
    if (!user || !compareSync(input.password, user.password_hash)) {
      return NextResponse.json({ error: "The email address or password is incorrect." }, { status: 401 });
    }
    const adminSessionId=user.role==='Super Admin'?crypto.randomUUID():undefined;
    if(adminSessionId)await getPostgres().query("INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '12 hours')",[adminSessionId,user.id]);
    const token = await createLocalSession({ name: user.full_name, role: user.role, email, sessionVersion: user.session_version, adminSessionId });
    const response = NextResponse.json({ user: { name: user.full_name, role: user.role }, destination: user.role==='Super Admin'?'/admin':isUbec(user.role) ? '/ubec' : '/dashboard' });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions(sessionIdleSeconds));
    response.cookies.delete('ubec_impersonation');
    return response;
  } catch (cause) {
    console.error("Login failed", cause);
    return NextResponse.json({ error: "The local database is unavailable." }, { status: 503 });
  }
}
