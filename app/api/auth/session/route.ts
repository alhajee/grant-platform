import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceState } from "@/lib/workspace-state";

export async function GET(request: NextRequest) {
  try {
    const user = await getWorkspaceState(request);
    return user ? NextResponse.json({ user }) : NextResponse.json({ error: "Session expired." }, { status: 401 });
  } catch (cause) {
    console.error("Session lookup failed", cause);
    return NextResponse.json({ error: "The local database is unavailable." }, { status: 503 });
  }
}
