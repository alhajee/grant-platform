import { NextResponse } from "next/server";
import { getPostgres } from "@/lib/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getPostgres().query("SELECT 1");
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
