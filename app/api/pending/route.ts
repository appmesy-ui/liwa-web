// app/api/pending/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function ok(data: any, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}
function err(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const line = url.searchParams.get("line");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const limit = Number(url.searchParams.get("limit") ?? 200);

    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY =
      process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return err("Supabase service credentials missing", 500);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const fromISO =
      from ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const toISO = to ?? new Date().toISOString();

    // ¿Existe la vista v_pending_events?
    const { data: viewExists } = await sb
      .from("pg_tables" as any)
      .select("tablename")
      .eq("schemaname", "public")
      .eq("tablename", "v_pending_events")
      .limit(1);

    if (viewExists && (viewExists as any[]).length) {
      let q = sb
        .from("v_pending_events")
        .select(
          "id,line_id,line_code,machine_id,machine_code,started_at,ended_at,duration_min,duration_hms,lvl1,lvl2,lvl3,classified"
        )
        .gte("started_at", fromISO)
        .lte("started_at", toISO)
        .order("started_at", { ascending: false })
        .limit(limit);

      const { data, error, status } = await q;
      if (error) return err(error.message, status || 500);

      let rows = (data ?? []) as any[];
      if (line) {
        rows = rows.filter(
          (r) => (r.line_code || "").toUpperCase() === line.toUpperCase()
        );
      }
      return ok({ rows, source: "v_pending_events" });
    }

    // Fallback: events + lookup (sin joins implícitos)
    const { data: events, error: errEvents, status: stEvents } = await sb
      .from("events")
      .select(
        // 👇 incluye requires_level_3 (nombre correcto)
        "id,line_id,machine_id,started_at,ended_at,lvl1,lvl2,lvl3,requires_level_3,classified,status"
      )
      .gte("started_at", fromISO)
      .lte("started_at", toISO)
      .or(
        // 👇 usa requires_level_3 en el criterio
        "status.eq.pending,classified.eq.false,and(requires_level_3.eq.true,lvl3.is.null)"
      )
      .order("started_at", { ascending: false })
      .limit(limit);

    if (errEvents) return err(errEvents.message, stEvents || 500);

    const ev = (events ?? []) as any[];

    // IDs únicos a resolver
    const lineIds = Array.from(
      new Set(ev.map((r) => r.line_id).filter(Boolean) as string[])
    );
    const machineIds = Array.from(
      new Set(ev.map((r) => r.machine_id).filter(Boolean) as string[])
    );

    const [linesRes, machinesRes] = await Promise.all([
      lineIds.length
        ? sb.from("lines").select("id,code").in("id", lineIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      machineIds.length
        ? sb.from("machines").select("id,code").in("id", machineIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const lineMap = new Map<string, string>();
    (linesRes.data ?? []).forEach((r: any) => lineMap.set(r.id, r.code));

    const machineMap = new Map<string, string>();
    (machinesRes.data ?? []).forEach((r: any) => machineMap.set(r.id, r.code));

    let rows = ev.map((r: any) => {
      const duration_min =
        r.started_at && r.ended_at
          ? Math.max(
              0,
              (new Date(r.ended_at).getTime() -
                new Date(r.started_at).getTime()) /
                60000
            )
          : null;

      return {
        id: r.id,
        line_id: r.line_id,
        line_code: r.line_id ? lineMap.get(r.line_id) ?? null : null,
        machine_id: r.machine_id,
        machine_code: r.machine_id
          ? machineMap.get(r.machine_id) ?? null
          : null,
        started_at: r.started_at,
        ended_at: r.ended_at,
        duration_min,
        lvl1: r.lvl1 ?? null,
        lvl2: r.lvl2 ?? null,
        lvl3: r.lvl3 ?? null,
        classified: r.classified ?? null,
      };
    });

    if (line) {
      rows = rows.filter(
        (r) => (r.line_code || "").toUpperCase() === line.toUpperCase()
      );
    }

    return ok({ rows, source: "events+lookup" });
  } catch (e: any) {
    return err(e?.message ?? "Unexpected error");
  }
}
