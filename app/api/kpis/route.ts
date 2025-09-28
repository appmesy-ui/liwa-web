// app/api/kpis/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** Fila para la tabla de KPIs */
type RowUI = {
  line_code: string | null;
  plant_id: string | null;
  planned_runtime_sec: number | null;
  availability: number | null; // 0–1
  performance: number | null;  // 0–1
  quality: number | null;      // 0–1
  oee: number | null;          // 0–1
  trend_pp: number;            // delta (ventana actual - ventana anterior) en puntos porcentuales
};

type SeriesPointFlat = {
  bucket_ts: string;
  line_code: string | null;
  oee: number | null; // 0–1
};

type OeeRow = {
  line_id: string;
  plant_id: string | null;
  planned_time_s: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  shift_instance_id: string;
};

export async function GET(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "liwa-kpis" } },
      db: { schema: "liwa" },
    });

    // ====== Parámetros ======
    const { searchParams } = new URL(req.url);
    const toISO = searchParams.get("to") ?? new Date().toISOString();
    const fromISO =
      searchParams.get("from") ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const step = (searchParams.get("step") ?? "all") as "all" | "kpis" | "series";
    const lineFilter = searchParams.get("line"); // filtra por nombre/código de línea

    // Duración y bucket (hora para <=3 días; día si no)
    const fromMs = new Date(fromISO).getTime();
    const toMs = new Date(toISO).getTime();
    const windowMs = Math.max(0, toMs - fromMs);
    const bucket: "hour" | "day" = windowMs <= 3 * 24 * 3600 * 1000 ? "hour" : "day";

    // Ventana anterior (misma duración inmediatamente previa)
    const prevToISO = new Date(fromMs).toISOString();
    const prevFromISO = new Date(fromMs - windowMs).toISOString();

    // ===== Helpers =====
    const toNum = (v: any) => Number(v ?? 0);
    const fmtBucket = (iso: string) => {
      const d = new Date(iso);
      if (bucket === "day") {
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
      }
      return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
      ).toISOString();
    };

    // Buscar shifts que se SOLAPAN con [from, to): starts_at < to  AND  ends_at > from
    const findShiftIds = async (from: string, to: string) => {
      const { data, error } = await admin
        .from("v_shift_instances_resolved")
        .select("shift_instance_id, starts_at, ends_at")
        .lt("starts_at", to)
        .gt("ends_at", from);
      if (error) throw error;
      const ids = (data ?? []).map((r: any) => r.shift_instance_id as string);
      const timeByShift = new Map<string, { start: string; end: string }>();
      for (const r of data ?? []) {
        timeByShift.set((r as any).shift_instance_id, {
          start: (r as any).starts_at,
          end: (r as any).ends_at,
        });
      }
      return { ids, timeByShift };
    };

    // Trae OEE por shift para una lista de shifts
    const fetchOeeByShifts = async (shiftIds: string[]) => {
      if (!shiftIds.length) return [] as OeeRow[];
      const { data, error } = await admin
        .from("v_oee_by_shift")
        .select(
          "line_id, plant_id, planned_time_s, availability, performance, quality, oee, shift_instance_id"
        )
        .in("shift_instance_id", shiftIds)
        .limit(50000);
      if (error) throw error;
      return (data ?? []) as unknown as OeeRow[];
    };

    // Nombres de líneas
    const fetchLineNames = async (lineIds: string[]) => {
      if (!lineIds.length) return new Map<string, string | null>();
      const { data, error } = await admin
        .from("lines")
        .select("id, name")
        .in("id", Array.from(new Set(lineIds)));
      if (error) throw error;
      const map = new Map<string, string | null>();
      for (const l of data ?? []) map.set((l as any).id, (l as any).name ?? null);
      return map;
    };

    // Agrega KPIs ponderados por línea
    const aggregateByLine = (rows: OeeRow[]) => {
      type Acc = {
        plant_id: string | null;
        totalPlan: number;
        sumA: number;
        sumP: number;
        sumQ: number;
        sumO: number;
      };
      const byLine = new Map<string, Acc>();
      for (const r of rows) {
        const lid = r.line_id;
        const w = Math.max(0, toNum(r.planned_time_s));
        if (!w) continue; // evita dividir por 0 y “cero contaminante”
        if (!byLine.has(lid)) {
          byLine.set(lid, {
            plant_id: r.plant_id ?? null,
            totalPlan: 0,
            sumA: 0,
            sumP: 0,
            sumQ: 0,
            sumO: 0,
          });
        }
        const acc = byLine.get(lid)!;
        acc.totalPlan += w;
        acc.sumA += toNum(r.availability) * w;
        acc.sumP += toNum(r.performance) * w;
        acc.sumQ += toNum(r.quality) * w;
        acc.sumO += toNum(r.oee) * w;
      }
      return byLine;
    };

    // ====== Ventana actual ======
    const { ids: nowShiftIds, timeByShift: nowTimes } = await findShiftIds(fromISO, toISO);
    const nowRows = await fetchOeeByShifts(nowShiftIds);
    const nowAgg = aggregateByLine(nowRows);

    // Si no hay datos en la ventana actual, responder vacío (y evitar “ceros” aparentes)
    if (nowAgg.size === 0) {
      const pending = await countPending(admin, fromISO, toISO, lineFilter);
      const payload: any = { ok: true, pending, rows: [], series: [] };
      if (step === "kpis") delete payload.series;
      if (step === "series") delete payload.rows;
      return NextResponse.json(payload);
    }

    // ====== Ventana anterior ======
    const { ids: prevShiftIds } = await findShiftIds(prevFromISO, prevToISO);
    const prevRows = await fetchOeeByShifts(prevShiftIds);
    const prevAgg = aggregateByLine(prevRows);

    // ====== Nombres de líneas ======
    const allLineIds = [
      ...new Set([...nowRows.map(r => r.line_id), ...prevRows.map(r => r.line_id)]),
    ];
    const nameById = await fetchLineNames(allLineIds);

    // ====== Series planas para sparkline (ventana actual) ======
    // Bucketing por hora o día usando starts_at del shift
    type BAcc = { w: number; sumO: number; t: string };
    const byLineBucket = new Map<string, Map<string, BAcc>>();

    for (const r of nowRows) {
      const ts = nowTimes.get(r.shift_instance_id);
      if (!ts) continue;
      const key = fmtBucket(ts.start);
      const lid = r.line_id;
      const w = Math.max(1, (new Date(ts.end).getTime() - new Date(ts.start).getTime()) / 1000);
      const o = toNum(r.oee);

      if (!byLineBucket.has(lid)) byLineBucket.set(lid, new Map());
      const inner = byLineBucket.get(lid)!;
      if (!inner.has(key)) inner.set(key, { w: 0, sumO: 0, t: key });
      const acc = inner.get(key)!;
      acc.w += w;
      acc.sumO += o * w;
    }

    const series: SeriesPointFlat[] = [];
    for (const [lid, bucketMap] of byLineBucket.entries()) {
      const line_code = nameById.get(lid) ?? null;
      for (const b of Array.from(bucketMap.values()).sort((a, b) => a.t.localeCompare(b.t))) {
        const oee = b.w ? b.sumO / b.w : 0;
        series.push({ bucket_ts: b.t, line_code, oee });
      }
    }

    // ====== Construir filas con tendencia (actual vs anterior) ======
    let rows: RowUI[] = [];
    for (const [lid, acc] of nowAgg.entries()) {
      const name = nameById.get(lid) ?? null;
      const w = Math.max(1, acc.totalPlan);
      const curA = acc.sumA / w;
      const curP = acc.sumP / w;
      const curQ = acc.sumQ / w;
      const curO = acc.sumO / w;

      let trend_pp = 0;
      const prev = prevAgg.get(lid);
      if (prev) {
        const pw = Math.max(1, prev.totalPlan);
        const prevO = prev.sumO / pw;
        trend_pp = (curO - prevO) * 100; // puntos porcentuales
      } else {
        // si no hay ventana anterior para esa línea, deja 0 (neutro)
        trend_pp = 0;
      }

      rows.push({
        line_code: name,
        plant_id: acc.plant_id,
        planned_runtime_sec: acc.totalPlan,
        availability: curA,
        performance: curP,
        quality: curQ,
        oee: curO,
        trend_pp: +trend_pp.toFixed(1),
      });
    }

    // Filtro por línea si se pidió (match exacto case-insensitive sobre nombre/código)
    if (lineFilter) {
      const needle = lineFilter.toUpperCase();
      rows = rows.filter((x) => (x.line_code ?? "").toUpperCase() === needle);
    }

    // Orden por OEE desc
    rows.sort((a, b) => (b.oee ?? 0) - (a.oee ?? 0));

    // Paros sin clasificar
    const pending = await countPending(admin, fromISO, toISO, lineFilter);

    // ====== Respuesta ======
    const payload: any = { ok: true, pending };
    if (step === "all" || step === "kpis") payload.rows = rows;
    if (step === "all" || step === "series") payload.series = series;

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("API /kpis error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

/** Conteo de paros sin clasificar en el rango [fromISO, toISO) */
async function countPending(
  admin: ReturnType<typeof createClient>,
  fromISO: string,
  toISO: string,
  lineFilter: string | null
): Promise<number> {
  const base = admin
    .from("v_pending_events_ui")
    .select("id", { count: "exact" })
    .eq("is_pending", true)
    .lt("started_at", toISO)
    .or(`ended_at.is.null,ended_at.gte.${fromISO}`);

  if (!lineFilter) {
    const { count, error } = await base.range(0, 0);
    if (error && (error as any).code !== "PGRST116") throw error;
    return count ?? 0;
  }

  const pat = `%${lineFilter}%`;
  const byName = base.clone().ilike("line_name", pat);
  const { count: c1, error: e1 } = await byName.range(0, 0);
  if (e1 && (e1 as any).code !== "PGRST116") throw e1;
  if ((c1 ?? 0) > 0) return c1 ?? 0;

  const byCode = base.clone().ilike("line_code", pat);
  const { count: c2, error: e2 } = await byCode.range(0, 0);
  if (e2 && (e2 as any).code !== "PGRST116") throw e2;

  return c2 ?? 0;
}
