// app/api/events/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

type EventIngestPayload = {
  org_id: string;
  plant_id: string;
  machine_code: string;
  started_at: string;
  ended_at: string;
  is_planned?: boolean;
  status?: string;
  source?: string;
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

      if (!org_id || !plant_id || !machine_code || !started_at || !ended_at) {
        results.push({ ok: false, error: "Missing required fields", machine_code });
        continue;
      }

      const start = new Date(started_at);
      const end = new Date(ended_at);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        results.push({ ok: false, error: "Invalid started_at/ended_at", machine_code });
        continue;
      }

      const durationSecRaw = (end.getTime() - start.getTime()) / 1000;

      if (!Number.isFinite(durationSecRaw) || durationSecRaw <= 0) {
        results.push({ ok: false, error: "Non-positive duration", machine_code });
        continue;
      }

      const duration_s = Math.round(durationSecRaw);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const { data: machines, error: errMach } = await supabase
        .from("machines")
        .select("id, line_id")
        .eq("org_id", org_id)
        .eq("plant_id", plant_id)
        .eq("code", machine_code)
        .limit(1);

      if (errMach) {
        results.push({ ok: false, error: "Error loading machine", machine_code });
        continue;
      }

      if (!machines || machines.length === 0) {
        results.push({ ok: false, error: "Machine not found", machine_code });
        continue;
      }

      const machine = machines[0];
      let shiftId: string | null = null;

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

        if (!errShiftLine && shiftsLine && shiftsLine.length > 0) {
          shiftId = shiftsLine[0].shift_instance_id as string;
        }
      }

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
          results.push({ ok: false, error: "Error loading shift", machine_code });
          continue;
        }

        shiftId =
          shiftsPlant && shiftsPlant.length > 0
            ? (shiftsPlant[0].shift_instance_id as string)
            : null;
      }

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
        status,
        source,
        notes: notes ?? "ingested from Gateway",
      };

      const { error: errIns } = await supabase.from("events").insert(row);

      if (errIns) {
        results.push({ ok: false, error: "Error inserting event", machine_code });
        continue;
      }

      results.push({ ok: true, machine_code, shift_instance_id: shiftId, duration_s });
    }

    const inserted = results.filter((r) => r.ok).length;

    return NextResponse.json(
      { ok: inserted > 0, inserted, details: results },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
