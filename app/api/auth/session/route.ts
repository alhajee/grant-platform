import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceState } from "@/lib/workspace-state";

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    if(!user)return NextResponse.json({error:'Session expired.'},{status:401,headers:{'Cache-Control':'no-store'}});
    const {adminSessionId: _privateSession,...publicUser}=user;
    return NextResponse.json({user:publicUser},{headers:{'Cache-Control':'no-store'}});
  } catch (cause) {
    console.error("Session lookup failed", cause);
    return NextResponse.json({ error: "The local database is unavailable." }, { status: 503 });
  }
}
