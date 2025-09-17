// app/api/kpis/route.ts 
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type KpiRow = {
  line_code: string | null; // devolvemos lines.name
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
};

type SeriesRow = { bucket_ts: string; line_code: string | null; oee: number | null };

const clamp01 = (n: number) => (isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

// pequeño helper para trocear arrays en lotes seguros para `.in()`
function chunk<T>(arr: T[], size = 900) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: NextRequest) {
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
    global: { headers: { "X-Client-Info": "liwa-kpis" } },
    db: { schema: "liwa" },
  });

  const { searchParams } = new URL(req.url);
  const toISO = searchParams.get("to") ?? new Date().toISOString();
  const fromParam = searchParams.get("from"); // rango solicitado por el dashboard
  const lineFilter = searchParams.get("line"); // compararemos con lines.name
  const step = (searchParams.get("step") ?? "all") as "all" | "kpis" | "series";

  // Columnas reales de liwa.production
  const prodSel = [
    "id",
    "line_id",
    "machine_id",
    "ts_start",
    "ts_end",
    "planned_time_s",
    "run_time_s",
    "good_units",
    "scrap_units",
    "ideal_cycle_s",
  ].join(", ");

  async function fetchProd(fromISO: string | null) {
    let q = admin.from("production").select(prodSel).lte("ts_start", toISO).order("ts_start", { ascending: true });
    if (fromISO) q = q.gte("ts_start", fromISO);
    const { data, error } = await q;
    if (error) throw new Error(`Error leyendo production: ${error.message}`);
    return data ?? [];
  }

  // Rango escalonado por si no hay datos recientes (solo para KPIs)
  const ranges: (string | null)[] = [];
  if (fromParam) ranges.push(fromParam);
  ranges.push(
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  );

  let prod: any[] = [];
  let fromUsed: string | null = null;
  for (const r of ranges) {
    const tryData = await fetchProd(r);
    if (tryData.length > 0) {
      prod = tryData;
      fromUsed = r;
      break;
    }
  }
  if (!prod.length && fromParam) {
    prod = await fetchProd(fromParam);
    fromUsed = fromParam;
  }

  // ===== Si no hay producción, aún así devolvemos pending para el rango SOLICITADO =====
  if (!prod.length) {
    const pendingFrom = fromParam ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const pendingTo = toISO;

    let qPending = admin
      .from("v_pending_events_ui")
      .select("id", { count: "exact", head: true })
      .lt("started_at", pendingTo)
      .or(`ended_at.is.null,ended_at.gte.${pendingFrom}`);

    if (lineFilter) {
      qPending = qPending.ilike("line_name", lineFilter);
    }

    const { count: pendingCount = 0, error: pendingErr }: any = await qPending;
    if (pendingErr && pendingErr.code !== "PGRST116") {
      return NextResponse.json({ ok: false, error: pendingErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows: [], series: [], pending: pendingCount });
  }

  // Mapeo lines.id -> lines.name
  const lineIds = Array.from(new Set(prod.map((r) => r.line_id).filter(Boolean)));
  const lineMap = new Map<string, { name: string | null }>();
  if (lineIds.length) {
    const { data: lines, error } = await admin.from("lines").select("id, name").in("id", lineIds);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const l of lines ?? []) lineMap.set(l.id as string, { name: (l as any).name ?? null });
  }
  const matchLineName = (row: any): string | null => {
    const lid: string | null = row.line_id ?? null;
    if (!lid) return null;
    return lineMap.get(lid)?.name ?? null;
  };

  // === Unplanned por production.id desde la vista v_unplanned_by_slot ===
  const prodIds = prod.map((r) => r.id as string);
  const unplannedMap = new Map<string, number>();
  for (const batch of chunk(prodIds, 900)) {
    const { data, error } = await admin
      .from("v_unplanned_by_slot")
      .select("production_id, unplanned_overlap_s")
      .in("production_id", batch);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      unplannedMap.set(row.production_id as string, Number(row.unplanned_overlap_s ?? 0));
    }
  }

  // Acumuladores por línea
  const byLine = new Map<
    string,
    { planned: number; unplanned_from_events: number; produced: number; scrap: number; ideal_ms_sum: number; ideal_n: number }
  >();

  const series: SeriesRow[] = [];

  for (const r of prod) {
    const planned_time_s = Number(r.planned_time_s ?? 0);
    const good_units = Number(r.good_units ?? 0);
    const scrap_units = Number(r.scrap_units ?? 0);
    const ideal_cycle_s = Number(r.ideal_cycle_s ?? 0);

    const unplanned_s = Number(unplannedMap.get(r.id) ?? 0);
    const op_s = Math.max(planned_time_s - unplanned_s, 0);

    const ideal_ms = ideal_cycle_s > 0 ? ideal_cycle_s * 1000 : 0;

    const availability = planned_time_s > 0 ? clamp01(op_s / planned_time_s) : 0;
    const perf = op_s > 0 ? clamp01(((good_units * ideal_ms) / 1000) / op_s) : 0;
    const denomUnits = good_units + scrap_units;
    const quality = denomUnits > 0 ? clamp01(good_units / denomUnits) : 0;
    const oee = clamp01(availability * perf * quality);

    const line_name = matchLineName(r);
    if (lineFilter && line_name !== lineFilter) continue;
    const key = (line_name ?? "__UNKNOWN__").toUpperCase();

    if (!byLine.has(key)) {
      byLine.set(key, { planned: 0, unplanned_from_events: 0, produced: 0, scrap: 0, ideal_ms_sum: 0, ideal_n: 0 });
    }
    const acc = byLine.get(key)!;
    acc.planned += planned_time_s;
    acc.unplanned_from_events += unplanned_s;
    acc.produced += good_units;
    acc.scrap += scrap_units;
    if (ideal_ms > 0) {
      acc.ideal_ms_sum += ideal_ms;
      acc.ideal_n += 1;
    }

    if (step !== "kpis") {
      const ts = (r as any)?.ts_start ?? null;
      if (ts) series.push({ bucket_ts: ts, line_code: line_name, oee });
    }
  }

  // construir filas KPI
  const rows: KpiRow[] = [];
  for (const [line_name, acc] of byLine.entries()) {
    const planned = acc.planned;
    const unplanned = acc.unplanned_from_events;
    const op = Math.max(planned - unplanned, 0);
    const avgIdealMs = acc.ideal_n > 0 ? acc.ideal_ms_sum / acc.ideal_n : 0;

    const availability = planned > 0 ? clamp01(op / planned) : 0;
    const performance = op > 0 ? clamp01(((acc.produced * avgIdealMs) / 1000) / op) : 0;
    const denomUnits = acc.produced + acc.scrap;
    const quality = denomUnits > 0 ? clamp01(acc.produced / denomUnits) : 0;
    const oee = clamp01(availability * performance * quality);

    rows.push({
      line_code: line_name === "__UNKNOWN__" ? null : line_name,
      planned_runtime_sec: planned,
      availability,
      performance,
      quality,
      oee,
    });
  }
  rows.sort((a, b) => (b.oee ?? 0) - (a.oee ?? 0));

  // === Contador de pendientes: solape con [from, to) ===
  const pendingFrom = fromParam ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const pendingTo = toISO;

  let qPending = admin
    .from("v_pending_events_ui")
    .select("id", { count: "exact", head: true })
    .lt("started_at", pendingTo)
    .or(`ended_at.is.null,ended_at.gte.${pendingFrom}`);

  if (lineFilter) {
    qPending = qPending.ilike("line_name", lineFilter);
  }

  const { count: pendingCount = 0, error: pendingErr }: any = await qPending;
  if (pendingErr && pendingErr.code !== "PGRST116") {
    return NextResponse.json({ ok: false, error: pendingErr.message }, { status: 500 });
  }

  const payload: any = { ok: true, pending: pendingCount };
  if (step === "all" || step === "kpis") payload.rows = rows;
  if (step === "all" || step === "series") payload.series = series;

  return NextResponse.json(payload);
}

