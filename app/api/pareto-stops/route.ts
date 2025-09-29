// app/api/pareto-stops/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Level = "l1" | "l2" | "l3";
type Metric = "minutes" | "count";
type PercentBase = "total" | "top";
type PlannedMode = "all" | "only" | "exclude";
type Source = "live" | "seed" | "both"; // opcional, por si usas la tabla seed

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
  const onlyClassified = p.get("only_classified") !== "false"; // default true

  // Línea (una sola)
  const line = p.get("line") || undefined;             // puede ser id o code
  const lineField = (p.get("line_field") || "line_id").toLowerCase(); // line_id | line_code

  // Drill
  const parentL1 = p.get("parent_l1") || undefined;
  const parentL2 = p.get("parent_l2") || undefined;

  // Otros
  const percentBase = ((p.get("percent_base") || "total").toLowerCase() as PercentBase) || "total";
  const source = ((p.get("source") || "live").toLowerCase() as Source) || "live"; // opcional

  // Ventana de tiempo
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

    // Resolver line_id si vino un code
    let lineIdForFilter: string | undefined;
    if (line) {
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

    // Columna por nivel
    const groupCol = level === "l1" ? "lvl1_name" : level === "l2" ? "lvl2_name" : "lvl3_name";

    // Helper para armar query base
    const makeQuery = (table: string) =>
      supabase
        .schema("liwa")
        .from(table)
        .select(`
          ${groupCol},
          duration_s,
          is_planned,
          classified_ui,
          lvl1_name,
          lvl2_name,
          line_id,
          started_at
        `)
        .gte("started_at", fromISO!)
        .lt("started_at", toISO!);

    // Traer datos (v_events_ui y/o pareto_seed si usas source)
    const datasets: any[][] = [];

    if (source === "live" || source === "both") {
      let q = makeQuery("v_events_ui");
      if (onlyClassified) q = q.eq("classified_ui", true);
      if (planned === "only") q = q.eq("is_planned", true);
      if (planned === "exclude") q = q.eq("is_planned", false);
      if (lineIdForFilter) q = q.eq("line_id", lineIdForFilter);
      if (parentL1) q = q.eq("lvl1_name", parentL1);
      if (parentL2) q = q.eq("lvl2_name", parentL2);

      const { data, error } = await q;
      if (error) {
        const msg = error.message || error.details || JSON.stringify(error);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
      datasets.push(data || []);
    }

    if (source === "seed" || source === "both") {
      let q = makeQuery("pareto_seed"); // opcional: solo si la tienes
      if (onlyClassified) q = q.eq("classified_ui", true);
      if (planned === "only") q = q.eq("is_planned", true);
      if (planned === "exclude") q = q.eq("is_planned", false);
      if (lineIdForFilter) q = q.eq("line_id", lineIdForFilter);
      if (parentL1) q = q.eq("lvl1_name", parentL1);
      if (parentL2) q = q.eq("lvl2_name", parentL2);

      const { data, error } = await q;
      if (error) {
        const msg = error.message || error.details || JSON.stringify(error);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
      datasets.push(data || []);
    }

    const data = ([] as any[]).concat(...datasets);

    // Agregación
    type Agg = { name: string; minutes: number; count: number };
    const agg: Record<string, Agg> = {};

    for (const ev of data || []) {
      let raw = (ev as any)[groupCol] as string | null;
      if (level === "l3" && !raw) raw = "Sin nivel 3";
      if (!raw) continue;
      const name = String(raw).trim();
      if (!name) continue;

      if (!agg[name]) agg[name] = { name, minutes: 0, count: 0 };
      agg[name].minutes += (ev.duration_s || 0) / 60;
      agg[name].count += 1;
    }

    let rowsAll = Object.values(agg);
    const totalMinutesAll = rowsAll.reduce((s, r) => s + r.minutes, 0);
    const totalCountAll = rowsAll.reduce((s, r) => s + r.count, 0);

    rowsAll.sort((a, b) => {
      const va = metric === "minutes" ? a.minutes : a.count;
      const vb = metric === "minutes" ? b.minutes : b.count;
      if (vb !== va) return vb - va;
      return a.name.localeCompare(b.name, "es");
    });

    let rows = rowsAll;
    if (topK > 0) rows = rowsAll.slice(0, topK);

    const baseValue =
      metric === "minutes"
        ? (percentBase === "top" ? rows.reduce((s, r) => s + r.minutes, 0) : totalMinutesAll)
        : (percentBase === "top" ? rows.reduce((s, r) => s + r.count, 0) : totalCountAll);

    let acc = 0;
    const out = rows.map((r, idx) => {
      const value = metric === "minutes" ? r.minutes : r.count;
      const pct = baseValue > 0 ? (value / baseValue) * 100 : 0;
      acc += pct;
      return {
        rank: idx + 1,
        name: r.name,
        minutes: Math.round(r.minutes * 100) / 100,
        count: Math.round(r.count),
        pct: Math.round(pct * 10) / 10,
        pct_acc: Math.round(acc * 10) / 10,
      };
    });

    return NextResponse.json({
      ok: true,
      rows: out,
      meta: {
        level, metric,
        from: fromISO, to: toISO,
        planned, only_classified: onlyClassified,
        top: topK, percent_base: percentBase,
        total_minutes: Math.round(totalMinutesAll * 100) / 100,
        total_count: totalCountAll,
        parents: { l1: parentL1 ?? null, l2: parentL2 ?? null },
        line: line ?? null, line_field: lineField,
        source,
      },
    });
  } catch (e: any) {
    const msg = e?.message || e?.toString?.() || (typeof e === "object" ? JSON.stringify(e) : String(e));
    console.error("pareto-stops fatal:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
