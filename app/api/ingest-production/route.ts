// app/api/ingest-production/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type IngestPayload = {
  org_id: string;
  plant_id: string;
  machine_code: string;
  window_start: string; // ISO
  window_end: string;   // ISO
  status?: string;      // "run", "stop", etc. (opcional)
  good_units_inc?: number;
  scrap_units_inc?: number;
};

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase env vars for ingest-production");
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: "liwa" },
  });
}

export async function POST(req: NextRequest) {
  const supabase = admin();

  try {
    const body = (await req.json()) as IngestPayload | IngestPayload[];
    const items: IngestPayload[] = Array.isArray(body) ? body : [body];

    const results: any[] = [];

    for (const item of items) {
      const {
        org_id,
        plant_id,
        machine_code,
        window_start,
        window_end,
        status = "run",
        good_units_inc = 0,
        scrap_units_inc = 0,
      } = item;

      // 0) Validación básica de campos obligatorios
      if (!org_id || !plant_id || !machine_code || !window_start || !window_end) {
        results.push({
          ok: false,
          error: "Missing required fields",
          machine_code,
        });
        continue;
      }

      const start = new Date(window_start);
      const end = new Date(window_end);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        results.push({
          ok: false,
          error: "Invalid window_start/window_end (not a valid date)",
          machine_code,
        });
        continue;
      }

      // 1) Duración real de la ventana en segundos, SIN inventar mínimos
      const durationSecRaw = (end.getTime() - start.getTime()) / 1000;

      if (!Number.isFinite(durationSecRaw) || durationSecRaw <= 0) {
        // Si la duración no es positiva, no inventamos 1s ni nada: rechazamos el tick
        results.push({
          ok: false,
          error: "Non-positive duration (window_end must be > window_start)",
          machine_code,
        });
        continue;
      }

      const durSec = durationSecRaw;
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // 2) Buscar máquina (para obtener line_id e ideal_cycle_s)
      const { data: machines, error: errMach } = await supabase
        .from("machines")
        .select("id, line_id, ideal_cycle_s")
        .eq("org_id", org_id)
        .eq("plant_id", plant_id)
        .eq("code", machine_code)
        .limit(1);

      if (errMach) {
        console.error("Ingest: error loading machine", errMach);
        results.push({
          ok: false,
          error: "Error loading machine",
          machine_code,
        });
        continue;
      }

      if (!machines || machines.length === 0) {
        results.push({
          ok: false,
          error: "Machine not found",
          machine_code,
        });
        continue;
      }

      const machine = machines[0];

      // 3) Buscar turno que contenga window_start
      //    3.1 Intentar turno-LÍNEA
      //    3.2 Fallback turno por planta (para no romper nada)
      let shiftId: string | null = null;

      // 3.1 Turno-línea
      if (machine.line_id) {
        const { data: shiftsLine, error: errShiftLine } = await supabase
          .from("v_shift_instances_resolved")
          .select("shift_instance_id, starts_at, ends_at")
          .eq("plant_id", plant_id)
          .eq("line_id", machine.line_id)
          .lte("starts_at", startIso)
          .gt("ends_at", startIso)
          .order("starts_at", { ascending: true })
          .limit(1);

        if (errShiftLine) {
          console.error("Ingest: error loading line-level shift", errShiftLine);
        } else if (shiftsLine && shiftsLine.length > 0) {
          shiftId = shiftsLine[0].shift_instance_id as string;
        }
      }

      // 3.2 Fallback: turno por planta
      if (!shiftId) {
        const { data: shiftsPlant, error: errShiftPlant } = await supabase
          .from("v_shift_instances_resolved")
          .select("shift_instance_id, starts_at, ends_at")
          .eq("plant_id", plant_id)
          .lte("starts_at", startIso)
          .gt("ends_at", startIso)
          .order("starts_at", { ascending: true })
          .limit(1);

        if (errShiftPlant) {
          console.error("Ingest: error loading plant-level shift", errShiftPlant);
          results.push({
            ok: false,
            error: "Error loading shift",
            machine_code,
          });
          continue;
        }

        shiftId =
          shiftsPlant && shiftsPlant.length > 0
            ? (shiftsPlant[0].shift_instance_id as string)
            : null;
      }

      // 4) Construir fila para liwa.production
      //    - planned_time_s = durSec: “tiempo de ventana”
      //    - run_time_s = durSec sólo si status indica RUN
      //    Aquí tampoco inventamos mínimos: si no está en RUN, runtime = 0.
      const row: any = {
        org_id,
        plant_id,
        shift_instance_id: shiftId,
        line_id: machine.line_id,
        machine_id: machine.id,
        ts_start: startIso,
        ts_end: endIso,
        good_units: good_units_inc,
        scrap_units: scrap_units_inc,
        planned_time_s: durSec,
        run_time_s: status.toLowerCase() === "run" ? durSec : 0,
        ideal_cycle_s: machine.ideal_cycle_s,
        notes: "ingested from Node-RED",
      };

      const { error: errIns } = await supabase.from("production").insert(row);

      if (errIns) {
        console.error("Ingest: error inserting production", errIns);
        results.push({
          ok: false,
          error: "Error inserting production",
          machine_code,
        });
        continue;
      }

      results.push({
        ok: true,
        machine_code,
        shift_instance_id: shiftId,
        dur_sec: durSec,
      });
    }

    const inserted = results.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: inserted > 0,
      inserted,
      details: results,
    });
  } catch (err: any) {
    console.error("Ingest endpoint error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Unexpected ingest error",
      },
      { status: 500 }
    );
  }
}

