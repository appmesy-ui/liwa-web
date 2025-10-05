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

    // ========= Parámetros =========
    const { searchParams } = new URL(req.url);
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO = searchParams.get("from") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const step = (searchParams.get("step") ?? "all") as "all" | "kpis" | "series";
    const lineFilter = searchParams.get("line");
    const orgId   = searchParams.get("org_id");
    const plantId = searchParams.get("plant_id");

    const fromMs = new Date(fromISO).getTime();
    const toMs   = new Date(toISO).getTime();
    const windowMs = Math.max(0, toMs - fromMs);
    const bucket: "hour" | "day" = windowMs <= 3 * 24 * 3600 * 1000 ? "hour" : "day";

    const prevToISO = new Date(fromMs).toISOString();
    const prevFromISO = new Date(fromMs - windowMs).toISOString();

    const toNum = (v: any) => Number(v ?? 0);
    const clamp01 = (n?: number | null) => Math.max(0, Math.min(1, Number.isFinite(n as number) ? (n as number) : 0));

    const fmtBucket = (iso: string) => {
      const d = new Date(iso);
      if (bucket === "day") {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
      }
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).toISOString();
    };

    // ========= Shifts que se solapan con [from,to) =========
    const findShiftIds = async (from: string, to: string) => {
      // Esta vista trae org_id y plant_id (según tu SQL).
      let q = admin
        .from("v_shift_instances_resolved")
        .select("shift_instance_id, starts_at, ends_at, org_id, plant_id")
        .lt("starts_at", to)
        .gt("ends_at", from);

      if (orgId)   q = q.eq("org_id", orgId);
      if (plantId) q = q.eq("plant_id", plantId);

      const { data, error } = await q;
      if (error) throw error;

      const ids = (data ?? []).map((r: any) => r.shift_instance_id as string);
      const timeByShift = new Map<string, { start: string; end: string }>();
      for (const r of data ?? []) {
        timeByShift.set((r as any).shift_instance_id, { start: (r as any).starts_at, end: (r as any).ends_at });
      }
      return { ids, timeByShift };
    };

    // ========= OEE por turno =========
    const fetchOeeByShifts = async (shiftIds: string[]) => {
      if (!shiftIds.length) return [] as OeeRow[];
      let q = admin
        .from("v_oee_by_shift")
        .select("line_id, plant_id, planned_time_s, availability, performance, quality, oee, shift_instance_id")
        .in("shift_instance_id", shiftIds)
        .limit(50000);
      if (plantId) q = q.eq("plant_id", plantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OeeRow[];
    };

    // === DEDUPE CRÍTICO ===
    // Algunas instalaciones devuelven varias filas por (shift_instance_id, line_id).
    // Nos quedamos con UNA fila por par, priorizando la de mayor planned_time_s.
    function dedupeByShiftLine(rows: OeeRow[]): OeeRow[] {
      const map = new Map<string, OeeRow>();
      for (const r of rows) {
        const k = `${r.shift_instance_id}|${r.line_id}`;
        const cur = map.get(k);
        if (!cur || toNum(r.planned_time_s) > toNum(cur.planned_time_s)) {
          map.set(k, r);
        }
      }
      return Array.from(map.values());
    }

    // ========= Unidades por turno (good/scrap) =========
    const fetchUnitsByShifts = async (shiftIds: string[]) => {
      if (!shiftIds.length) return [] as UnitsRow[];
      let q = admin
        .from("v_oee_by_shift")
        .select("line_id, shift_instance_id, good_units, scrap_units, plant_id")
        .in("shift_instance_id", shiftIds)
        .limit(50000);
      if (plantId) q = q.eq("plant_id", plantId);
      const { data, error } = await q;
      if (error) throw error;

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

    // ========= Códigos de línea =========
    const fetchLineCodes = async (lineIds: string[]) => {
      if (!lineIds.length) return new Map<string, string | null>();
      const { data, error } = await admin
        .from("lines")
        .select("id, code")
        .in("id", Array.from(new Set(lineIds)));
      if (error) throw error;
      const map = new Map<string, string | null>();
      for (const l of (data ?? []) as any[]) map.set(l.id, l.code ?? null);
      return map;
    };

    // ========= Agregador con RECORTE por solape con [from,to) =========
    function aggregateByLine(
      rows: OeeRow[],
      times: Map<string, { start: string; end: string }>,
      fromMs: number,
      toMs: number
    ) {
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
        const ts = times.get(r.shift_instance_id);
        if (!ts) continue;

        const sMs = new Date(ts.start).getTime();
        const eMs = new Date(ts.end).getTime();
        const overlapSec = Math.max(0, Math.min(eMs, toMs) - Math.max(sMs, fromMs)) / 1000;
        const shiftSec   = Math.max(0, eMs - sMs) / 1000;
        if (overlapSec <= 0 || shiftSec <= 0) continue;

        // peso proporcional al solape
        const frac = overlapSec / shiftSec;
        const w = Math.max(0, toNum(r.planned_time_s)) * frac;
        if (!w) continue;

        const lid = r.line_id;
        if (!byLine.has(lid)) {
          byLine.set(lid, { plant_id: r.plant_id ?? null, totalPlan: 0, sumA: 0, sumP: 0, sumQ: 0, sumO: 0 });
        }
        const acc = byLine.get(lid)!;
        acc.totalPlan += w;
        acc.sumA += clamp01(r.availability) * w;
        acc.sumP += clamp01(r.performance)  * w;
        acc.sumQ += clamp01(r.quality)      * w;
        acc.sumO += clamp01(r.oee)          * w;
      }
      return byLine;
    }

    // ========= Ventana actual =========
    const { ids: nowShiftIds, timeByShift: nowTimes } = await findShiftIds(fromISO, toISO);
    let   nowRows      = await fetchOeeByShifts(nowShiftIds);
    const nowUnitsRows = await fetchUnitsByShifts(nowShiftIds);

    // DEDUPE clave aquí
    nowRows = dedupeByShiftLine(nowRows);

    if (plantId) nowRows = nowRows.filter(r => (r.plant_id ?? null) === plantId);

    // === CEILING TEST (techo físico por (shift,line) usando duración solapada del turno) ===
    let planned_ceiling_sec = 0;
    for (const r of nowRows) {
      const ts = nowTimes.get(r.shift_instance_id);
      if (!ts) continue;
      const sMs = new Date(ts.start).getTime();
      const eMs = new Date(ts.end).getTime();
      const overlapSec = Math.max(0, Math.min(eMs, toMs) - Math.max(sMs, fromMs)) / 1000;
      planned_ceiling_sec += Math.max(0, overlapSec);
    }

    const nowAgg = aggregateByLine(nowRows, nowTimes, fromMs, toMs);

    // Si no hay datos, devolvemos vacío pero con pending
    if (nowAgg.size === 0 && nowUnitsRows.length === 0) {
      const pending = await countPending(admin as any, fromISO, toISO, lineFilter, orgId, plantId);
      const payload: any = { ok: true, pending, rows: [], series: [], planned_sum_sec: 0, planned_ceiling_sec: 0, planned_overflow: false, planned_overflow_pct: 0 };
      if (step === "kpis") delete payload.series;
      if (step === "series") delete payload.rows;
      return NextResponse.json(payload);
    }

    // ========= Ventana anterior (tendencia) =========
    const { ids: prevShiftIds, timeByShift: prevTimes } = await findShiftIds(prevFromISO, prevToISO);
    let prevRows = await fetchOeeByShifts(prevShiftIds);
    prevRows = dedupeByShiftLine(prevRows);
    if (plantId) prevRows = prevRows.filter(r => (r.plant_id ?? null) === plantId);
    const prevAgg = aggregateByLine(prevRows, prevTimes, new Date(prevFromISO).getTime(), new Date(prevToISO).getTime());

    // ========= Códigos de línea =========
    const allLineIds = [
      ...new Set([
        ...nowRows.map(r => r.line_id),
        ...prevRows.map(r => r.line_id),
      ]),
    ];
    const codeById = await fetchLineCodes(allLineIds);

    // ========= Series (OEE por bucket, pesado por solape y bucket desde inicio RECORTADO) =========
    type BAcc = { w: number; sumO: number; t: string };
    const byLineBucket = new Map<string, Map<string, BAcc>>();
    for (const r of nowRows) {
      const ts = nowTimes.get(r.shift_instance_id);
      if (!ts) continue;
      const sMs = new Date(ts.start).getTime();
      const eMs = new Date(ts.end).getTime();

      // solape con [from,to)
      const overlapMs = Math.max(0, Math.min(eMs, toMs) - Math.max(sMs, fromMs));
      if (overlapMs <= 0) continue;

      const startForBucketISO = new Date(Math.max(sMs, fromMs)).toISOString(); // evita buckets fuera del rango
      const key = fmtBucket(startForBucketISO);

      const lid = r.line_id;
      const w = Math.max(1, overlapMs / 1000);         // peso = segundos solapados
      const o = clamp01(r.oee);                        // OEE 0..1

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

    // ========= Unidades ponderadas por solape (mismo criterio) =========
    const unitsAgg = (() => {
      type UAcc = { total: number; good: number; scrap: number; rework: number };
      const map = new Map<string, UAcc>();
      for (const r of nowUnitsRows) {
        const ts = nowTimes.get(r.shift_instance_id);
        if (!ts) continue;
        const sMs = new Date(ts.start).getTime();
        const eMs = new Date(ts.end).getTime();
        const overlapMs = Math.max(0, Math.min(eMs, toMs) - Math.max(sMs, fromMs));
        const shiftMs   = Math.max(0, eMs - sMs);
        if (overlapMs <= 0 || shiftMs <= 0) continue;
        const frac = overlapMs / shiftMs; // asumimos distribución homogénea

        const lid = r.line_id;
        if (!map.has(lid)) map.set(lid, { total: 0, good: 0, scrap: 0, rework: 0 });
        const a = map.get(lid)!;

        const g = Math.max(0, toNum(r.units_good));
        const s = Math.max(0, toNum(r.units_scrap));
        const rw = Math.max(0, toNum(r.units_rework));
        const t = r.units_total != null ? Math.max(0, toNum(r.units_total)) : g + s + rw;

        a.good   += g  * frac;
        a.scrap  += s  * frac;
        a.rework += rw * frac;
        a.total  += t  * frac;
      }
      return map;
    })();

    // ========= Filas con tendencia + unidades =========
    let rows: RowUI[] = [];
    let planned_sum_sec = 0;
    for (const lid of new Set([...nowAgg.keys(), ...unitsAgg.keys()])) {
      const acc = nowAgg.get(lid);
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
        planned_sum_sec += acc.totalPlan;

        const prev = prevAgg.get(lid);
        if (prev && prev.totalPlan > 0) {
          const pw = prev.totalPlan;
          const prevO = prev.sumO / pw;
          trend_pp = (curO - prevO) * 100;
        }
      }

      const u = unitsAgg.get(lid);
      rows.push({
        line_code: code,
        plant_id: acc?.plant_id ?? null,
        planned_runtime_sec,
        availability: curA,
        performance: curP,
        quality: curQ,
        oee: curO,
        trend_pp: +trend_pp.toFixed(1),
        units_total:  u ? Math.round(u.total)  : null,
        units_good:   u ? Math.round(u.good)   : null,
        units_scrap:  u ? Math.round(u.scrap)  : null,
        units_rework: u ? Math.round(u.rework) : null,
      });
    }

    // Filtro por código de línea exacto (case-insensitive)
    if (lineFilter) {
      const needle = lineFilter.toUpperCase();
      rows = rows.filter((x) => (x.line_code ?? "").toUpperCase() === needle);
    }

    // Orden por OEE desc (faltantes al final)
    rows.sort((a, b) => (b.oee ?? -1) - (a.oee ?? -1));

    // Paros sin clasificar
    const pending = await countPending(admin as any, fromISO, toISO, lineFilter, orgId, plantId);

    // —— Ceiling test flags ——
    const tol = 60; // 60s de tolerancia
    const planned_overflow = planned_sum_sec > planned_ceiling_sec + tol;
    const planned_overflow_pct = planned_ceiling_sec > 0
      ? ((planned_sum_sec - planned_ceiling_sec) / planned_ceiling_sec) * 100
      : 0;

    const payload: any = {
      ok: true,
      pending,
      planned_sum_sec: Math.round(planned_sum_sec),
      planned_ceiling_sec: Math.round(planned_ceiling_sec),
      planned_overflow,
      planned_overflow_pct: Number(planned_overflow_pct.toFixed(2)),
    };
    if (step === "all" || step === "kpis")  payload.rows = rows;
    if (step === "all" || step === "series") payload.series = series;

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("API /kpis error:", err?.message || err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
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
  const baseFilters = (q: any) => {
    let qq = q
      .eq("is_pending", true)
      .lt("started_at", toISO)
      .or(`ended_at.is.null,ended_at.gte.${fromISO}`);
    if (orgId)   qq = qq.eq("org_id", orgId);
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

  // Intento por código de línea
  {
    const { count, error } = await baseFilters(
      admin.from("v_pending_events_ui").select("id", { count: "exact" }).ilike("line_code", pat)
    ).range(0, 0);
    if (error && (error as any).code !== "PGRST116") throw error;
    if ((count ?? 0) > 0) return count ?? 0;
  }

  // Fallback por nombre de línea (si está disponible)
  try {
    const { count, error } = await baseFilters(
      admin.from("v_pending_events_ui").select("id", { count: "exact" }).ilike("line_name", pat)
    ).range(0, 0);
    if (error && (error as any).code !== "PGRST116") throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

