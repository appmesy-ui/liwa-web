// app/api/events/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type EventIngestPayload = {
  org_id: string;
  plant_id: string;
  machine_code: string;

  // Ventana del paro
  started_at: string; // ISO
  ended_at: string;   // ISO

  // Opcionales
  is_planned?: boolean;
  status?: string; // estado del evento ("pending", "classified", etc.). Por defecto "pending"
  source?: string; // "auto" | "manual" (aquí normalmente "auto")
  notes?: string;
};

function getAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars for events/ingest");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: "liwa" },
  });
}

export async function POST(req: NextRequest) {
  const supabase = getAdmin();

  try {
    const body = (await req.json()) as EventIngestPayload | EventIngestPayload[];
    const items: EventIngestPayload[] = Array.isArray(body) ? body : [body];

    const results: any[] = [];

    for (const item of items) {
      const {
        org_id,
        plant_id,
        machine_code,
        started_at,
        ended_at,
        is_planned = false,
        status = "pending",
        source = "auto",
        notes,
      } = item;

      // 0) Validación básica
      if (!org_id || !plant_id || !machine_code || !started_at || !ended_at) {
        results.push({
          ok: false,
          error: "Missing required fields",
          machine_code,
        });
        continue;
      }

      const start = new Date(started_at);
      const end = new Date(ended_at);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        results.push({
          ok: false,
          error: "Invalid started_at/ended_at (not a valid date)",
          machine_code,
        });
        continue;
      }

      // 1) Duración del paro en segundos (sin inventar valores)
      const durationSecRaw = (end.getTime() - start.getTime()) / 1000;

      if (!Number.isFinite(durationSecRaw) || durationSecRaw <= 0) {
        results.push({
          ok: false,
          error: "Non-positive duration (ended_at must be > started_at)",
          machine_code,
        });
        continue;
      }

      const duration_s = Math.round(durationSecRaw);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // 2) Buscar máquina para obtener line_id
      const { data: machines, error: errMach } = await supabase
        .from("machines")
        .select("id, line_id")
        .eq("org_id", org_id)
        .eq("plant_id", plant_id)
        .eq("code", machine_code)
        .limit(1);

      if (errMach) {
        console.error("events/ingest: error loading machine", errMach);
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

      // 3) Buscar turno que contenga el inicio del paro
      //    3.1 Intentar turno-línea
      //    3.2 Fallback turno por planta (para no romper nada si aún no hay asignación por línea)
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
          console.error("events/ingest: error loading line-level shift", errShiftLine);
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
          console.error("events/ingest: error loading plant-level shift", errShiftPlant);
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

      // 4) Construir fila para liwa.events
      //    NOTA: no inventamos nada, duration_s = diferencia real start/end.
      const row: any = {
        org_id,
        plant_id,
        shift_instance_id: shiftId,
        line_id: machine.line_id,
        machine_id: machine.id,
        started_at: startIso,
        ended_at: endIso,
        duration_s,
        is_planned,
        status, // para clasificación (pending / classified)
        source, // "auto" para Node-RED
        notes: notes ?? "ingested from Node-RED",
      };

      const { error: errIns } = await supabase.from("events").insert(row);

      if (errIns) {
        console.error("events/ingest: error inserting event", errIns);
        results.push({
          ok: false,
          error: "Error inserting event",
          machine_code,
        });
        continue;
      }

      results.push({
        ok: true,
        machine_code,
        shift_instance_id: shiftId,
        duration_s,
      });
    }

    const inserted = results.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: inserted > 0,
      inserted,
      details: results,
    });
  } catch (err: any) {
    console.error("events/ingest endpoint error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Unexpected events/ingest error",
      },
      { status: 500 }
    );
  }
}

