// app/api/kpis/route.ts
import { NextResponse, NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Compatibilidad de parámetros (from, to, line)
    const { searchParams } = new URL(req.url);
    searchParams.get("from"); searchParams.get("to"); searchParams.get("line");

    // Hotfix: estructura vacía para que el UI no rompa
    return NextResponse.json({
      ok: true,
      rows: [], // [{ line_code, planned_runtime_sec, availability, performance, quality, oee }]
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
