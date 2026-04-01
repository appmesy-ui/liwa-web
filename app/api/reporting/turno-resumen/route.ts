// app/api/reporting/turno-resumen/route.ts
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
    throw new Error("Missing Supabase env vars for reporting turno-resumen");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "liwa" },
  });
}

/* ===================== Tipos ===================== */

type TurnoResumenRow = {
  plant_id: string;
  line_code: string;
  shift_start: string;
  shift_end: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  units_total: number;
  units_good: number;
  units_scrap: number;
  planned_runtime_min: number | null;
  run_time_min: number | null;
  downtime_min: number | null;
};

type TurnoResumenSummary = {
  total_shifts: number;
  avg_availability: number | null;
  avg_performance: number | null;
  avg_quality: number | null;
  avg_oee: number | null;
  total_units_total: number;
  total_units_good: number;
  total_units_scrap: number;
  total_planned_runtime_min: number;
  total_run_time_min: number;
  total_downtime_min: number;
};

type TurnoResumenResponse = {
  ok: boolean;
  error?: string | null;
  filters?: {
    from: string;
    to: string;
    plantId: string | null;
    lineId: string | null;
  };
  rows?: TurnoResumenRow[];
  summary?: TurnoResumenSummary;
};

/* ================ Helpers internos ================ */

function parseDateParam(name: string, value: string | null): string {
  if (!value) {
    throw new Error(`Falta el parámetro obligatorio "${name}" (YYYY-MM-DD).`);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(
      `Parámetro "${name}" inválido. Usa formato YYYY-MM-DD (ej. 2025-12-01).`
    );
  }

  return trimmed;
}

/**
 * Convierte YYYY-MM-DD a ISO inicio de día y fin de día (UTC) para filtrar.
 */
function toDayRangeIso(from: string, to: string) {
  const fromIso = new Date(from + "T00:00:00.000Z").toISOString();
  const toIso = new Date(to + "T23:59:59.999Z").toISOString();
  return { fromIso, toIso };
}

/* ======================= GET ======================= */

export async function GET(req: NextRequest) {
  const supabase = admin();

  try {
    const { searchParams } = new URL(req.url);

    // Filtros básicos
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const plantId = searchParams.get("plantId");
    const lineId = searchParams.get("lineId"); // aquí lineId = código (L1, L2…)

    let from: string;
    let to: string;

    try {
      from = parseDateParam("from", fromParam);
      to = parseDateParam("to", toParam);
    } catch (e: any) {
      return NextResponse.json<TurnoResumenResponse>(
        { ok: false, error: e?.message ?? "Parámetros de fecha inválidos." },
        { status: 400 }
      );
    }

    const { fromIso, toIso } = toDayRangeIso(from, to);

    // Construimos la query sobre la vista v_reporting_shift_summary
    const selectColumns = [
      "plant_id",
      "line_code",
      "shift_start",
      "shift_end",
      "availability",
      "performance",
      "quality",
      "oee",
      "units_total",
      "units_good",
      "units_scrap",
      "planned_runtime_sec",
      "run_time_sec",
      "downtime_sec",
    ].join(", ");

    let query = supabase
      .from("v_reporting_shift_summary")
      .select(selectColumns)
      .gte("shift_start", fromIso)
      .lte("shift_start", toIso)
      .order("shift_start", { ascending: false })
      .order("line_code", { ascending: true });

    if (plantId) {
      query = query.eq("plant_id", plantId);
    }

    if (lineId) {
      // lineId aquí representa el código de línea (L1, L2, etc.)
      query = query.eq("line_code", lineId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[turno-resumen] Error Supabase:", error);
      return NextResponse.json<TurnoResumenResponse>(
        {
          ok: false,
          error:
            "Error al consultar Supabase para el resumen de turnos. Revisa logs.",
        },
        { status: 500 }
      );
    }

    const rowsRaw = (data ?? []) as any[];

    const rows: TurnoResumenRow[] = rowsRaw.map((r) => {
      const plannedSec = r.planned_runtime_sec as number | null;
      const runSec = r.run_time_sec as number | null;
      const downSec = r.downtime_sec as number | null;

      return {
        plant_id: r.plant_id,
        line_code: r.line_code,
        shift_start: r.shift_start,
        shift_end: r.shift_end,
        availability: r.availability ?? 0,
        performance: r.performance ?? 0,
        quality: r.quality ?? 0,
        oee: r.oee ?? 0,
        units_total: Number(r.units_total ?? 0),
        units_good: Number(r.units_good ?? 0),
        units_scrap: Number(r.units_scrap ?? 0),
        planned_runtime_min:
          plannedSec != null ? Number(plannedSec) / 60 : null,
        run_time_min: runSec != null ? Number(runSec) / 60 : null,
        downtime_min: downSec != null ? Number(downSec) / 60 : null,
      };
    });

    // Calculamos el resumen agregado para la banda superior del reporte
    const total_shifts = rows.length;

    let sumA = 0;
    let sumP = 0;
    let sumQ = 0;
    let sumOEE = 0;

    let total_units_total = 0;
    let total_units_good = 0;
    let total_units_scrap = 0;

    let total_planned_runtime_min = 0;
    let total_run_time_min = 0;
    let total_downtime_min = 0;

    for (const r of rows) {
      sumA += r.availability;
      sumP += r.performance;
      sumQ += r.quality;
      sumOEE += r.oee;

      total_units_total += r.units_total;
      total_units_good += r.units_good;
      total_units_scrap += r.units_scrap;

      if (r.planned_runtime_min != null) {
        total_planned_runtime_min += r.planned_runtime_min;
      }
      if (r.run_time_min != null) {
        total_run_time_min += r.run_time_min;
      }
      if (r.downtime_min != null) {
        total_downtime_min += r.downtime_min;
      }
    }

    const summary: TurnoResumenSummary = {
      total_shifts,
      avg_availability: total_shifts ? sumA / total_shifts : null,
      avg_performance: total_shifts ? sumP / total_shifts : null,
      avg_quality: total_shifts ? sumQ / total_shifts : null,
      avg_oee: total_shifts ? sumOEE / total_shifts : null,
      total_units_total,
      total_units_good,
      total_units_scrap,
      total_planned_runtime_min,
      total_run_time_min,
      total_downtime_min,
    };

    return NextResponse.json<TurnoResumenResponse>(
      {
        ok: true,
        filters: {
          from,
          to,
          plantId: plantId || null,
          lineId: lineId || null,
        },
        rows,
        summary,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[turno-resumen] Endpoint error:", err);
    return NextResponse.json<TurnoResumenResponse>(
      {
        ok: false,
        error: err?.message || "Unexpected error in turno-resumen",
      },
      { status: 500 }
    );
  }
}
