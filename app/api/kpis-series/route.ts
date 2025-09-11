// app/api/kpis-series/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SeriesRow = { bucket_ts: string; line_code: string | null; oee: number | null };

const clamp01 = (n: number) => (isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, rows: [], error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "liwa-kpis-series" } },
  });

  const { searchParams } = new URL(req.url);
  const toISO = searchParams.get("to") ?? new Date().toISOString();
  const fromParam = searchParams.get("from"); // si viene lo respetamos pero con fallback si no hay datos
  const lineCodeFilter = searchParams.get("line");

  // --- producción (sin joins), filtrando por window_start y con fallbacks 24h→7d→30d
  const prodSel =
    "id, line_id, machine_id, window_start, planned_runtime_sec, unplanned_downtime_sec, produced_units, scrap_units, ideal_cycle_ms";

  async function fetchProd(fromISO: string | null) {
    let q = admin.from("production").select(prodSel).lte("window_start", toISO).order("window_start", {
      ascending: true,
    });
    if (fromISO) q = q.gte("window_start", fromISO);
    const { data, error } = await q;
    if (error) throw new Error(`Error leyendo production: ${error.message}`);
    return data ?? [];
  }

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

  // --- catálogos para mapear code de línea
  const lineIds = new Set<string>();
  const machineIds = new Set<string>();
  for (const r of prod) {
    if (r.line_id) lineIds.add(r.line_id as string);
    if (r.machine_id) machineIds.add(r.machine_id as string);
  }

  const machineMap = new Map<string, { line_id: string | null }>();
  if (machineIds.size) {
    const { data: mach, error } = await admin.from("machines").select("id, line_id").in("id", Array.from(machineIds));
    if (error) return NextResponse.json({ ok: false, rows: [], error: error.message }, { status: 500 });
    for (const m of mach ?? []) {
      machineMap.set(m.id as string, { line_id: (m as any).line_id ?? null });
      if ((m as any).line_id) lineIds.add((m as any).line_id);
    }
  }

  const lineMap = new Map<string, { code: string | null }>();
  if (lineIds.size) {
    const { data: lines, error } = await admin.from("lines").select("id, code").in("id", Array.from(lineIds));
    if (error) return NextResponse.json({ ok: false, rows: [], error: error.message }, { status: 500 });
    for (const l of lines ?? []) lineMap.set(l.id as string, { code: (l as any).code ?? null });
  }

  const matchLineCode = (row: any): string | null => {
    let lid: string | null = row.line_id ?? null;
    if (!lid && row.machine_id) lid = machineMap.get(row.machine_id)?.line_id ?? null;
    if (!lid) return null;
    return lineMap.get(lid)?.code ?? null;
  };

  // --- series OEE
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

    const ts = (r as any)?.window_start ?? null;
    if (ts) series.push({ bucket_ts: ts, line_code, oee });
  }

  return NextResponse.json({ ok: true, rows: series });
}
