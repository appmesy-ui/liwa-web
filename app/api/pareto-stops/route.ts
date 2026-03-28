// app/api/pareto-stops/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Level = "l1" | "l2";           // vista actual: 2 niveles (lvl2_name, lvl3_name)
type Metric = "minutes" | "count";
type PercentBase = "total" | "top";
type PlannedMode = "all" | "only" | "exclude";
type Source = "live" | "seed" | "both";

function startOfUTCDate(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}
function yesterdayStartUTC() {
  const today0 = startOfUTCDate(new Date());
  return new Date(today0.getTime() - 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.searchParams;

  const level = (p.get("level") || "l1").toLowerCase() as Level;
  const metric = (p.get("metric") || "minutes").toLowerCase() as Metric;
  const topK = Math.max(0, parseInt(p.get("top") || "10", 10));

  // Filtros
  const planned = ((p.get("planned") || "all").toLowerCase() as PlannedMode) || "all";
  const onlyClassified = p.get("only_classified") !== "false";

  // Línea / ámbito
  const scope = (p.get("scope") || "total") as "total" | "line";
  const line = p.get("line") || undefined;
  const lineField = (p.get("line_field") || "line_id").toLowerCase(); // line_id | line_code

  // Drill
  const parentL1 = p.get("parent_l1") || undefined;

  // Otros
  const percentBase = ((p.get("percent_base") || "total").toLowerCase() as PercentBase) || "total";
  const source = ((p.get("source") || "live").toLowerCase() as Source) || "live";

  // Filtros multi-tenant (si existen en la vista)
  const orgId = p.get("org_id");
  const plantId = p.get("plant_id");

  // Ventana
  let fromISO = p.get("from") || undefined;
  let toISO = p.get("to") || undefined;
  const toYesterday = p.get("to_yesterday") === "true";

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!fromISO || !toISO) {
      const toUTC = toYesterday ? yesterdayStartUTC() : startOfUTCDate(new Date());
      const days = parseInt(p.get("days") || "7", 10);
      const fromUTC = new Date(toUTC.getTime() - days * 24 * 60 * 60 * 1000);
      fromISO = fromUTC.toISOString();
      toISO = toUTC.toISOString();
    }

    const fromMs = new Date(fromISO!).getTime();
    const toMs = new Date(toISO!).getTime();
    if (!(fromMs < toMs)) {
      return NextResponse.json({ ok: false, error: "Rango [from,to) inválido" }, { status: 400 });
    }

    // Resolver line_id si vino code
    let lineIdForFilter: string | undefined;
    if (scope === "line" && line) {
      if (lineField === "line_id") {
        lineIdForFilter = line;
      } else if (lineField === "line_code") {
        const { data: row, error } = await supabase
          .schema("liwa")
          .from("lines")
          .select("id")
          .eq("code", line)
          .maybeSingle();
        if (error) {
          const msg = error.message || error.details || JSON.stringify(error);
          return NextResponse.json({ ok: false, error: `Line lookup failed: ${msg}` }, { status: 500 });
        }
        if (!row) {
          return NextResponse.json({ ok: false, error: `Line not found for ${lineField}=${line}` }, { status: 404 });
        }
        lineIdForFilter = row.id as string;
      } else {
        return NextResponse.json({ ok: false, error: `Invalid line_field: ${lineField}` }, { status: 400 });
      }
    }

    // Mapeo de niveles a columnas disponibles en la vista:
    // L1 -> lvl2_name  |  L2 -> lvl3_name
    const groupCol = level === "l1" ? "lvl2_name" : "lvl3_name";

    const makeQuery = (table: string) =>
      supabase
        .schema("liwa")
        .from(table)
        .select(`
          id,
          started_at,
          ended_at,
          duration_s,
          is_planned,
          status,
          lvl2_name,
          lvl3_name,
          line_id,
          org_id,
          plant_id
        `)
        // FILTRO DE SOLAPE con [from,to): started_at < to AND (ended_at IS NULL OR ended_at >= from)
        .lt("started_at", toISO!)
        .or(`ended_at.is.null,ended_at.gte.${fromISO!}`);

    const datasets: any[][] = [];

    if (source === "live" || source === "both") {
      let q = makeQuery("v_events_ui");
      if (onlyClassified) q = q.eq("status", "classified");
      if (planned === "only") q = q.eq("is_planned", true);
      if (planned === "exclude") q = q.eq("is_planned", false);
      if (scope === "line" && lineIdForFilter) q = q.eq("line_id", lineIdForFilter);
      if (level === "l2" && parentL1) q = q.eq("lvl2_name", parentL1); // drill
      if (orgId) q = q.eq("org_id", orgId);
      if (plantId) q = q.eq("plant_id", plantId);
      const { data, error } = await q.limit(50000);
      if (error) {
        const msg = error.message || error.details || JSON.stringify(error);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
      datasets.push(data || []);
    }

    if (source === "seed" || source === "both") {
      let q = makeQuery("pareto_seed"); // opcional/semillas
      if (onlyClassified) q = q.eq("status", "classified");
      if (planned === "only") q = q.eq("is_planned", true);
      if (planned === "exclude") q = q.eq("is_planned", false);
      if (scope === "line" && lineIdForFilter) q = q.eq("line_id", lineIdForFilter);
      if (level === "l2" && parentL1) q = q.eq("lvl2_name", parentL1);
      if (orgId) q = q.eq("org_id", orgId);
      if (plantId) q = q.eq("plant_id", plantId);
      const { data, error } = await q.limit(50000);
      if (error) {
        const msg = error.message || error.details || JSON.stringify(error);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
      datasets.push(data || []);
    }

    const rows = ([] as any[]).concat(...datasets);

    // === Agregación con solape ===
    type Agg = { name: string; minutes: number; count: number };
    const agg: Record<string, Agg> = {};

    const overlapSec = (s: string, e: string | null) => {
      const sMs = new Date(s).getTime();
      const eMs = e ? new Date(e).getTime() : Date.now();
      const ms = Math.max(0, Math.min(eMs, toMs) - Math.max(sMs, fromMs));
      return Math.floor(ms / 1000);
    };

    for (const ev of rows) {
      const nameRaw = (ev as any)[groupCol] as string | null;
      if (!nameRaw) continue;
      const name = String(nameRaw).trim();
      if (!name) continue;

      const secs = overlapSec(ev.started_at, ev.ended_at);
      if (secs <= 0) continue;

      if (!agg[name]) agg[name] = { name, minutes: 0, count: 0 };
      agg[name].minutes += secs / 60;
      agg[name].count += 1;
    }

    let list = Object.values(agg);
    const totalMinutesAll = list.reduce((s, r) => s + r.minutes, 0);
    const totalCountAll = list.reduce((s, r) => s + r.count, 0);

    // Orden por métrica desc
    list.sort((a, b) => {
      const va = metric === "minutes" ? a.minutes : a.count;
      const vb = metric === "minutes" ? b.minutes : b.count;
      if (vb !== va) return vb - va;
      return a.name.localeCompare(b.name, "es");
    });

    let rowsTop = list;
    if (topK > 0) rowsTop = list.slice(0, topK);

    const baseValue =
      metric === "minutes"
        ? (percentBase === "top" ? rowsTop.reduce((s, r) => s + r.minutes, 0) : totalMinutesAll)
        : (percentBase === "top" ? rowsTop.reduce((s, r) => s + r.count, 0) : totalCountAll);

    let acc = 0;
    const out = rowsTop.map((r, idx) => {
      const value = metric === "minutes" ? r.minutes : r.count;
      const pct = baseValue > 0 ? (value / baseValue) * 100 : 0;
      acc += pct;

      // Evitar "0 min" en barras reales: mínimo 1 si hubo solape
      const minutesRounded = Math.max(1, Math.round(r.minutes));

      return {
        key: `${level}|${r.name}`,
        label: r.name,
        minutes: minutesRounded,
        count: r.count,
        pct: Math.round(pct * 10) / 10,
        cumPct: Math.round(acc * 10) / 10,
      };
    });

    const coverage80 = out.findIndex((i) => i.cumPct >= 80);
    return NextResponse.json({
      ok: true,
      meta: {
        scope,
        line: line ?? null,
        level,
        metric,
        from: fromISO,
        to: toISO,
        coverage_80_at: coverage80 >= 0 ? coverage80 + 1 : null,
        total_minutes: Math.round(totalMinutesAll),
        total_count: totalCountAll,
      },
      categories: out,
    });
  } catch (e: any) {
    const msg = e?.message || e?.toString?.() || (typeof e === "object" ? JSON.stringify(e) : String(e));
    console.error("pareto-stops fatal:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
