// app/api/downtimes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

function toInt(v: string | null, def = 0) {
  const n = Number(v ?? "");
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const url    = new URL(req.url);
  const from   = url.searchParams.get("from");
  const to     = url.searchParams.get("to");
  const state  = url.searchParams.get("state"); // "pending" | "classified" | undefined
  const limit  = Math.min(Math.max(toInt(url.searchParams.get("limit"), 100), 1), 2000);
  const offset = Math.max(toInt(url.searchParams.get("offset"), 0), 0);

  const applyFilters = (q: any) => {
    if (from) q = q.gte("started_at", from);
    if (to)   q = q.lte("started_at", to);

    // Ahora filtramos por la columna status de la vista
    if (state === "pending")    q = q.eq("status", "pending");
    if (state === "classified") q = q.eq("status", "classified");

    return q;
  };

  try {
    // 1) COUNT
    let countQ = supabase
      .schema("liwa")
      .from("v_events_ui")
      .select("id", { count: "exact", head: true });
    countQ = applyFilters(countQ);
    const { error: countErr, count: totalCount } = await countQ;
    if (countErr) throw countErr;

    // 2) ROWS base
    let rowsQ = supabase
      .schema("liwa")
      .from("v_events_ui")
      .select(
        `
        id,
        started_at,
        ended_at,
        duration_s,
        line_id,
        machine_id,
        level2,
        level3,
        status
      `
      )
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);
    rowsQ = applyFilters(rowsQ);

    const { data, error } = await rowsQ;
    if (error) throw error;

    const ids = (data ?? []).map((r: any) => r.id);

    // 3) Traer status/ classified_at reales desde liwa.events
    let statusById: Record<string, { status: string | null; classified_at: string | null }> = {};
    if (ids.length > 0) {
      const { data: evRows, error: evErr } = await supabase
        .schema("liwa")
        .from("events")
        .select("id, status, classified_at")
        .in("id", ids);
      if (evErr) throw evErr;
      for (const r of evRows ?? []) {
        statusById[(r as any).id] = {
          status: (r as any).status ?? null,
          classified_at: (r as any).classified_at ?? null,
        };
      }
    }

    // 4) Labels (línea/ máquina)
    let lineCodeById: Record<string, string | null> = {};
    let machineCodeById: Record<string, string | null> = {};
    if ((data?.length ?? 0) > 0) {
      const lineIds = Array.from(new Set((data ?? []).map((r: any) => r.line_id).filter(Boolean)));
      const machIds = Array.from(new Set((data ?? []).map((r: any) => r.machine_id).filter(Boolean)));

      if (lineIds.length > 0) {
        const { data: lineRows, error: lineErr } = await supabase
          .schema("liwa")
          .from("lines")
          .select("id, code, name")
          .in("id", lineIds);
        if (lineErr) throw lineErr;
        for (const r of lineRows ?? []) {
          lineCodeById[(r as any).id] = (r as any).code ?? (r as any).name ?? null;
        }
      }

      if (machIds.length > 0) {
        const { data: machRows, error: machErr } = await supabase
          .schema("liwa")
          .from("machines")
          .select("id, code, name")
          .in("id", machIds);
        if (machErr) throw machErr;
        for (const r of machRows ?? []) {
          machineCodeById[(r as any).id] = (r as any).code ?? (r as any).name ?? null;
        }
      }
    }

    // 5) Map final (prioriza events.status)
    const rows = (data ?? []).map((r: any) => {
      const ev = statusById[r.id] ?? { status: null, classified_at: null };
      const stateFromEvents =
        ev.status === "classified"
          ? "classified"
          : ev.status === "pending"
          ? "pending"
          : null;

      return {
        id: r.id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        duration_s: r.duration_s,
        line_id: r.line_id ?? null,
        machine_id: r.machine_id ?? null,
        line_code: r.line_id ? (lineCodeById[r.line_id] ?? null) : null,
        machine_code: r.machine_id ? (machineCodeById[r.machine_id] ?? null) : null,
        n2_name: r.level2 ?? null,
        n3_name: r.level3 ?? null,
        state:
          stateFromEvents ??
          (r.status === "classified"
            ? "classified"
            : r.status === "pending"
            ? "pending"
            : null),
        classified_at: ev.classified_at ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      source: "liwa.v_events_ui + events + (lines,machines)",
      total_count: totalCount ?? 0,
      limit,
      offset,
      rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: 400 }
    );
  }
}

