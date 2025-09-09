// app/api/pending-paros/route.ts
import { NextResponse, NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const line = searchParams.get("line");

    // Hotfix: devolver estructura válida (vacía) para el UI de /pending
    return NextResponse.json({
      ok: true,
      rows: [],            // Array de eventos pendientes
      count: 0,            // total
      range: { from, to, line: line ?? null },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
