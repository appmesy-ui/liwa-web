// app/api/kpis-series/route.ts
import { NextResponse, NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    searchParams.get("from"); searchParams.get("to"); searchParams.get("line");
    // Hotfix: serie vacía (estructura correcta)
    return NextResponse.json({
      ok: true,
      rows: [], // [{ bucket_ts, line_code, oee }]
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
