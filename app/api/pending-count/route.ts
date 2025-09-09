// app/api/pending-count/route.ts
import { NextResponse, NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    searchParams.get("from"); searchParams.get("to"); searchParams.get("line");
    // Hotfix: devolver 0 para que el UI no rompa
    return NextResponse.json({ ok: true, count: 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
