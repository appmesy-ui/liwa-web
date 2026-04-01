// app/api/kpis-series/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      { ok: false, rows: [], error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "liwa-kpis-series" } },
    db: { schema: "liwa" },
  });

  const { searchParams } = new URL(req.url);
  const toISO = searchParams.get("to") ?? new Date().toISOString();
  const fromParam = searchParams.get("from"); // si viene, se respeta
  const lineNameFilter = searchParams.get("line"); // filtraremos por lines.name si viene

  // --- producción (columnas reales)
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

  // fallback de rangos si no hay datos
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

  if (!prod.length) return NextResponse.json({ ok: true, rows: [] });

  // --- mapear lines.id -> lines.name
  const lineIds = Array.from(new Set(prod.map((r) => r.line_id).filter(Boolean)));
  const lineMap = new Map<string, { name: string | null }>();
  if (lineIds.length) {
    const { data: lines, error } = await admin.from("lines").select("id, name").in("id", lineIds);
    if (error) return NextResponse.json({ ok: false, rows: [], error: error.message }, { status: 500 });
    for (const l of lines ?? []) lineMap.set(l.id as string, { name: (l as any).name ?? null });
  }
  const matchLineName = (row: any): string | null => {
    const lid: string | null = row.line_id ?? null;
    if (!lid) return null;
    return lineMap.get(lid)?.name ?? null;
  };

  // --- traer solapes de paros por production.id (vista v_unplanned_by_slot)
  const prodIds = prod.map((r) => r.id as string);
  const unplannedMap = new Map<string, number>(); // production_id -> unplanned_overlap_s
  for (const batch of chunk(prodIds, 900)) {
    const { data, error } = await admin
      .from("v_unplanned_by_slot")
      .select("production_id, unplanned_overlap_s")
      .in("production_id", batch);
    if (error) return NextResponse.json({ ok: false, rows: [], error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      unplannedMap.set(row.production_id as string, Number(row.unplanned_overlap_s ?? 0));
    }
  }

  // --- construir series OEE por cada fila (bucket = ts_start)
  const rows: SeriesRow[] = [];
  for (const r of prod) {
    const planned = Number(r.planned_time_s ?? 0);
    const good = Number(r.good_units ?? 0);
    const scrap = Number(r.scrap_units ?? 0);
    const ideal_cycle_s = Number(r.ideal_cycle_s ?? 0);
    const ideal_ms = ideal_cycle_s > 0 ? ideal_cycle_s * 1000 : 0;

    const unplanned = Number(unplannedMap.get(r.id) ?? 0);
    const op = Math.max(planned - unplanned, 0);

    const availability = planned > 0 ? clamp01(op / planned) : 0;
    const performance = op > 0 ? clamp01(((good * ideal_ms) / 1000) / op) : 0;
    const quality = good > 0 ? clamp01((good - scrap) / good) : 0;
    const oee = clamp01(availability * performance * quality);

    const line_name = matchLineName(r);
    if (lineNameFilter && line_name !== lineNameFilter) continue;

    const ts = (r as any)?.ts_start ?? null;
    if (ts) rows.push({ bucket_ts: ts, line_code: line_name, oee });
  }

  return NextResponse.json({ ok: true, rows });
}
