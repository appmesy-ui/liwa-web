// app/api/live-kpis/route.ts
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
    throw new Error("Missing Supabase env vars for live KPIs");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "liwa" },
  });
}

/* ===== Tipos ===== */

type ShiftRow = {
  shift_instance_id: string;
  org_id: string | null;
  plant_id: string | null;
  template_id: string | null;
  shift_date: string | null;
  starts_at: string;
  ends_at: string;
};

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
  linePlanned: number;
  good: number;
  scrap: number;
  wA: number;
  wP: number;
  wQ: number;
  weight: number;
  seenShifts: Set<string>;
};

/* Helpers */

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

    const orgIdFilter = searchParams.get("org_id");
    const plantFilter = searchParams.get("plant_id");
    const nowParam = searchParams.get("now"); // opcional para pruebas

    // 1) Momento de referencia: ahora (o el que pases en ?now=...)
    const nowTs = nowParam ? new Date(nowParam) : new Date();
    if (Number.isNaN(nowTs.getTime())) {
      throw new Error("Parámetro 'now' inválido");
    }
    const nowIso = nowTs.toISOString();

    // 2) Buscar turno ACTIVO en v_shift_instances_resolved
    let shiftQ = supabase
      .from("v_shift_instances_resolved")
      .select(
        [
          "shift_instance_id",
          "org_id",
          "plant_id",
          "template_id",
          "shift_date",
          "starts_at",
          "ends_at",
        ].join(",")
      )
      .lte("starts_at", nowIso)
      .gt("ends_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(1);

    if (orgIdFilter) shiftQ = shiftQ.eq("org_id", orgIdFilter);
    if (plantFilter) shiftQ = shiftQ.eq("plant_id", plantFilter);

    const { data: shiftRows, error: errShift } = await shiftQ;
    if (errShift) {
      console.error("Error loading active shift in live-kpis:", errShift);
      throw errShift;
    }

    const shifts = (shiftRows || []) as ShiftRow[];
    const activeShift = shifts[0] ?? null;

    // Si no hay turno activo → devolvemos sólo info de tiempo y nulls de KPIs
    if (!activeShift) {
      return NextResponse.json({
        ok: true,
        now: nowIso,
        active_shift: null,
        window: null,
        rows: [],
      });
    }

    const shiftStart = new Date(activeShift.starts_at);
    const shiftEnd = new Date(activeShift.ends_at);

    // Ventana live: desde inicio de turno hasta ahora (acotado al fin del turno)
    const fromTs = shiftStart;
    const toTs =
      nowTs > shiftEnd
        ? shiftEnd
        : nowTs;

    const fromIso = fromTs.toISOString();
    const toIso = toTs.toISOString();

    const elapsedSec = Math.max(
      0,
      Math.floor((toTs.getTime() - fromTs.getTime()) / 1000)
    );
    const shiftTotalSec = Math.max(
      0,
      Math.floor((shiftEnd.getTime() - shiftStart.getTime()) / 1000)
    );

    // 3) Cargar base OEE por máquina+turno desde v_oee_by_shift
    const { data: base, error: errBase } = await supabase
      .from("v_oee_by_shift")
      .select(
        "shift_instance_id, line_id, machine_id, good_units, scrap_units, planned_time_s, run_time_s, ideal_cycle_s, quality, performance, availability"
      )
      .eq("shift_instance_id", activeShift.shift_instance_id);

    if (errBase) {
      console.error("Error loading v_oee_by_shift in live-kpis:", errBase);
      throw errBase;
    }

    if (!base || base.length === 0) {
      // No hay producción todavía, pero sí turno activo
      return NextResponse.json({
        ok: true,
        now: nowIso,
        active_shift: activeShift,
        window: {
          from: fromIso,
          to: toIso,
          elapsed_sec: elapsedSec,
          shift_total_sec: shiftTotalSec,
        },
        rows: [],
      });
    }

    // 4) Cargar líneas para códigos L1, L2...
    const { data: lineRows, error: errLines } = await supabase
      .from("lines")
      .select("id, code");

    if (errLines) {
      console.error("Error loading lines in live-kpis:", errLines);
      throw errLines;
    }

    const codeByLine: Record<string, string> = {};
    (lineRows || []).forEach((ln) => {
      const l = ln as LineRow;
      codeByLine[l.id] = l.code;
    });

    // 5) Agregar por línea, recalculando Availability para la ventana [fromTs, toTs]
    //    - planned_overlap_sec = solape turno con [from,to] = tiempo transcurrido
    //    - availability_live = run_time_s_sum / planned_overlap_sec
    //    - performance, quality: reutilizamos de la vista (ya son “live” porque
    //      sólo hay producción hasta ahora)
    const byLine = new Map<string, LineAgg>();

    for (const rowAny of base as BaseRow[]) {
      const lineId = rowAny.line_id;
      if (!lineId) continue;

      let agg = byLine.get(lineId);
      if (!agg) {
        agg = {
          line_id: lineId,
          plant_id: activeShift.plant_id,
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
      // La availability de la vista está calculada sobre todo el turno;
      // aquí vamos a recalcularla sobre la ventana transcurrida.

      agg.good += good;
      agg.scrap += scrap;

      // Solape turno con [from,to] = en live es básicamente elapsedSec
      const plannedOverlapSec = elapsedSec;

      if (plannedOverlapSec <= 0) {
        continue;
      }

      // Tiempo de ejecución efectivo de esta máquina
      const runTime = Number(rowAny.run_time_s ?? 0);
      const availabilityLive =
        plannedOverlapSec > 0 ? runTime / plannedOverlapSec : null;

      if (availabilityLive !== null) {
        agg.wA += availabilityLive * plannedOverlapSec;
      }
      if (pVal !== null) {
        agg.wP += pVal * plannedOverlapSec;
      }
      if (qVal !== null) {
        agg.wQ += qVal * plannedOverlapSec;
      }
      agg.weight += plannedOverlapSec;

      // Tiempo planificado de línea: sólo 1 vez por turno+línea
      if (!agg.seenShifts.has(rowAny.shift_instance_id)) {
        agg.linePlanned += plannedOverlapSec;
        agg.seenShifts.add(rowAny.shift_instance_id);
      }
    }

    const rowsOut: any[] = [];

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
      if (quality != null && performance != null && availability != null) {
        oee = quality * performance * availability;
      }

      rowsOut.push({
        line_code: (codeByLine[lineId] || "—").toUpperCase(),
        plant_id: agg.plant_id,
        planned_runtime_sec: agg.linePlanned,
        availability,
        performance,
        quality,
        oee,
        units_total: totalUnits,
        units_good: agg.good,
        units_scrap: agg.scrap,
        units_rework: 0,
      });
    }

    rowsOut.sort((a, b) => a.line_code.localeCompare(b.line_code));

    return NextResponse.json({
      ok: true,
      now: nowIso,
      active_shift: activeShift,
      window: {
        from: fromIso,
        to: toIso,
        elapsed_sec: elapsedSec,
        shift_total_sec: shiftTotalSec,
      },
      rows: rowsOut,
    });
  } catch (err: any) {
    console.error("live-kpis endpoint error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
