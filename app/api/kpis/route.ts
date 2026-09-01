// app/api/kpis/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env vars for KPIs");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "liwa" },
  });
}

// Turnos resueltos
type ShiftRow = {
  shift_instance_id: string;
  org_id: string | null;
  plant_id: string | null;
  starts_at: string;
  ends_at: string;
};

// Base OEE por máquina+turno
type BaseRow = {
  shift_instance_id: string;
  line_id: string | null;
  machine_id: string | null;
  good_units: number | null;
  scrap_units: number | null;
  planned_time_s: number | null;
  run_time_s: number | null;
  ideal_cycle_s: string | number | null;
  quality: string | number | null;
  performance: string | number | null;
  availability: string | number | null;
};

type LineRow = {
  id: string;
  code: string;
};

type LineAgg = {
  line_id: string;
  plant_id: string | null;
  // tiempo planificado de línea (único por turno+línea)
  linePlanned: number;
  // unidades totales (para info)
  good: number;
  scrap: number;
  // sumatorios ponderados de A, P, Q
  wA: number;
  wP: number;
  wQ: number;
  weight: number;
  // para no sumar dos veces el mismo turno en linePlanned
  seenShifts: Set<string>;
};

// Helper: limita un número a [0, 1] preservando null
function clamp01OrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const v = Number(n);
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export async function GET(req: NextRequest) {
  const supabase = admin();

  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const orgId = searchParams.get("org_id");
    const plantFilter = searchParams.get("plant_id");
    // NOTA: aquí no filtramos por línea; se agregan todas las líneas del rango

    const fromTs = from ? new Date(from) : new Date(Date.now() - 24 * 3600 * 1000);
    const toTs = to ? new Date(to) : new Date();

    // ====================================
    // 1) Turnos que pisan la ventana [from,to] usando v_shift_instances_resolved
    // ====================================
    const fromIso = fromTs.toISOString();
    const toIso = toTs.toISOString();

    let shiftQuery = supabase
      .from("v_shift_instances_resolved")
      .select("shift_instance_id, org_id, plant_id, starts_at, ends_at")
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso);

    if (orgId) {
      shiftQuery = shiftQuery.eq("org_id", orgId);
    }
    if (plantFilter) {
      shiftQuery = shiftQuery.eq("plant_id", plantFilter);
    }

    const { data: shifts, error: errShifts } = await shiftQuery;

    if (errShifts) {
      console.error("Error loading shifts for KPIs:", errShifts);
      throw errShifts;
    }

    if (!shifts || shifts.length === 0) {
      return NextResponse.json({
        ok: true,
        pending: 0,
        planned_sum_sec: 0,
        planned_ceiling_sec: 0,
        planned_overflow: false,
        planned_overflow_pct: 0,
        rows: [],
        series: [],
      });
    }

    const shiftsTyped = shifts as ShiftRow[];
    const shiftIds = shiftsTyped.map((s) => s.shift_instance_id);
    const plantId = shiftsTyped[0].plant_id;

    const shiftById: Record<string, ShiftRow> = {};
    for (const s of shiftsTyped) {
      shiftById[s.shift_instance_id] = s;
    }

    // ====================================
    // 2) Base OEE por máquina+turno (vista v_oee_by_shift)
    //    → ya trae A, P, Q por máquina+turno
    // ====================================
    const { data: base, error: errBase } = await supabase
      .from("v_oee_by_shift")
      .select(
        "shift_instance_id, line_id, machine_id, good_units, scrap_units, planned_time_s, run_time_s, ideal_cycle_s, quality, performance, availability"
      )
      .in("shift_instance_id", shiftIds);

    if (errBase) {
      console.error("Error loading v_oee_by_shift:", errBase);
      throw errBase;
    }

    if (!base || base.length === 0) {
      return NextResponse.json({
        ok: true,
        pending: 0,
        planned_sum_sec: 0,
        planned_ceiling_sec: 0,
        planned_overflow: false,
        planned_overflow_pct: 0,
        rows: [],
        series: [],
      });
    }

    // ====================================
    // 3) Líneas (para códigos L1, L2…)
    // ====================================
    const { data: lines, error: errLines } = await supabase
      .from("lines")
      .select("id, code");

    if (errLines) {
      console.error("Error loading lines:", errLines);
      throw errLines;
    }

    const codeByLine: Record<string, string> = {};
    (lines || []).forEach((ln) => {
      const l = ln as LineRow;
      codeByLine[l.id] = l.code;
    });

    // ====================================
    // 4) Agregar por línea:
    //    - Promedio ponderado de A, P, Q a partir de v_oee_by_shift
    //    - Tiempo planificado de línea = solape turno+línea con [from,to], 1 vez por turno
    // ====================================
    const byLine = new Map<string, LineAgg>();

    for (const rowAny of base as BaseRow[]) {
      const lineId = rowAny.line_id;
      if (!lineId) continue;

      let agg = byLine.get(lineId);
      if (!agg) {
        agg = {
          line_id: lineId,
          plant_id: plantId,
          linePlanned: 0,
          good: 0,
          scrap: 0,
          wA: 0,
          wP: 0,
          wQ: 0,
          weight: 0,
          seenShifts: new Set<string>(),
        };
        byLine.set(lineId, agg);
      }

      const good = Number(rowAny.good_units ?? 0);
      const scrap = Number(rowAny.scrap_units ?? 0);
      const qVal =
        rowAny.quality !== null && rowAny.quality !== undefined
          ? Number(rowAny.quality)
          : null;
      const pVal =
        rowAny.performance !== null && rowAny.performance !== undefined
          ? Number(rowAny.performance)
          : null;
      const aVal =
        rowAny.availability !== null && rowAny.availability !== undefined
          ? Number(rowAny.availability)
          : null;

      agg.good += good;
      agg.scrap += scrap;

      const shiftId = rowAny.shift_instance_id;
      const shift = shiftById[shiftId];
      if (!shift) continue;

      const sStart = new Date(shift.starts_at);
      const sEnd = new Date(shift.ends_at);

      const overlapStart = sStart < fromTs ? fromTs : sStart;
      const overlapEnd = sEnd > toTs ? toTs : sEnd;
      const diffMs = overlapEnd.getTime() - overlapStart.getTime();
      const plannedOverlapSec = diffMs > 0 ? diffMs / 1000 : 0;

      if (plannedOverlapSec <= 0) {
        continue;
      }

      // Ponderamos A, P, Q de esta máquina por el tiempo de solape
      if (aVal !== null) agg.wA += aVal * plannedOverlapSec;
      if (pVal !== null) agg.wP += pVal * plannedOverlapSec;
      if (qVal !== null) agg.wQ += qVal * plannedOverlapSec;
      agg.weight += plannedOverlapSec;

      // Tiempo planificado de línea: solo una vez por turno+línea
      if (!agg.seenShifts.has(shiftId)) {
        agg.linePlanned += plannedOverlapSec;
        agg.seenShifts.add(shiftId);
      }
    }

    const rowsOut: any[] = [];
    let plannedSumSec = 0;

    for (const [lineId, agg] of byLine.entries()) {
      const totalUnits = agg.good + agg.scrap;

      const qualityRaw =
        agg.weight > 0 && agg.wQ > 0 ? agg.wQ / agg.weight : null;
      const performanceRaw =
        agg.weight > 0 && agg.wP > 0 ? agg.wP / agg.weight : null;
      const availabilityRaw =
        agg.weight > 0 && agg.wA > 0 ? agg.wA / agg.weight : null;

      const quality = clamp01OrNull(qualityRaw);
      const performance = clamp01OrNull(performanceRaw);
      const availability = clamp01OrNull(availabilityRaw);

      let oee: number | null = null;
      if (
        quality != null &&
        performance != null &&
        availability != null
      ) {
        oee = quality * performance * availability;
      }

      plannedSumSec += agg.linePlanned;

      rowsOut.push({
        line_code: (codeByLine[lineId] || "—").toUpperCase(),
        plant_id: agg.plant_id,
        planned_runtime_sec: agg.linePlanned,
        availability,
        performance,
        quality,
        oee,
        trend_pp: 0,
        units_total: totalUnits,
        units_good: agg.good,
        units_scrap: agg.scrap,
        units_rework: 0,
      });
    }

    rowsOut.sort((a, b) => a.line_code.localeCompare(b.line_code));

    // ====================================
    // 5) Overflow planificado y serie temporal real
    //    - Hasta 48 h: un punto por turno completado.
    //    - Rangos mayores: un punto diario, ponderado por tiempo planificado.
    //    El turno/día abierto se excluye para no compararlo con periodos completos.
    // ====================================
    const plannedCeilingSec =
      (toTs.getTime() - fromTs.getTime()) / 1000;

    const plannedOverflow =
      plannedCeilingSec > 0 && plannedSumSec > plannedCeilingSec;

    const plannedOverflowPct = plannedCeilingSec
      ? (plannedSumSec / plannedCeilingSec - 1) * 100
      : 0;

    type SeriesAgg = {
      bucket_ts: string;
      line_code: string;
      weightedOee: number;
      weight: number;
    };

    const seriesAgg = new Map<string, SeriesAgg>();
    const useShiftBuckets = toTs.getTime() - fromTs.getTime() <= 48 * 3600 * 1000;
    const effectiveNow = new Date(Math.min(toTs.getTime(), Date.now()));

    for (const row of base as BaseRow[]) {
      if (!row.line_id) continue;
      const shift = shiftById[row.shift_instance_id];
      if (!shift || new Date(shift.ends_at) > effectiveNow) continue;

      const a = clamp01OrNull(row.availability == null ? null : Number(row.availability));
      const p = clamp01OrNull(row.performance == null ? null : Number(row.performance));
      const q = clamp01OrNull(row.quality == null ? null : Number(row.quality));
      if (a == null || p == null || q == null) continue;

      const lineCode = (codeByLine[row.line_id] || "—").toUpperCase();
      const shiftStart = new Date(shift.starts_at);
      const bucketTs = useShiftBuckets
        ? shiftStart.toISOString()
        : new Date(Date.UTC(
            shiftStart.getUTCFullYear(),
            shiftStart.getUTCMonth(),
            shiftStart.getUTCDate()
          )).toISOString();
      const weight = Math.max(1, Number(row.planned_time_s ?? 0));
      const key = `${lineCode}|${bucketTs}`;
      const current = seriesAgg.get(key) || {
        bucket_ts: bucketTs,
        line_code: lineCode,
        weightedOee: 0,
        weight: 0,
      };
      current.weightedOee += a * p * q * weight;
      current.weight += weight;
      seriesAgg.set(key, current);
    }

    const series = Array.from(seriesAgg.values())
      .map((x) => ({
        bucket_ts: x.bucket_ts,
        line_code: x.line_code,
        oee: x.weight > 0 ? x.weightedOee / x.weight : null,
      }))
      .sort((a, b) =>
        a.line_code.localeCompare(b.line_code) ||
        new Date(a.bucket_ts).getTime() - new Date(b.bucket_ts).getTime()
      );

    for (const row of rowsOut) {
      const points = series.filter((x) => x.line_code === row.line_code && x.oee != null);
      row.spark = points.map((x) => x.oee);
      row.trend_pp = points.length >= 2
        ? (points[points.length - 1].oee! - points[points.length - 2].oee!) * 100
        : null;
    }

    return NextResponse.json({
      ok: true,
      pending: 0,
      planned_sum_sec: plannedSumSec,
      planned_ceiling_sec: plannedCeilingSec,
      planned_overflow: plannedOverflow,
      planned_overflow_pct: plannedOverflowPct,
      rows: rowsOut,
      series,
    });
  } catch (err: any) {
    console.error("KPIs endpoint error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
