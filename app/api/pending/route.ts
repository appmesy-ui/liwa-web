// app/api/pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PendingRow = {
  id: string;
  line_code: string | null;    // lines.name
  machine_code: string | null; // machines.name
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  lvl1: string | null;
  lvl2: string | null;
  lvl3: string | null;         // taxonomy_nodes.name
  classified: boolean | null;  // classified_at != null
};

// definimos el tipo esperado de las filas crudas
type RawEvent = {
  id: string;
  line_id: string | null;
  machine_id: string | null;
  taxonomy_node_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  classified_at: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-pending" } },
      db: { schema: "liwa" },
    });

    const { searchParams } = new URL(req.url);
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO = searchParams.get("from");
    const lineFilter = searchParams.get("line"); // compararemos con lines.name
    const limit = Number(searchParams.get("limit") ?? 100);

    // 1) Eventos pendientes (classified_at IS NULL)
    let q = admin
      .from("events")
      .select(
        [
          "id",
          "line_id",
          "machine_id",
          "taxonomy_node_id",
          "started_at",
          "ended_at",
          "duration_s",
          "classified_at",
        ].join(", ")
      )
      .is("classified_at", null)
      .lte("started_at", toISO)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (fromISO) q = q.gte("started_at", fromISO);

    const { data, error: evErr } = await q;
    if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: true, rows: [] as PendingRow[] });
    }

    // 👇 aquí tipamos de forma segura
    const evs: RawEvent[] = data as unknown as RawEvent[];

    // 2) Recolectar IDs
    const lineIds = new Set<string>();
    const machineIds = new Set<string>();
    const taxIds = new Set<string>();
    for (const e of evs) {
      if (e.line_id) lineIds.add(e.line_id);
      if (e.machine_id) machineIds.add(e.machine_id);
      if (e.taxonomy_node_id) taxIds.add(e.taxonomy_node_id);
    }

    // 3) lines(id -> name)
    const lineMap = new Map<string, string | null>();
    if (lineIds.size) {
      const { data, error } = await admin.from("lines").select("id, name").in("id", Array.from(lineIds));
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      for (const r of data ?? []) lineMap.set(r.id as string, (r as any).name ?? null);
    }

    // 4) machines(id -> name)
    const machineMap = new Map<string, string | null>();
    if (machineIds.size) {
      const { data, error } = await admin.from("machines").select("id, name").in("id", Array.from(machineIds));
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      for (const r of data ?? []) machineMap.set(r.id as string, (r as any).name ?? null);
    }

    // 5) taxonomy_nodes(id -> name, code, requires_detail)
    const taxMap = new Map<string, { name: string | null; code: string | null; requires_detail: boolean | null }>();
    if (taxIds.size) {
      const { data, error } = await admin
        .from("taxonomy_nodes")
        .select("id, name, code, requires_detail")
        .in("id", Array.from(taxIds));
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      for (const r of data ?? []) {
        taxMap.set(r.id as string, {
          name: (r as any).name ?? null,
          code: (r as any).code ?? null,
          requires_detail: (r as any).requires_detail ?? null,
        });
      }
    }

    // 6) Construir filas
    const rows: PendingRow[] = [];
    for (const e of evs) {
      const line_name = e.line_id ? lineMap.get(e.line_id) ?? null : null;
      if (lineFilter && line_name !== lineFilter) continue;

      const machine_name = e.machine_id ? machineMap.get(e.machine_id) ?? null : null;
      const tax = e.taxonomy_node_id ? taxMap.get(e.taxonomy_node_id) ?? null : null;

      const duration_min =
        typeof e.duration_s === "number" && isFinite(e.duration_s) ? Math.max(0, Math.round(e.duration_s / 60)) : null;

      rows.push({
        id: e.id,
        line_code: line_name,
        machine_code: machine_name,
        started_at: e.started_at ?? null,
        ended_at: e.ended_at ?? null,
        duration_min,
        lvl1: null,
        lvl2: null,
        lvl3: tax?.name ?? null,
        classified: !!e.classified_at,
      });
    }

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}

