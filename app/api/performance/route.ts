// app/api/performance/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Estructuras que espera el frontend en /dashboard/performance/[line] */
type SpeedSegment = {
  id: string;
  started_at: string; // ISO
  ended_at: string; // ISO
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
  performance: number | null; // 0–1
  oee: number | null; // 0–1
  shift_instance_id: string;
};

type LineRow = { id: string; name: string | null; code: string | null };

type ShiftRow = {
  shift_instance_id: string;
  starts_at: string;
  ends_at: string;
};

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY",
        },
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
      searchParams.get("from") ??
      new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const orgId = searchParams.get("org_id");
    const plantId = searchParams.get("plant_id");
    const segLimit = Math.min(
      500,
      Math.max(50, Number(searchParams.get("limit") || 200))
    );

    if (!lineParam) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falta parámetro 'line' (código/nombre de línea)",
        },
        { status: 400 }
      );
    }

    const fromTs = new Date(fromISO);
    const toTs = new Date(toISO);

    // ====== Resolver line_id por nombre/código ======
    async function resolveLine() {
      const needle = lineParam;

      // 1) nombre exacto (case-insensitive)
      let { data, error } = (await admin
        .from("lines")
        .select("id,name,code")
        .ilike("name", needle)
        .limit(1)) as unknown as {
        data: LineRow[] | null;
        error: any;
      };
      if (error) throw error;

      // 2) contiene en nombre
      if (!data?.[0]) {
        const { data: d2, error: e2 } = (await admin
          .from("lines")
          .select("id,name,code")
          .ilike("name", `%${needle}%`)
          .limit(1)) as unknown as {
          data: LineRow[] | null;
          error: any;
        };
        if (e2) throw e2;
        data = d2;
      }

      // 3) por código
      if (!data?.[0]) {
        const { data: d3, error: e3 } = (await admin
          .from("lines")
          .select("id,name,code")
          .ilike("code", needle)
          .limit(1)) as unknown as {
          data: LineRow[] | null;
          error: any;
        };
        if (e3) throw e3;
        data = d3;
      }

      const line = data?.[0];
      return line
        ? ({ id: line.id, label: (line.name || line.code || needle) as string })
        : null;
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

    // Si no resolvimos la línea, devolvemos estructura vacía
    if (!line) {
      return NextResponse.json({ ok: true, data: detail });
    }

    // ====== 1) Turnos que se SOLAPAN con [from,to) ======
    const { data: shifts, error: shiftsErr } = await admin
      .from("v_shift_instances_resolved")
      .select("shift_instance_id, starts_at, ends_at")
      .lt("starts_at", toISO)
      .gt("ends_at", fromISO);

    if (shiftsErr) throw shiftsErr;

    const shiftRows = (shifts || []) as ShiftRow[];
    const shiftIds = shiftRows.map((s) => s.shift_instance_id);

    if (shiftIds.length === 0) {
      return NextResponse.json({ ok: true, data: detail });
    }

    const shiftById: Record<string, ShiftRow> = {};
    for (const s of shiftRows) {
      shiftById[s.shift_instance_id] = s;
    }

    // ====== 2) OEE por turno (v_oee_by_shift), SOLO esa línea ======
    const { data: oeeRows, error: oeeErr } = await admin
      .from("v_oee_by_shift")
      .select(
        "line_id, plant_id, planned_time_s, availability, performance, oee, shift_instance_id"
      )
      .eq("line_id", line.id)
      .in("shift_instance_id", shiftIds)
      .limit(50000);

    if (oeeErr) throw oeeErr;

    const rows = (oeeRows || []).filter((r: any) =>
      plantId ? r.plant_id === plantId : true
    ) as OeeRow[];

    // Si no hay base, devolvemos sin segmentos ni métricas
    if (!rows.length) {
      // Igual intentamos traer segmentos, para que al menos se vea el gráfico
      let segments: SpeedSegment[] | null = await tryFetchSegments(
        admin,
        line.id,
        fromISO,
        toISO,
        orgId,
        plantId,
        segLimit
      );
      if (!segments)
        segments = await tryFetchSegments(
          admin,
          line.id,
          fromISO,
          toISO,
          orgId,
          plantId,
          segLimit,
          "speed_segments"
        );
      if (!segments) segments = [];

      detail.speed_segments = segments;
      return NextResponse.json({ ok: true, data: detail });
    }

    // ====== 3) Agregar SOLO para esta línea con la MISMA lógica de /api/kpis ======
    let linePlanned = 0; // tiempo planificado real de línea en la ventana
    let wPerf = 0; // sumatorio P ponderado
    let wAvail = 0; // sumatorio A ponderado
    let weight = 0; // suma de pesos (segundos de solape)
    const seenShifts = new Set<string>();

    for (const r of rows) {
      const shift = shiftById[r.shift_instance_id];
      if (!shift) continue;

      const sStart = new Date(shift.starts_at);
      const sEnd = new Date(shift.ends_at);

      const overlapStart = sStart < fromTs ? fromTs : sStart;
      const overlapEnd = sEnd > toTs ? toTs : sEnd;
      const diffMs = overlapEnd.getTime() - overlapStart.getTime();
      const plannedOverlapSec = diffMs > 0 ? diffMs / 1000 : 0;

      if (plannedOverlapSec <= 0) continue;

      const pVal =
        r.performance !== null && r.performance !== undefined
          ? Number(r.performance)
          : null;
      const aVal =
        r.availability !== null && r.availability !== undefined
          ? Number(r.availability)
          : null;

      if (pVal !== null) wPerf += pVal * plannedOverlapSec;
      if (aVal !== null) wAvail += aVal * plannedOverlapSec;
      weight += plannedOverlapSec;

      if (!seenShifts.has(r.shift_instance_id)) {
        linePlanned += plannedOverlapSec;
        seenShifts.add(r.shift_instance_id);
      }
    }

    if (weight > 0 && linePlanned > 0) {
      const perf = wPerf / weight;
      const availAvg = wAvail > 0 ? wAvail / weight : 0;

      detail.performance = perf;
      detail.planned_s = linePlanned;
      detail.runtime_s = availAvg * linePlanned;
    }

    // ====== 4) Segmentos de velocidad ======
    let segments: SpeedSegment[] | null = await tryFetchSegments(
      admin,
      line.id,
      fromISO,
      toISO,
      orgId,
      plantId,
      segLimit
    );
    if (!segments)
      segments = await tryFetchSegments(
        admin,
        line.id,
        fromISO,
        toISO,
        orgId,
        plantId,
        segLimit,
        "speed_segments"
      );
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

/**
 * Intenta leer segmentos de una vista/tabla (v_speed_segments o speed_segments)
 */
async function tryFetchSegments(
  admin: any,                     // <- relajamos el tipo aquí
  lineId: string,
  fromISO: string,
  toISO: string,
  orgId: string | null,
  plantId: string | null,
  limit: number,
  viewOrTable = "v_speed_segments"
): Promise<SpeedSegment[] | null> {
  try {
    const sel =
      "id, line_id, started_at, ended_at, duration_s, ideal_rate_u_min, actual_rate_u_min, sku, notes";
    let q = admin
      .from(viewOrTable)
      .select(sel)
      .eq("line_id", lineId)
      .lt("started_at", toISO)
      .gte("ended_at", fromISO)
      .order("started_at", { ascending: false })
      .limit(limit);

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
          Math.max(
            0,
            (new Date(s.ended_at).getTime() -
              new Date(s.started_at).getTime()) /
              1000
          )
      ),
      ideal_rate_u_min: Number(s.ideal_rate_u_min ?? 0),
      actual_rate_u_min: Number(s.actual_rate_u_min ?? 0),
      sku: s.sku ?? null,
      notes: s.notes ?? null,
    }));

    return mapped;
  } catch {
    return null;
  }
}
