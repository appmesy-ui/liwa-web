// app/api/planned-windows/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/planned-windows/list
 * Parámetros:
 *  - line_id=<uuid>           (repetible)
 *  - from=ISO                 (rango opcional; por defecto ahora-24h)
 *  - to=ISO                   (por defecto ahora)
 *  - limit=100                (1..1000)
 *  - order=desc|asc           (por start_ts)
 *
 * Devuelve ventanas que se SOLAPAN con [from, to):
 *    start_ts < to AND end_ts > from
 */
export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-planned-windows-list" } },
      db: { schema: "liwa" },
    });

    const { searchParams } = new URL(req.url);
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO =
      searchParams.get("from") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const order = (searchParams.get("order") ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 100), 1000));

    const lineIds = searchParams.getAll("line_id").filter(Boolean);

    let q = admin
      .from("planned_windows")
      .select(
        "id, org_id, plant_id, line_id, machine_id, start_ts, end_ts, motivo, notas, created_at",
        { count: "exact" }
      )
      .lt("start_ts", toISO)
      .gt("end_ts", fromISO) // estrictamente > from para overlap abierto; usa .gte si quieres incluir borde
      .order("start_ts", { ascending: order === "asc" })
      .limit(limit);

    if (lineIds.length) {
      q = q.in("line_id", lineIds);
    }

    const { data, error, count } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      count,
      rows: data ?? [],
      meta: { filters: { line_id: lineIds.length ? lineIds : null, from: fromISO, to: toISO } },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
