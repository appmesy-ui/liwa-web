// app/api/performance/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Estructuras que espera el frontend en /dashboard/performance/[line] */
type SpeedSegment = {
  id: string;
  started_at: string;        // ISO
  ended_at: string;          // ISO
  duration_s: number;
  ideal_rate_u_min: number;
  actual_rate_u_min: number;
  sku?: string | null;
  notes?: string | null;
};

type PerfDetail = {
  line_code: string;
  performance?: number | null; // 0–1
  planned_s?: number | null;
  runtime_s?: number | null;
  speed_segments?: SpeedSegment[];
};

/** Filas de OEE por turno (coinciden con /api/kpis) */
type OeeRow = {
  line_id: string;
  plant_id: string | null;
  planned_time_s: number | null;
  availability: number | null; // 0–1
  performance: number | null;  // 0–1
  quality: number | null;      // 0–1
  oee: number | null;          // 0–1
  shift_instance_id: string;
};

type LineRow = { id: string; name: string | null; code: string | null };

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
      global: { headers: { "X-Client-Info": "liwa-perf-detail" } },
      db: { schema: "liwa" },
    });

    // ====== Parámetros ======
    const { searchParams } = new URL(req.url);
    const lineParam = (searchParams.get("line") || "").trim();
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO =
      searchParams.get("from") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const orgId = searchParams.get("org_id");
    const plantId = searchParams.get("plant_id");
    const segLimit = Math.min(500, Math.max(50, Number(searchParams.get("limit") || 200)));

    if (!lineParam) {
      return NextResponse.json(
        { ok: false, error: "Falta parámetro 'line' (código/nombre de línea)" },
        { status: 400 }
      );
    }

    // ====== Resolver line_id por nombre/código ======
    async function resolveLine() {
      const needle = lineParam;

      // 1) nombre exacto (case-insensitive)
      let { data, error } = await admin
        .from("lines")
        .select("id,name,code")
        .ilike("name", needle)
        .limit(1) as unknown as { data: LineRow[] | null; error: any };
      if (error) throw error;

      // 2) contiene en nombre
      if (!data?.[0]) {
        const { data: d2, error: e2 } = await admin
          .from("lines")
          .select("id,name,code")
          .ilike("name", `%${needle}%`)
          .limit(1) as unknown as { data: LineRow[] | null; error: any };
        if (e2) throw e2;
        data = d2;
      }

      // 3) por código
      if (!data?.[0]) {
        const { data: d3, error: e3 } = await admin
          .from("lines")
          .select("id,name,code")
          .ilike("code", needle)
          .limit(1) as unknown as { data: LineRow[] | null; error: any };
        if (e3) throw e3;
        data = d3;
      }

      const line = data?.[0];
      return line ? ({ id: line.id, label: (line.name || line.code || needle) as string }) : null;
    }

    const line = await resolveLine();

    // Siempre devolvemos al menos el label que vino por parámetro
    const detail: PerfDetail = {
      line_code: line?.label || lineParam,
      performance: null,
      planned_s: null,
      runtime_s: null,
      speed_segments: [],
    };

    // Si no resolvimos la línea, devolvemos estructura vacía (el frontend ya mezcla con /api/kpis)
    if (!line) {
      return NextResponse.json({ ok: true, data: detail });
    }

    // ====== Buscar shifts que se SOLAPAN con [from, to) ======
    const { data: shifts, error: shiftsErr } = await admin
      .from("v_shift_instances_resolved")
      .select("shift_instance_id, starts_at, ends_at")
      .lt("starts_at", toISO)
      .gt("ends_at", fromISO);
    if (shiftsErr) throw shiftsErr;

    const shiftIds = (shifts || []).map((s: any) => s.shift_instance_id as string);
    if (shiftIds.length === 0) {
      return NextResponse.json({ ok: true, data: detail });
    }

    // ====== OEE por turno de esa línea ======
    const { data: oeeRows, error: oeeErr } = await admin
      .from("v_oee_by_shift")
      .select("line_id, plant_id, planned_time_s, availability, performance, oee, shift_instance_id")
      .eq("line_id", line.id)
      .in("shift_instance_id", shiftIds)
      .limit(50000);
    if (oeeErr) throw oeeErr;

    // Filtro por planta si vino
    const rows = (oeeRows || []).filter((r: any) => (plantId ? r.plant_id === plantId : true)) as OeeRow[];

    // Agregado (ponderado por plan)
    let totalPlan = 0;
    let sumPerf = 0;
    let sumAvailXPlan = 0;
    for (const r of rows) {
      const w = Math.max(0, Number(r.planned_time_s || 0));
      if (!w) continue;
      totalPlan += w;
      sumPerf += Number(r.performance || 0) * w;
      sumAvailXPlan += Number(r.availability || 0) * w; // runtime aprox
    }

    if (totalPlan > 0) {
      detail.performance = sumPerf / totalPlan;
      detail.planned_s = totalPlan;
      detail.runtime_s = sumAvailXPlan;
    }

    // ====== Intento traer segmentos reales (si tienes vista/tabla) ======
    async function tryFetchSegments(viewOrTable: string) {
      try {
        const sel =
          "id, line_id, started_at, ended_at, duration_s, ideal_rate_u_min, actual_rate_u_min, sku, notes";
        let q = admin.from(viewOrTable).select(sel)
          .eq("line_id", line.id)
          .lt("started_at", toISO)
          .gte("ended_at", fromISO)
          .order("started_at", { ascending: false })
          .limit(segLimit);

        if (orgId) q = (q as any).eq("org_id", orgId);
        if (plantId) q = (q as any).eq("plant_id", plantId);

        const { data, error } = await q;
        if (error) throw error;

        const mapped: SpeedSegment[] = (data || []).map((s: any) => ({
          id: String(s.id),
          started_at: s.started_at,
          ended_at: s.ended_at,
          duration_s: Number(
            s.duration_s ??
              Math.max(0, (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)
          ),
          ideal_rate_u_min: Number(s.ideal_rate_u_min ?? 0),
          actual_rate_u_min: Number(s.actual_rate_u_min ?? 0),
          sku: s.sku ?? null,
          notes: s.notes ?? null,
        }));
        return mapped;
      } catch {
        return null; // la vista/tabla puede no existir
      }
    }

    let segments: SpeedSegment[] | null = await tryFetchSegments("v_speed_segments");
    if (!segments) segments = await tryFetchSegments("speed_segments");
    if (!segments) segments = [];

    detail.speed_segments = segments;

    return NextResponse.json({ ok: true, data: detail });
  } catch (err: any) {
    console.error("API /performance error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

