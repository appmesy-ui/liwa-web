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

type ShiftSummary = {
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

type ShiftSummaryResponse = {
  ok: boolean;
  error?: string | null;
  data?: ShiftSummary | null;
};

export async function GET(req: NextRequest) {
  const supabase = admin();

  try {
    const { searchParams } = new URL(req.url);
    const plantId = searchParams.get("plantId");
    const lineCode = searchParams.get("lineId"); // aquí lineId = código (L1, L2…)
    const shiftDateRaw = searchParams.get("shiftDate");
    const shiftTemplateId = searchParams.get("shiftTemplateId");

    if (!plantId || !lineCode || !shiftDateRaw) {
      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: false,
          error:
            "Faltan parámetros: plantId, lineId y shiftDate son obligatorios.",
        },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────
    // RAMA 1: compatibilidad antigua (sin shiftTemplateId)
    // Sigue usando el 'shiftInstant' dentro del rango [shift_start, shift_end)
    // ────────────────────────────────────────────────
    if (!shiftTemplateId) {
      let shiftInstant: string;
      try {
        const d = new Date(shiftDateRaw);
        if (isNaN(d.getTime())) {
          throw new Error("Fecha inválida");
        }
        shiftInstant = d.toISOString();
      } catch {
        return NextResponse.json<ShiftSummaryResponse>(
          {
            ok: false,
            error:
              "Formato de shiftDate inválido. Usa un datetime válido (ej. 2025-12-02T08:00).",
          },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("v_reporting_shift_summary")
        .select(
          [
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
            "shift_start",
            "shift_end",
          ].join(", ")
        )
        .eq("plant_id", plantId)
        .eq("line_code", lineCode)
        .lte("shift_start", shiftInstant)
        .gt("shift_end", shiftInstant)
        .order("shift_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[turno-resumen][legacy] Error Supabase:", error);
        return NextResponse.json<ShiftSummaryResponse>(
          {
            ok: false,
            error:
              "Error al consultar Supabase para el resumen de turno (modo legacy).",
          },
          { status: 500 }
        );
      }

      if (!data) {
        return NextResponse.json<ShiftSummaryResponse>(
          {
            ok: false,
            error:
              "No se encontró ningún turno para los filtros seleccionados (modo legacy).",
          },
          { status: 404 }
        );
      }

      const {
        availability,
        performance,
        quality,
        oee,
        units_total,
        units_good,
        units_scrap,
        planned_runtime_sec,
        run_time_sec,
        downtime_sec,
      } = data as any;

      const summary: ShiftSummary = {
        availability: availability ?? 0,
        performance: performance ?? 0,
        quality: quality ?? 0,
        oee: oee ?? 0,
        units_total: Number(units_total ?? 0),
        units_good: Number(units_good ?? 0),
        units_scrap: Number(units_scrap ?? 0),
        planned_runtime_min:
          planned_runtime_sec != null
            ? Number(planned_runtime_sec) / 60
            : null,
        run_time_min:
          run_time_sec != null ? Number(run_time_sec) / 60 : null,
        downtime_min:
          downtime_sec != null ? Number(downtime_sec) / 60 : null,
      };

      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: true,
          data: summary,
        },
        { status: 200 }
      );
    }

    // ────────────────────────────────────────────────
    // RAMA 2: lógica nueva “pro”
    // Usar (plantId, lineCode, shiftTemplateId, shiftDate) para localizar
    // la instancia de turno y luego leer v_reporting_shift_summary exactamente
    // para ese turno.
    // ────────────────────────────────────────────────

    // Normalizar shiftDate a YYYY-MM-DD (admite que venga con HH:mm)
    const datePart = shiftDateRaw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: false,
          error:
            "Formato de shiftDate inválido. Usa YYYY-MM-DD (ej. 2025-11-27).",
        },
        { status: 400 }
      );
    }
    const shiftDate = datePart; // este va contra la columna date

    // 1) Buscar la instancia de turno en v_shift_instances_resolved
    const { data: shiftRow, error: shiftErr } = await supabase
      .from("v_shift_instances_resolved")
      .select("shift_instance_id, plant_id, template_id, shift_date, starts_at, ends_at")
      .eq("plant_id", plantId)
      .eq("template_id", shiftTemplateId)
      .eq("shift_date", shiftDate)
      .limit(1)
      .maybeSingle();

    if (shiftErr) {
      console.error("[turno-resumen] Error buscando instancia de turno:", shiftErr);
      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: false,
          error: "Error al buscar la instancia de turno para los filtros.",
        },
        { status: 500 }
      );
    }

    if (!shiftRow) {
      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: false,
          error:
            "No se encontró ninguna instancia de turno para esa fecha y plantilla.",
        },
        { status: 404 }
      );
    }

    const { starts_at, ends_at } = shiftRow as any;

    // 2) Buscar el resumen en v_reporting_shift_summary para esa línea y ese turno
    const { data, error } = await supabase
      .from("v_reporting_shift_summary")
      .select(
        [
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
          "shift_start",
          "shift_end",
        ].join(", ")
      )
      .eq("plant_id", plantId)
      .eq("line_code", lineCode)
      .eq("shift_start", starts_at)
      .eq("shift_end", ends_at)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[turno-resumen] Error Supabase (modo pro):", error);
      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: false,
          error:
            "Error al consultar Supabase para el resumen de turno (modo pro).",
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json<ShiftSummaryResponse>(
        {
          ok: false,
          error:
            "No se encontró ningún resumen de turno para esa línea y turno.",
        },
        { status: 404 }
      );
    }

    const {
      availability,
      performance,
      quality,
      oee,
      units_total,
      units_good,
      units_scrap,
      planned_runtime_sec,
      run_time_sec,
      downtime_sec,
    } = data as any;

    const summary: ShiftSummary = {
      availability: availability ?? 0,
      performance: performance ?? 0,
      quality: quality ?? 0,
      oee: oee ?? 0,
      units_total: Number(units_total ?? 0),
      units_good: Number(units_good ?? 0),
      units_scrap: Number(units_scrap ?? 0),
      planned_runtime_min:
        planned_runtime_sec != null ? Number(planned_runtime_sec) / 60 : null,
      run_time_min:
        run_time_sec != null ? Number(run_time_sec) / 60 : null,
      downtime_min:
        downtime_sec != null ? Number(downtime_sec) / 60 : null,
    };

    return NextResponse.json<ShiftSummaryResponse>(
      {
        ok: true,
        data: summary,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[turno-resumen] Endpoint error:", err);
    return NextResponse.json<ShiftSummaryResponse>(
      {
        ok: false,
        error: err?.message || "Unexpected error in turno-resumen",
      },
      { status: 500 }
    );
  }
}
