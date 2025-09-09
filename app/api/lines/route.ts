// app/api/lines/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Hotfix: sin datos reales → lista vacía
    return NextResponse.json({
      ok: true,
      rows: [], // [{ id, code, name }]
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
