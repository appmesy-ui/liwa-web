// app/api/pending-count/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-pending-count" } },
      db: { schema: "liwa" }, // importante: usar esquema liwa
    });

    const { searchParams } = new URL(req.url);
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO = searchParams.get("from");
    const lineFilter = searchParams.get("line"); // compararemos con lines.name

    // Si piden filtrar por línea (por nombre), resolvemos los line_id primero
    let lineIds: string[] | null = null;
    if (lineFilter) {
      const { data: lines, error: lineErr } = await admin
        .from("lines")
        .select("id")
        .eq("name", lineFilter)
        .limit(50);
      if (lineErr) return NextResponse.json({ ok: false, error: lineErr.message }, { status: 500 });
      lineIds = (lines ?? []).map((l: any) => l.id);
      if (!lineIds.length) return NextResponse.json({ ok: true, count: 0 });
    }

    // Contar eventos pendientes (classified_at IS NULL) en rango
    let q = admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .is("classified_at", null)
      .lte("started_at", toISO);

    if (fromISO) q = q.gte("started_at", fromISO);
    if (lineIds) q = q.in("line_id", lineIds);

    const { count, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: count ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
