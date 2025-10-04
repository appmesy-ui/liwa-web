// app/api/kpis/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Fila para la tabla de KPIs */
type RowUI = {
  line_code: string | null;
  plant_id: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;  // 0–1
  quality: number | null;      // 0–1
  oee: number | null;          // 0–1
  trend_pp: number;            // delta en puntos porcentuales
  // —— unidades (opcionales) ——
  units_total?: number | null;
  units_good?: number | null;
  units_scrap?: number | null;
  units_rework?: number | null;
};

type SeriesPointFlat = {
  bucket_ts: string;
  line_code: string | null;
  oee: number | null; // 0–1
};

type OeeRow = {
  line_id: string;
  plant_id: string | null;
  planned_time_s: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  shift_instance_id: string;
};

type UnitsRow = {
  line_id: string;
  shift_instance_id: string;
  // en v_oee_by_shift NO existe units_total ni units_rework
  units_total: number | null;
  units_good: number | null;
  units_scrap: number | null;
  units_rework: number | null;
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
      global: { headers: { "X-Client-Info": "liwa-kpis" } },
      db: { schema: "liwa" },
    });

    // ====== Parámetros ======
    const { searchParams } = new URL(req.url);
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO =
      searchParams.get("from") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const step = (searchParams.get("step") ?? "all") as "all" | "kpis" | "series";
    const lineFilter = searchParams.get("line");   // filtra por código de línea (exacto)
    const orgId = searchParams.get("org_id");      // opcional: filtrar por organización
    const plantId = searchParams.get("plant_id");  // opcional: filtrar por planta

    // Duración y bucket
    const fromMs = new Date(fromISO).getTime();
    const toMs = new Date(toISO).getTime();
    const windowMs = Math.max(0, toMs - fromMs);
    const bucket: "hour" | "day" = windowMs <= 3 * 24 * 3600 * 1000 ? "hour" : "day";

    // Ventana anterior
    const prevToISO = new Date(fromMs).toISOString();
    const prevFromISO = new Date(fromMs - windowMs).toISOString();

    // ===== Helpers =====
    const toNum = (v: any) => Number(v ?? 0);
    const fmtBucket = (iso: string) => {
      const d = new Date(iso);
      if (bucket === "day") {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
      }
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
      ).toISOString();
    };

    // Buscar shifts que se SOLAPAN con [from, to)
    const findShiftIds = async (from: string, to: string) => {
      let q = admin
        .from("v_shift_instances_resolved")
        .select("shift_instance_id, starts_at, ends_at")
        .lt("starts_at", to)
        .gt("ends_at", from);

      // Si tu vista incluye org_id/plant_id, podés descomentar:
      // if (orgId)   q = q.eq("org_id", orgId);
      // if (plantId) q = q.eq("plant_id", plantId);

      const { data, error } = await q;
      if (error) throw error;

      const ids = (data ?? []).map((r: any) => r.shift_instance_id as string);
      const timeByShift = new Map<string, { start: string; end: string }>();
      for (const r of data ?? []) {
        timeByShift.set((r as any).shift_instance_id, {
          start: (r as any).starts_at,
          end: (r as any).ends_at,
        });
      }
      return { ids, timeByShift };
    };

    // Trae OEE por shift
    const fetchOeeByShifts = async (shiftIds: string[]) => {
      if (!shiftIds.length) return [] as OeeRow[];
      const { data, error } = await admin
        .from("v_oee_by_shift")
        .select(
          "line_id, plant_id, planned_time_s, availability, performance, quality, oee, shift_instance_id"
        )
        .in("shift_instance_id", shiftIds)
        .limit(50000);
      if (error) throw error;
      return (data ?? []) as unknown as OeeRow[];
    };

    // —— Unidades reales desde v_oee_by_shift (buenas + scrap) ——
    const fetchUnitsByShifts = async (shiftIds: string[]) => {
      if (!shiftIds.length) return [] as UnitsRow[];
      // Leemos de v_oee_by_shift porque ahí están good_units y scrap_units
      let q = admin
        .from("v_oee_by_shift")
        .select("line_id, shift_instance_id, good_units, scrap_units, plant_id")
        .in("shift_instance_id", shiftIds)
        .limit(50000);
      if (plantId) q = q.eq("plant_id", plantId);
      const { data, error } = await q;
      if (error) throw error;

      // Mapeamos al esquema UnitsRow y derivamos total = good + scrap (rework = null)
      const rows: UnitsRow[] = (data ?? []).map((r: any) => ({
        line_id: r.line_id,
        shift_instance_id: r.shift_instance_id,
        units_good: Number(r.good_units ?? 0),
        units_scrap: Number(r.scrap_units ?? 0),
        units_total: Number(r.good_units ?? 0) + Number(r.scrap_units ?? 0),
        units_rework: null,
      }));
      return rows;
    };

    // Trae códigos de línea (L1, L2, …)
    const fetchLineCodes = async (lineIds: string[]) => {
      if (!lineIds.length) return new Map<string, string | null>();
      let q = admin.from("lines").select("id, code").in("id", Array.from(new Set(lineIds)));
      // Si querés acotar por planta aquí, descomenta si tu tabla tiene plant_id:
      // if (plantId) q = q.eq("plant_id", plantId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, string | null>();
      for (const l of (data ?? []) as any[]) map.set(l.id, l.code ?? null);
      return map;
    };

    // Agrega KPIs ponderados por línea
    const aggregateByLine = (rows: OeeRow[]) => {
      type Acc = {
        plant_id: string | null;
        totalPlan: number;
        sumA: number;
        sumP: number;
        sumQ: number;
        sumO: number;
      };
      const byLine = new Map<string, Acc>();
      for (const r of rows) {
        const lid = r.line_id;
        const w = Math.max(0, toNum(r.planned_time_s));
        if (!w) continue;
        if (!byLine.has(lid)) {
          byLine.set(lid, {
            plant_id: r.plant_id ?? null,
            totalPlan: 0,
            sumA: 0,
            sumP: 0,
            sumQ: 0,
            sumO: 0,
          });
        }
        const acc = byLine.get(lid)!;
        acc.totalPlan += w;
        acc.sumA += toNum(r.availability) * w;
        acc.sumP += toNum(r.performance) * w;
        acc.sumQ += toNum(r.quality) * w;
        acc.sumO += toNum(r.oee) * w;
      }
      return byLine;
    };

    // —— Agregador de unidades por línea (suma simple, derivando total si falta) ——
    const aggregateUnitsByLine = (rows: UnitsRow[]) => {
      type UAcc = {
        units_total: number;
        units_good: number;
        units_scrap: number;
        units_rework: number;
      };
      const byLine = new Map<string, UAcc>();
      for (const r of rows) {
        const lid = r.line_id;
        if (!byLine.has(lid)) {
          byLine.set(lid, { units_total: 0, units_good: 0, units_scrap: 0, units_rework: 0 });
        }
        const acc = byLine.get(lid)!;
        const g = Math.max(0, toNum(r.units_good));
        const s = Math.max(0, toNum(r.units_scrap));
        const rw = Math.max(0, toNum(r.units_rework));
        // si units_total viene null o menor al componente, lo derivamos como g + s + rw
        const t = r.units_total != null ? Math.max(0, toNum(r.units_total)) : g + s + rw;

        acc.units_good   += g;
        acc.units_scrap  += s;
        acc.units_rework += rw;
        acc.units_total  += t ?? (g + s + rw);
      }
      return byLine;
    };

    // ====== Ventana actual ======
    const { ids: nowShiftIds, timeByShift: nowTimes } = await findShiftIds(fromISO, toISO);
    let nowRows = await fetchOeeByShifts(nowShiftIds);
    const nowUnitsRows = await fetchUnitsByShifts(nowShiftIds);

    // Filtro por planta (si la vista trae plant_id)
    if (plantId) nowRows = nowRows.filter((r) => (r.plant_id ?? null) === plantId);

    const nowAgg = aggregateByLine(nowRows);
    const nowUnitsAgg = aggregateUnitsByLine(nowUnitsRows);

    // Si no hay datos, devolvemos vacío pero con pending real
    if (nowAgg.size === 0 && nowUnitsAgg.size === 0) {
      const pending = await countPending(admin as any, fromISO, toISO, lineFilter, orgId, plantId);
      const payload: any = { ok: true, pending, rows: [], series: [] };
      if (step === "kpis") delete payload.series;
      if (step === "series") delete payload.rows;
      return NextResponse.json(payload);
    }

    // ====== Ventana anterior ======
    const { ids: prevShiftIds } = await findShiftIds(prevFromISO, prevToISO);
    let prevRows = await fetchOeeByShifts(prevShiftIds);
    if (plantId) prevRows = prevRows.filter((r) => (r.plant_id ?? null) === plantId);
    const prevAgg = aggregateByLine(prevRows);

    // ====== Códigos de líneas ======
    const allLineIds = [
      ...new Set([
        ...nowRows.map(r => r.line_id),
        ...prevRows.map(r => r.line_id),
        ...Array.from(nowUnitsAgg.keys()),
      ]),
    ];
    const codeById = await fetchLineCodes(allLineIds);

    // ====== Series planas (sparkline) ======
    type BAcc = { w: number; sumO: number; t: string };
    const byLineBucket = new Map<string, Map<string, BAcc>>();

    for (const r of nowRows) {
      const ts = nowTimes.get(r.shift_instance_id);
      if (!ts) continue;
      const key = fmtBucket(ts.start);
      const lid = r.line_id;
      const w = Math.max(1, (new Date(ts.end).getTime() - new Date(ts.start).getTime()) / 1000);
      const o = toNum(r.oee);

      if (!byLineBucket.has(lid)) byLineBucket.set(lid, new Map());
      const inner = byLineBucket.get(lid)!;
      if (!inner.has(key)) inner.set(key, { w: 0, sumO: 0, t: key });
      const acc = inner.get(key)!;
      acc.w += w;
      acc.sumO += o * w;
    }

    const series: SeriesPointFlat[] = [];
    for (const [lid, bucketMap] of byLineBucket.entries()) {
      const line_code = codeById.get(lid) ?? null;
      for (const b of Array.from(bucketMap.values()).sort((a, b) => a.t.localeCompare(b.t))) {
        const oee = b.w ? b.sumO / b.w : 0;
        series.push({ bucket_ts: b.t, line_code, oee });
      }
    }

    // ====== Filas con tendencia + unidades ======
    let rows: RowUI[] = [];
    for (const lid of new Set([...nowAgg.keys(), ...nowUnitsAgg.keys()])) {
      const acc = nowAgg.get(lid);
      const uacc = nowUnitsAgg.get(lid);
      const code = codeById.get(lid) ?? null;

      let curA: number | null = null;
      let curP: number | null = null;
      let curQ: number | null = null;
      let curO: number | null = null;
      let planned_runtime_sec: number | null = null;
      let trend_pp = 0;

      if (acc) {
        const w = Math.max(1, acc.totalPlan);
        curA = acc.sumA / w;
        curP = acc.sumP / w;
        curQ = acc.sumQ / w;
        curO = acc.sumO / w;
        planned_runtime_sec = acc.totalPlan;

        const prev = prevAgg.get(lid);
        if (prev) {
          const pw = Math.max(1, prev.totalPlan);
          const prevO = prev.sumO / pw;
          trend_pp = (curO - prevO) * 100;
        }
      }

      rows.push({
        line_code: code,
        plant_id: acc?.plant_id ?? null,
        planned_runtime_sec,
        availability: curA,
        performance: curP,
        quality: curQ,
        oee: curO,
        trend_pp: +trend_pp.toFixed(1),
        units_total: uacc ? uacc.units_total : null,   // total REAL (o derivado g+s)
        units_good: uacc ? uacc.units_good  : null,
        units_scrap: uacc ? uacc.units_scrap : null,
        units_rework: uacc ? uacc.units_rework : null, // seguirá null (no existe en fuente)
      });
    }

    // Filtro por línea exacto (case-insensitive) si se pidió
    if (lineFilter) {
      const needle = lineFilter.toUpperCase();
      rows = rows.filter((x) => (x.line_code ?? "").toUpperCase() === needle);
    }

    // Orden por OEE desc (si falta OEE, al final)
    rows.sort((a, b) => (b.oee ?? -1) - (a.oee ?? -1));

    // Paros sin clasificar (con filtros de org/planta)
    const pending = await countPending(admin as any, fromISO, toISO, lineFilter, orgId, plantId);

    // ====== Respuesta ======
    const payload: any = { ok: true, pending };
    if (step === "all" || step === "kpis") payload.rows = rows;
    if (step === "all" || step === "series") payload.series = series;

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("API /kpis error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

/** Conteo de paros sin clasificar en el rango [fromISO, toISO) */
async function countPending(
  admin: any,
  fromISO: string,
  toISO: string,
  lineFilter: string | null,
  orgId: string | null,
  plantId: string | null
): Promise<number> {
  // Base común de filtros (sin línea)
  const baseFilters = (q: any) => {
    let qq = q
      .eq("is_pending", true)
      .lt("started_at", toISO)
      .or(`ended_at.is.null,ended_at.gte.${fromISO}`);

    // aplicar org/planta si vienen
    if (orgId) qq = qq.eq("org_id", orgId);
    if (plantId) qq = qq.eq("plant_id", plantId);

    return qq;
  };

  if (!lineFilter) {
    const { count, error } = await baseFilters(
      admin.from("v_pending_events_ui").select("id", { count: "exact" })
    ).range(0, 0);
    if (error && (error as any).code !== "PGRST116") throw error;
    return count ?? 0;
  }

  const pat = `%${lineFilter}%`;

  // 1) buscar por nombre de línea
  {
    const { count, error } = await baseFilters(
      admin.from("v_pending_events_ui").select("id", { count: "exact" }).ilike("line_name", pat)
    ).range(0, 0);
    if (error && (error as any).code !== "PGRST116") throw error;
    if ((count ?? 0) > 0) return count ?? 0;
  }

  // 2) si no hubo match, buscar por código
  {
    const { count, error } = await baseFilters(
      admin.from("v_pending_events_ui").select("id", { count: "exact" }).ilike("line_code", pat)
    ).range(0, 0);
    if (error && (error as any).code !== "PGRST116") throw error;
    return count ?? 0;
  }
}

