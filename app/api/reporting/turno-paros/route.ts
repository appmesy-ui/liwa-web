// app/api/reporting/turno-paros/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente admin (solo para reporting)
 */
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env vars for reporting turno-paros");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "liwa" },
  });
}

/** Tipos de respuesta */

type ParoRow = {
  id: string;
  plant_id?: string | null;
  line_code?: string | null;
  machine_code?: string | null;
  machine_name?: string | null;

  started_at: string;
  ended_at: string | null;
  duration_min: number | null;

  is_planned: boolean | null;
  status: string | null;

  level1?: string | null;
  level2?: string | null;
  level3?: string | null;

  notes?: string | null;
};

type ParosSummary = {
  total_events: number;
  total_downtime_min: number;
  total_planned_downtime_min: number;
  total_unplanned_downtime_min: number;
  total_pending_events: number;
};

type ParosResponse = {
  ok: boolean;
  error?: string | null;
  filters?: {
    from: string;
    to: string;
  };
  rows?: ParoRow[];
  summary?: ParosSummary;
};

function parseDateParam(value: string | null, label: string): string {
  if (!value) {
    throw new Error(`Falta parámetro obligatorio: ${label}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      `Formato de ${label} inválido. Usa YYYY-MM-DD (ej. 2025-12-01).`
    );
  }
  return value;
}

export async function GET(req: NextRequest) {
  const supabase = admin();

  try {
    const { searchParams } = new URL(req.url);

    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");

    let from: string;
    let to: string;

    try {
      from = parseDateParam(fromRaw, "from");
      to = parseDateParam(toRaw, "to");
    } catch (err: any) {
      return NextResponse.json<ParosResponse>(
        { ok: false, error: err?.message || "Parámetros de fecha inválidos." },
        { status: 400 }
      );
    }

    // Rango [from, toExclusive)
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate = new Date(`${to}T00:00:00Z`);
    const toExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json<ParosResponse>(
        {
          ok: false,
          error:
            "No se pudo interpretar las fechas proporcionadas. Revisa el formato.",
        },
        { status: 400 }
      );
    }

    const fromIso = fromDate.toISOString();
    const toIso = toExclusive.toISOString();

    // Consulta a la vista EXISTENTE v_events_ui
    const { data, error } = await supabase
      .from("v_events_ui")
      .select("*")
      .gte("started_at", fromIso)
      .lt("started_at", toIso)
      .order("started_at", { ascending: true });

    if (error) {
      console.error("[turno-paros] Error Supabase:", error);
      return NextResponse.json<ParosResponse>(
        {
          ok: false,
          error:
            error.message ||
            "Error al consultar Supabase para el informe de paros y pérdidas.",
        },
        { status: 500 }
      );
    }

    const raw = (data ?? []) as any[];

    // Normalización → aquí añadimos TODOS los alias posibles
    const rows: ParoRow[] = raw.map((r) => {
      const durationSec =
        typeof r.duration_s === "number"
          ? r.duration_s
          : typeof r.duration_sec === "number"
          ? r.duration_sec
          : null;

      const duration_min =
        durationSec != null ? Number(durationSec) / 60 : null;

      return {
        id: String(r.id),

        // Línea/Máquina: usamos varios posibles nombres de columna
        plant_id: r.plant_id ?? null,
        line_code:
          r.line_code ??
          r.line ??
          r.line_name ??
          r.linea ??
          null,
        machine_code:
          r.machine_code ??
          r.machine ??
          r.machine_id ??
          null,
        machine_name:
          r.machine_name ??
          r.machine_nombre ??
          null,

        started_at: r.started_at,
        ended_at: r.ended_at ?? null,
        duration_min,

        // Planificado / estado
        is_planned:
          typeof r.is_planned === "boolean"
            ? r.is_planned
            : r.is_planned ?? null,
        status: r.status ?? null,

        // Motivos N1/N2/N3: incluimos lvl1_name/lvl2_name/lvl3_name
        level1:
          r.level1 ??
          r.level_1 ??
          r.nivel_1 ??
          r.lvl1_name ??
          null,
        level2:
          r.level2 ??
          r.level_2 ??
          r.nivel_2 ??
          r.lvl2_name ??
          null,
        level3:
          r.level3 ??
          r.level_3 ??
          r.nivel_3 ??
          r.lvl3_name ??
          null,

        notes: r.notes ?? null,
      };
    });

    // Resumen agregado
    let total_downtime_min = 0;
    let total_planned_downtime_min = 0;
    let total_unplanned_downtime_min = 0;
    let total_pending_events = 0;

    for (const row of rows) {
      const d = row.duration_min ?? 0;
      total_downtime_min += d;

      if (row.is_planned === true) {
        total_planned_downtime_min += d;
      } else if (row.is_planned === false) {
        total_unplanned_downtime_min += d;
      }

      if (row.status === "pending") {
        total_pending_events += 1;
      }
    }

    const summary: ParosSummary = {
      total_events: rows.length,
      total_downtime_min,
      total_planned_downtime_min,
      total_unplanned_downtime_min,
      total_pending_events,
    };

    return NextResponse.json<ParosResponse>(
      {
        ok: true,
        filters: { from, to },
        rows,
        summary,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[turno-paros] Endpoint error:", err);
    return NextResponse.json<ParosResponse>(
      {
        ok: false,
        error: err?.message || "Unexpected error in turno-paros",
      },
      { status: 500 }
    );
  }
}
