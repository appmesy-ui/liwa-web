// app/api/lines/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type PlannedMode = "all" | "only" | "exclude";

function startOfUTCDate(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}
function yesterdayStartUTC() {
  const today0 = startOfUTCDate(new Date());
  return new Date(today0.getTime() - 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const p = url.searchParams;

    let fromISO = p.get("from") || undefined;
    let toISO = p.get("to") || undefined;
    const toYesterday = p.get("to_yesterday") === "true";
    const onlyClassified = p.get("only_classified") !== "false"; // default true
    const planned = ((p.get("planned") || "all").toLowerCase() as PlannedMode) || "all";

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

    let q = supabase
      .schema("liwa")
      .from("v_events_ui")
      .select("line_id, count:line_id", { count: "exact", head: false })
      .gte("started_at", fromISO!)
      .lt("started_at", toISO!);

    if (onlyClassified) q = q.eq("classified_ui", true);
    if (planned === "only") q = q.eq("is_planned", true);
    if (planned === "exclude") q = q.eq("is_planned", false);

    const { data: evs, error: evErr } = await q;
    if (evErr) {
      const msg = evErr.message || evErr.details || JSON.stringify(evErr);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    const idCounts = new Map<string, number>();
    for (const row of evs || []) {
      const id = row.line_id as string | null;
      if (!id) continue;
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    const ids = [...idCounts.keys()];
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, rows: [], meta: { from: fromISO, to: toISO } });
    }

    const { data: lines, error: lErr } = await supabase
      .schema("liwa")
      .from("lines")
      .select("id, code, name")
      .in("id", ids);

    if (lErr) {
      const msg = lErr.message || lErr.details || JSON.stringify(lErr);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    const rows = (lines || [])
      .map((ln) => ({
        id: ln.id as string,
        code: (ln.code as string) || null,
        name: (ln.name as string) || null,
        events: idCounts.get(ln.id as string) || 0,
        label: ((ln.code || "") + (ln.name ? " · " + ln.name : "")) || (ln.name || (ln.id as string)),
      }))
      .sort((a, b) => (b.events - a.events) || (a.code || "").localeCompare(b.code || "", "es"));

    return NextResponse.json({
      ok: true,
      rows,
      meta: { from: fromISO, to: toISO, only_classified: onlyClassified, planned },
    });
  } catch (e: any) {
    const msg = e?.message || e?.toString?.() || (typeof e === "object" ? JSON.stringify(e) : String(e));
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
