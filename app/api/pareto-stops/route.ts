export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Level = "l1" | "l2" | "l3";
type Metric = "minutes" | "count";

function isoStartOfTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const p = url.searchParams;

    const scope = (p.get("scope") || "total") as "total" | "line";
    const lineCode = p.get("line") || undefined;

    const level = (p.get("level") || "l1") as Level;
    const metric = (p.get("metric") || "minutes") as Metric;
    const top = Math.max(1, parseInt(p.get("top") || "10", 10));
    const onlyClassified = p.get("only_classified") !== "false";
    const toYesterday = p.get("to_yesterday") !== "false";

    const parent_l1 = p.get("parent_l1") || undefined;
    const parent_l2 = p.get("parent_l2") || undefined;

    // rango
    const toParam = p.get("to");
    const fromParam = p.get("from");
    const end = toParam ? new Date(toParam) : toYesterday ? isoStartOfTodayUTC() : new Date();
    const start = fromParam ? new Date(fromParam) : new Date(end.getTime() - 30 * 24 * 3600 * 1000);

    // supabase
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env as any).NEXT_SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !serviceKey)
      return NextResponse.json({ ok: false, error: "Faltan credenciales Supabase" }, { status: 500 });
    const supabase = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

    // line_id opcional
    let lineId: string | undefined;
    if (scope === "line" && lineCode) {
      const { data: lrow, error: lerr } = await supabase
        .from("line")
        .select("id, code")
        .eq("code", lineCode)
        .maybeSingle();
      if (lerr) throw lerr;
      lineId = lrow?.id;
      if (!lineId) {
        return NextResponse.json({
          ok: true,
          meta: { scope, line: lineCode, level, metric, from: start.toISOString(), to: end.toISOString(), coverage_80_at: null, note: "Línea no encontrada" },
          categories: [],
        });
      }
    }

    // base
    let q = supabase
      .from("stop_event")
      .select("dur_min, ts_inicio, line_id, nivel_1, nivel_2, nivel_3, estado_clasif", {
        head: false,
        count: "exact",
      })
      .gte("ts_inicio", start.toISOString())
      .lt("ts_inicio", end.toISOString());

    if (onlyClassified) q = q.eq("estado_clasif", "OK");
    if (lineId) q = q.eq("line_id", lineId);
    if (parent_l1) q = q.eq("nivel_1", parent_l1);
    if (parent_l2) q = q.eq("nivel_2", parent_l2);

    const { data: rows, error } = await q.limit(5000);
    if (error) throw error;

    type Row = {
      dur_min: number | null;
      nivel_1: string | null;
      nivel_2: string | null;
      nivel_3: string | null;
    };

    // agrupado ESTRICTO por nivel
    const map = new Map<string, { label: string; minutes: number; count: number }>();
    for (const r of (rows || []) as Row[]) {
      let key = "";
      let label = "";

      if (level === "l1") {
        key = r.nivel_1 ?? "No clasificado (L1)";
        label = key;
      } else if (level === "l2") {
        key = r.nivel_2 ?? "Sin nivel 2";
        label = key;
      } else {
        // l3
        key = r.nivel_3 ?? "Sin nivel 3";
        label = key;
      }

      const o = map.get(key) || { label, minutes: 0, count: 0 };
      o.minutes += Number(r.dur_min ?? 0);
      o.count += 1;
      map.set(key, o);
    }

    let arr = Array.from(map.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      minutes: v.minutes,
      count: v.count,
    }));

    // ordenar/top
    arr.sort((a, b) => (metric === "minutes" ? b.minutes - a.minutes : b.count - a.count));
    if (top > 0 && arr.length > top) arr = arr.slice(0, top);

    const total =
      metric === "minutes"
        ? arr.reduce((s, x) => s + x.minutes, 0)
        : arr.reduce((s, x) => s + x.count, 0);

    let acc = 0;
    const categories = arr.map((x) => {
      const base = metric === "minutes" ? x.minutes : x.count;
      const pct = total > 0 ? (base * 100) / total : 0;
      acc += pct;
      return { key: x.key, label: x.label, minutes: x.minutes, count: x.count, pct, cumPct: acc };
    });

    const coverage80 = categories.findIndex((c) => c.cumPct >= 80);
    return NextResponse.json({
      ok: true,
      meta: {
        scope: lineId ? "line" : "total",
        line: lineCode ?? null,
        level,
        metric,
        from: start.toISOString(),
        to: end.toISOString(),
        coverage_80_at: coverage80 >= 0 ? coverage80 : null,
      },
      categories,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
