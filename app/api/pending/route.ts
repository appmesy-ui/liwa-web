// app/api/pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PendingRow = {
  id: string;
  line_code: string | null;     // <- UI espera "line_code", mapeamos desde line_name para mostrar "Línea 1"
  machine_code: string | null;  // <- UI espera "machine_code", mapeamos desde machine_name
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;
  classified: boolean | null;   // derivado de is_pending
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

    const line = searchParams.get("line");         // valor del <select> en tu UI (usa line_code del JSON)
    const q    = searchParams.get("q");            // no lo usas ahora, pero lo dejamos por si lo añades
    const limit = Math.min(1000, Number(searchParams.get("limit") ?? 1000));

    // Base: SOLO pendientes y con solape de rango [from,to)
    let base = admin
      .from("v_pending_events_ui")
      .select("id,line_name,line_code,machine_name,started_at,ended_at,duration_min,is_pending", { count: "exact" })
      .eq("is_pending", true)
      .lt("started_at", toISO)
      .or(`ended_at.is.null,ended_at.gte.${fromISO}`);

    // Filtro de línea (aceptamos nombre o código para robustez)
    if (line && line !== "ALL") {
      const pat = `%${line}%`;
      base = base.or(`line_name.ilike.${pat},line_code.ilike.${pat}`);
    }

    // Búsqueda libre opcional (por línea/máquina)
    if (q && q.trim()) {
      const s = `%${q.trim()}%`;
      base = base.or(`line_name.ilike.${s},line_code.ilike.${s},machine_name.ilike.${s},machine_label.ilike.${s}`);
    }

    const { data, error } = await base
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows: PendingRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      // IMPORTANTE: el UI muestra "line_code", pero queremos ver el nombre humano:
      line_code: r.line_name ?? r.line_code ?? null,
      // Y "machine_code" lo llenamos con el nombre de máquina legible:
      machine_code: r.machine_name ?? null,
      started_at: r.started_at ?? null,
      ended_at: r.ended_at ?? null,
      duration_min: r.duration_min != null ? Number(r.duration_min) : null,
      // Por ahora no llenamos niveles, a menos que la vista los traiga
      lvl1: null,
      lvl2: null,
      lvl3: null,
      classified: r.is_pending === false ? true : (r.is_pending === true ? false : null),
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    console.error("API /pending error:", err?.message || err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}


