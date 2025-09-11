// app/api/kpis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type KpiRow = {
  line_code: string | null;
  planned_runtime_sec: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
};
type SeriesRow = { bucket_ts: string; line_code: string | null; oee: number | null };

const clamp01 = (n: number) => (isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

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
  });

  const { searchParams } = new URL(req.url);
  const toISO = searchParams.get("to") ?? new Date().toISOString();
  const fromParam = searchParams.get("from");           // aunque venga, haremos fallback si no hay datos
  const lineCodeFilter = searchParams.get("line");
  const step = (searchParams.get("step") ?? "all") as "all" | "kpis" | "series";

  const prodSel =
    "id, line_id, machine_id, window_start, window_end, planned_runtime_sec, unplanned_downtime_sec, produced_units, scrap_units, ideal_cycle_ms";

  async function fetchProd(fromISO: string | null) {
    let q = admin.from("production").select(prodSel).lte("window_start", toISO).order("window_start", { ascending: true });
    if (fromISO) q = q.gte("window_start", fromISO);
    const { data, error } = await q;
    if (error) throw new Error(`Error leyendo production: ${error.message}`);
    return data ?? [];
  }

  // intenta: fromParam (si viene) → 24h → 7d → 30d
  const ranges: (string | null)[] = [];
  if (fromParam) ranges.push(fromParam);
  ranges.push(
    new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  );

  let prod: any[] = [];
  for (const r of ranges) {
    prod = await fetchProd(r);
    if (prod.length > 0) break;
  }

  // catálogos para mapear línea
  const lineIds = new Set<string>();
  const machineIds = new Set<string>();
  for (const r of prod) {
    if (r.line_id) lineIds.add(r.line_id as string);
    if (r.machine_id) machineIds.add(r.machine_id as string);
  }

  const machineMap = new Map<string, { line_id: string | null }>();
  if (machineIds.size) {
    const { data: mach, error } = await admin.from("machines").select("id, line_id").in("id", Array.from(machineIds));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const m of mach ?? []) {
      machineMap.set(m.id as string, { line_id: (m as any).line_id ?? null });
      if ((m as any).line_id) lineIds.add((m as any).line_id);
    }
  }

  const lineMap = new Map<string, { code: string | null }>();
  if (lineIds.size) {
    const { data: lines, error } = await admin.from("lines").select("id, code").in("id", Array.from(lineIds));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const l of lines ?? []) lineMap.set(l.id as string, { code: (l as any).code ?? null });
  }

  const matchLineCode = (row: any): string | null => {
    let lid: string | null = row.line_id ?? null;
    if (!lid && row.machine_id) lid = machineMap.get(row.machine_id)?.line_id ?? null;
    if (!lid) return null;
    return lineMap.get(lid)?.code ?? null;
  };

  const byLine = new Map<string, { planned: number; unplanned: number; produced: number; scrap: number; ideal_ms_sum: number; ideal_n: number }>();
  const series: SeriesRow[] = [];

  for (const r of prod) {
    const planned = Number(r.planned_runtime_sec ?? 0);
    const unplanned = Number(r.unplanned_downtime_sec ?? 0);
    const produced = Number(r.produced_units ?? 0);
    const scrap = Number(r.scrap_units ?? 0);
    const ideal_ms = Number(r.ideal_cycle_ms ?? 0);
    const op = Math.max(planned - unplanned, 0);

    const availability = planned > 0 ? clamp01(op / planned) : 0;
    const perf = op > 0 ? clamp01(((produced * ideal_ms) / 1000) / op) : 0;
    const quality = produced > 0 ? clamp01((produced - scrap) / produced) : 0;
    const oee = clamp01(availability * perf * quality);

    const line_code = matchLineCode(r);
    if (lineCodeFilter && line_code !== lineCodeFilter) continue;

    const key = (line_code ?? "__UNKNOWN__").toUpperCase();
    if (!byLine.has(key)) byLine.set(key, { planned: 0, unplanned: 0, produced: 0, scrap: 0, ideal_ms_sum: 0, ideal_n: 0 });
    const acc = byLine.get(key)!;
    acc.planned += planned;
    acc.unplanned += unplanned;
    acc.produced += produced;
    acc.scrap += scrap;
    if (ideal_ms > 0) { acc.ideal_ms_sum += ideal_ms; acc.ideal_n += 1; }

    if (step !== "kpis") {
      const ts = (r as any)?.window_start ?? (r as any)?.recorded_at ?? null;
      if (ts) series.push({ bucket_ts: ts, line_code, oee });
    }
  }

  const rows: KpiRow[] = [];
  for (const [line_code, acc] of byLine.entries()) {
    const planned = acc.planned;
    const op = Math.max(planned - acc.unplanned, 0);
    const avgIdealMs = acc.ideal_n > 0 ? acc.ideal_ms_sum / acc.ideal_n : 0;

    const availability = planned > 0 ? clamp01(op / planned) : 0;
    const performance = op > 0 ? clamp01(((acc.produced * avgIdealMs) / 1000) / op) : 0;
    const quality = acc.produced > 0 ? clamp01((acc.produced - acc.scrap) / acc.produced) : 0;
    const oee = clamp01(availability * performance * quality);

    rows.push({
      line_code: line_code === "__UNKNOWN__" ? null : line_code,
      planned_runtime_sec: planned,
      availability,
      performance,
      quality,
      oee,
    });
  }
  rows.sort((a, b) => (b.oee ?? 0) - (a.oee ?? 0));

  const payload: any = { ok: true };
  if (step === "all" || step === "kpis") payload.rows = rows;
  if (step === "all" || step === "series") payload.series = series;

  return NextResponse.json(payload);
}


