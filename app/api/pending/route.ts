// app/api/pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PendingRow = {
  id: string;
  line_code: string | null;
  machine_code: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  classified: boolean | null;
};

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-pending" } },
      db: { schema: "liwa" },
    });

    const { searchParams } = new URL(req.url);
    const toISO   = searchParams.get("to")   ?? new Date().toISOString();
    const fromISO = searchParams.get("from") ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const line    = searchParams.get("line");         // filtro por línea (opcional)
    const q       = searchParams.get("q");            // búsqueda libre (opcional)
    const limit   = Math.min(1000, Number(searchParams.get("limit") ?? 1000));

    // Base: SOLO pendientes, que se solapen con el rango [from, to)
    // Campos válidos en la vista: id, line_code, machine_code, started_at, ended_at, duration_min, is_pending
    let base = admin
      .from("v_pending_events_ui")
      .select("id,line_code,machine_code,started_at,ended_at,duration_min,is_pending", { count: "exact" })
      .eq("is_pending", true)
      .lt("started_at", toISO)
      .or(`ended_at.is.null,ended_at.gte.${fromISO}`);

    // Filtro por línea (usamos line_code, que es lo que existe)
    if (line && line !== "ALL") {
      base = base.ilike("line_code", `%${line}%`);
    }

    // Búsqueda libre sobre line_code / machine_code
    if (q && q.trim()) {
      const s = `%${q.trim()}%`;
      base = base.or(`line_code.ilike.${s},machine_code.ilike.${s}`);
    }

    const { data, error } = await base
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows: PendingRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      line_code: r.line_code ?? null,
      machine_code: r.machine_code ?? null,
      started_at: r.started_at ?? null,
      ended_at: r.ended_at ?? null,
      duration_min: r.duration_min != null ? Number(r.duration_min) : null,
      // Los niveles no están en esta vista
      lvl1: null,
      lvl2: null,
      lvl3: null,
      // La vista ya es de PENDIENTES → classified siempre false
      classified: false,
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    console.error("API /pending error:", err?.message || err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}


