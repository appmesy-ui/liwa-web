// app/api/taxonomy/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Hotfix: estructura vacía pero con las llaves que espera el front
    return NextResponse.json({
      ok: true,
      map: {},          // Record<N1, Record<N2, string[]>>
      level1: [],       // string[]
      level2: [],       // string[]
      level3: [],       // string[]
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
